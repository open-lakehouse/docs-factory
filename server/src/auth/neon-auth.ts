// Prod auth provider: Neon Auth (GitHub OAuth) + the reviewer allowlist.
//
// The bearer the client sends is Neon Auth's SIGNED JWT (Better Auth's
// `set-auth-jwt`), not the opaque session token — so we authenticate it the
// stateless, rotation-proof way: verify its signature against Neon Auth's JWKS
// (EdDSA) and check iss/aud/exp. The verified claims give us a TRUSTED user id
// (`sub`) and email. The verification path is:
//   1. read the bearer (or cookie) from the request
//   2. verify it as a JWT via the JWKS at NEON_AUTH_URL/.well-known/jwks.json
//      (issuer + audience = NEON_AUTH_URL's host); trust `sub` + `email`
//   3. enrich: look up neon_auth.account by that user id for the GitHub
//      login/accountId (see below), and gather the user's emails
//   4. look the login(s) and ANY email up in reviewer_allowlist → role
//
// Step 3 subtlety: neon_auth.account stores GitHub's numeric OAuth account id in
// "accountId", NOT the @handle. To let the allowlist be seeded by github_login,
// we exchange the account's stored "accessToken" for the real login via GitHub's
// /user API, memoized per user id so it isn't a per-request network hit. We also
// fetch the account's /user/emails (verified only). If either call fails we fall
// back (numeric id for the login, the JWT/user-row email), so verification never
// crashes.
//
// The account enrichment is best-effort: a validly-signed JWT is already an
// authenticated identity even if the github account row is absent — we then match
// the allowlist on the JWT email alone rather than collapsing to anonymous (which
// would lock out an allowlisted user). The resolver fails closed (anonymous) only
// when there is no valid JWT — auth is additive, so an unauthenticated request
// simply sees published content.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "../db.js";
import { lookupRole } from "../allowlist.js";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";
// GitHub @handle / verified-email resolution (memoized). Shared with the
// maintainer admin discovery view (server/src/services/review.ts).
import { resolveLogin, resolveEmails } from "./github-identity.js";

interface NeonIdentity {
  /** Stable Neon Auth user id — the key for authorship + read-state. */
  userId: string;
  /**
   * GitHub @handle. Resolved from the OAuth access token (see resolveLogin);
   * falls back to the numeric account id if the GitHub API is unreachable. Used
   * as the viewer's display login.
   */
  login: string;
  /**
   * Every candidate the allowlist's github_login may be seeded with: the resolved
   * @handle AND the numeric account id. When the /user token exchange fails,
   * `login` is already the numeric id, but when it succeeds we still want a
   * numeric-id-seeded row to match — so both travel here.
   */
  logins: string[];
  name?: string;
  /**
   * Every email we can attribute to this identity: the primary Neon Auth stores
   * on the user row, plus all GitHub-verified addresses (see resolveEmails).
   * The allowlist matches on ANY of these, so an email-seeded row hits even when
   * the seeded address isn't the user's current GitHub primary.
   */
  emails: string[];
}

/**
 * Extract the bearer from an Authorization header, falling back to the Neon Auth
 * session cookie. In prod the client sends the signed JWT as `Authorization:
 * Bearer` (see site/src/lib/auth-actions.ts) and this returns it; the cookie
 * fallback is for the raw same-host case. Whatever is returned is handed to
 * verifyJwt, which only accepts a JWKS-verifiable JWT.
 */
export function sessionToken(header: Headers): string | undefined {
  const auth = header.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = header.get("cookie");
  if (!cookie) return undefined;
  // Neon Auth sets its session cookie in `__Secure-neonauth.session_token`
  // (Secure, HttpOnly, SameSite=None) — per the Neon Auth authentication-flow
  // docs. We store the base name and match with or without the `__Secure-`/
  // `__Host-` prefix, so the same code works on http dev and https prod.
  const name = "neonauth.session_token";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name || k === `__Secure-${name}` || k === `__Host-${name}`) {
      return decodeURIComponent(v.join("="));
    }
  }
  return undefined;
}

/**
 * Neon Auth base URL (the full URL incl. its `/<db>/auth` path, matching the
 * client's VITE_NEON_AUTH_URL). It's the JWT issuer/audience and the base for
 * the JWKS endpoint. Set on the Function as NEON_AUTH_URL at deploy.
 */
function authBaseUrl(): string | undefined {
  const v = process.env.NEON_AUTH_URL?.trim();
  return v && v.length ? v.replace(/\/+$/, "") : undefined;
}

// Remote JWKS, created once and cached (jose refetches keys on unknown `kid`,
// with its own cooldown). Keyed by base URL so a config change rebuilds it.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksBase: string | undefined;
function getJwks(base: string) {
  if (!jwks || jwksBase !== base) {
    jwks = createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`));
    jwksBase = base;
  }
  return jwks;
}

/** The subset of Neon Auth JWT claims we rely on. */
interface AuthClaims {
  sub: string;
  email?: string;
  name?: string;
}

/**
 * Verify the bearer as a Neon Auth JWT (EdDSA, via JWKS), checking signature,
 * issuer, audience, and expiry. Returns the trusted claims, or null on any
 * failure (bad signature, expired, wrong iss/aud, unconfigured) so the caller
 * treats the request as anonymous.
 *
 * Note the iss/aud vs. JWKS-URL split: Neon Auth's JWKS lives under the full
 * auth base path (`{base}/.well-known/jwks.json`), but the token's `iss`/`aud`
 * are the base's ORIGIN (scheme+host, no path). So we fetch keys from the full
 * base but validate iss/aud against the origin.
 */
async function verifyJwt(token: string): Promise<AuthClaims | null> {
  const base = authBaseUrl();
  if (!base) return null;
  return verifyJwtWith(token, base, getJwks(base));
}

/**
 * The testable core of verifyJwt: verify `token` against `keys` with iss/aud =
 * the ORIGIN of `base` (see verifyJwt's note on the path-vs-origin split).
 * Exported for unit tests, which pass a locally-generated key set.
 */
export async function verifyJwtWith(
  token: string,
  base: string,
  keys: Parameters<typeof jwtVerify>[1],
): Promise<AuthClaims | null> {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return null; // base isn't a valid URL.
  }
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: origin, audience: origin });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  } catch {
    // Signature/exp/iss/aud failure, or a raw opaque token that isn't a JWT.
    return null;
  }
}

/**
 * Resolve a bearer to a GitHub identity: verify the JWT for a trusted user id +
 * email, then best-effort enrich with the GitHub login/accountId from
 * neon_auth.account. Returns null only when the JWT does not verify.
 */
async function resolveIdentity(token: string): Promise<NeonIdentity | null> {
  const claims = await verifyJwt(token);
  if (!claims) return null;

  // Best-effort GitHub enrichment, keyed on the TRUSTED user id from the JWT.
  // A DB hiccup or a missing account row must not drop a validly-authenticated
  // identity: fall back to the user id as the display login and match the
  // allowlist on the JWT email.
  let accountId: string | null = null;
  let accessToken: string | null = null;
  let userRowEmail: string | null = null;
  try {
    const sql = db();
    const rows = await sql<
      { account_id: string | null; access_token: string | null; email: string | null }[]
    >`
      select acc."accountId" as account_id, acc."accessToken" as access_token, u.email as email
      from neon_auth."user" u
      left join neon_auth.account acc on acc."userId" = u.id and acc."providerId" = 'github'
      where u.id = ${claims.sub}
      limit 1
    `;
    const row = rows[0];
    accountId = row?.account_id ?? null;
    accessToken = row?.access_token ?? null;
    userRowEmail = row?.email ?? null;
  } catch {
    // neon_auth unavailable → proceed with JWT claims only.
  }

  // Display login: resolved GitHub @handle when we can, else the user id.
  const login = accountId
    ? await resolveLogin(claims.sub, accountId, accessToken)
    : claims.sub;
  // Allowlist github_login candidates: resolved @handle + numeric account id.
  const logins = [login, accountId].filter((x): x is string => !!x);
  // Emails: the JWT email (always trusted), the user-row primary, and any
  // GitHub-verified addresses.
  const githubEmails = await resolveEmails(claims.sub, userRowEmail, accessToken);
  const emails = [...new Set([claims.email, ...githubEmails].filter((x): x is string => !!x))];
  return {
    userId: claims.sub,
    login,
    logins,
    name: claims.name,
    emails,
  };
}

export function createNeonAuthProvider(): AuthProvider {
  return {
    async verify(header) {
      const token = sessionToken(header);
      if (!token) return anonymousViewer();
      const identity = await resolveIdentity(token);
      if (!identity) return anonymousViewer();
      const role = await lookupRole(db(), { logins: identity.logins, emails: identity.emails });
      const ident = { userId: identity.userId, name: identity.name };
      // Authenticated but not allowlisted: known identity, published-only access.
      if (role === Role.ANONYMOUS) {
        return viewer(identity.login, Role.ANONYMOUS, ident);
      }
      return viewer(identity.login, role, ident);
    },
  };
}
