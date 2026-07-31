// Prod auth provider: Neon Auth (GitHub OAuth) + the reviewer allowlist.
//
// The bearer the client sends is Neon Auth's SIGNED JWT (Better Auth's
// `set-auth-jwt`), not the opaque session token — so we authenticate it the
// stateless, rotation-proof way: verify its signature against Neon Auth's JWKS
// (EdDSA) and check iss/aud/exp. The verified claims give us a TRUSTED user id
// (`sub`). The verification path is:
//   1. read the bearer (or cookie) from the request
//   2. verify it as a JWT via the JWKS at NEON_AUTH_URL/.well-known/jwks.json
//      (issuer + audience = NEON_AUTH_URL's host); trust `sub` + `email`
//   3. read our persisted user_identity row for that user id (resolved GitHub
//      login/name/email) — NO GitHub API call for a returning user
//   4. if absent/unresolved: one-time enrich from neon_auth.account (GitHub login
//      via the OAuth token, verified emails) and upsert user_identity
//   5. look the user id up in reviewer_allowlist -> role
//
// Step 4 subtlety: neon_auth.account stores GitHub's numeric OAuth account id in
// "accountId", NOT the @handle. We exchange the account's stored "accessToken"
// for the real login via GitHub's /user API ONCE (at first login), persisting it
// so later requests read the stored value. A failed resolution leaves
// github_login null (never the numeric id masqueraded as a handle) and retries
// on the next login; the numeric id lives in user_identity.github_id.
//
// The enrichment is best-effort: a validly-signed JWT is already an authenticated
// identity even if the github account row is absent. The resolver fails closed
// (anonymous) only when there is no valid JWT — auth is additive, so an
// unauthenticated request simply sees published content.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "../db.js";
import { hasAdminRole, lookupRole } from "../allowlist.js";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";
// GitHub @handle / verified-email resolution + persistence into user_identity.
import { persistUserIdentity, readUserIdentity } from "./github-identity.js";

interface NeonIdentity {
  /** Stable Neon Auth user id — the key for authorship, allowlist + read-state. */
  userId: string;
  /**
   * Display login: the resolved GitHub @handle from user_identity. Falls back to
   * the user id only for the very first request before the handle resolves; the
   * numeric account id is NEVER used as a login.
   */
  login: string;
  name?: string;
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
 * Resolve a bearer to a user identity: verify the JWT for a trusted user id,
 * then read our persisted user_identity row. If the row is absent or its
 * github_login is still unresolved, do the one-time neon_auth.account join +
 * GitHub /user resolution and upsert it (login-time persistence + the runtime
 * backfill that overwrites any earlier fake numeric login). Returns null only
 * when the JWT does not verify.
 *
 * The read path (a returning user with a resolved row) does NO GitHub API call.
 */
async function resolveIdentity(token: string): Promise<NeonIdentity | null> {
  const claims = await verifyJwt(token);
  if (!claims) return null;
  const userId = claims.sub;

  // Fast path: a persisted, resolved identity — no GitHub API, no neon_auth read.
  let persisted = null;
  try {
    persisted = await readUserIdentity(db(), userId);
  } catch {
    // user_identity unavailable → fall through to (re)resolution below.
  }

  if (!persisted || !persisted.github_login) {
    // First login (or a prior resolution that never got the handle): read the
    // GitHub account from neon_auth and persist. A DB hiccup or missing account
    // row must not drop a validly-authenticated identity.
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
        where u.id = ${userId}
        limit 1
      `;
      const row = rows[0];
      accountId = row?.account_id ?? null;
      accessToken = row?.access_token ?? null;
      userRowEmail = row?.email ?? null;
    } catch {
      // neon_auth unavailable → persist from JWT claims alone.
    }
    persisted = await persistUserIdentity(db(), {
      userId,
      accountId,
      accessToken,
      jwtEmail: claims.email ?? null,
      userRowEmail,
      name: claims.name ?? persisted?.name ?? null,
    });
  }

  // Display login: the resolved GitHub @handle; else fall back to the user id
  // for this request (never the numeric account id).
  const login = persisted.github_login ?? userId;
  return {
    userId,
    login,
    name: persisted.name ?? claims.name ?? undefined,
  };
}

/**
 * Whether the user is a Neon Auth site admin, read FRESH per request from
 * neon_auth."user".role (Better Auth's admin plugin, set via the Neon Console).
 * Read live rather than cached in user_identity because the role can toggle in
 * the console at any time. Uses (to_jsonb(u) ->> 'role') so a project WITHOUT the
 * admin plugin — no `role` column — returns NULL instead of throwing; any DB
 * error fails closed to false. This is the persistent, DB-drop-surviving anchor
 * for admins: neon_auth is Neon-managed, not part of our migrations.
 */
async function readSiteAdmin(userId: string): Promise<boolean> {
  try {
    const rows = await db()<{ role: string | null }[]>`
      select (to_jsonb(u) ->> 'role') as role
      from neon_auth."user" u
      where u.id = ${userId}
      limit 1
    `;
    return hasAdminRole(rows[0]?.role ?? null);
  } catch {
    return false; // neon_auth / role column unavailable → not an admin.
  }
}

/**
 * The role a viewer is admitted at, given their allowlist role and whether Neon
 * Auth marks them a site admin. A site admin implies at least MAINTAINER — no
 * reviewer_allowlist row needed — so admins can release/review/erase with zero
 * seeding; a non-admin keeps their allowlist role unchanged. Elevating here (so
 * viewer() derives is_allowlisted from an already-elevated role) is what makes an
 * admin pass every existing requireAllowlisted/requireMaintainer guard. Pure and
 * exported so this security-critical rule is unit-tested without a DB.
 */
export function elevateRoleForAdmin(role: Role, isSiteAdmin: boolean): Role {
  return isSiteAdmin && role !== Role.MAINTAINER ? Role.MAINTAINER : role;
}

export function createNeonAuthProvider(): AuthProvider {
  return {
    async verify(header) {
      const token = sessionToken(header);
      if (!token) return anonymousViewer();
      const identity = await resolveIdentity(token);
      if (!identity) return anonymousViewer();
      // Allowlist role keys on the stable user id; the admin flag is read fresh
      // from neon_auth. Both key on the same trusted user id, so run in parallel.
      const [role, isSiteAdmin] = await Promise.all([
        lookupRole(db(), { userId: identity.userId }),
        readSiteAdmin(identity.userId),
      ]);
      const ident = { userId: identity.userId, name: identity.name, isSiteAdmin };
      // Authenticated but neither allowlisted nor admin: known identity,
      // published-only access.
      return viewer(identity.login, elevateRoleForAdmin(role, isSiteAdmin), ident);
    },
  };
}
