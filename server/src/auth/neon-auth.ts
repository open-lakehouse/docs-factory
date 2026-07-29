// Prod auth provider: Neon Auth (GitHub OAuth) + the reviewer allowlist.
//
// Neon Auth stores users, sessions, and linked OAuth accounts in the neon_auth
// schema, queryable with SQL. The verification path is:
//   1. read the Neon Auth session token from the request (cookie or bearer)
//   2. resolve it to a user id + a valid (unexpired) session
//   3. resolve that user's GitHub login + verified emails (see below)
//   4. look the login and ANY email up in reviewer_allowlist → role
//
// Step 3 subtlety: neon_auth.account stores GitHub's numeric OAuth account id in
// "accountId", NOT the @handle. To let the allowlist be seeded by github_login,
// we exchange the account's stored "accessToken" for the real login via GitHub's
// /user API, memoized per user id so it isn't a per-request network hit. We also
// fetch the account's /user/emails (verified only), because Neon Auth stores just
// the PRIMARY email on the user row — so an allowlist row seeded with a reviewer's
// non-primary address would otherwise silently miss. If either call fails we fall
// back (numeric id for the login, the user-row email for emails), so verification
// never crashes.
//
// The account join is LEFT, not INNER: a valid session + user is an authenticated
// identity even if the github account link is absent or stored under an
// unexpected providerId — we then match the allowlist on email rather than
// collapsing to anonymous (which would lock out an allowlisted user). The
// resolver still fails closed (anonymous) when the token resolves to no session
// at all — auth is additive, so an unresolved session simply sees published
// content. The allowlist half (steps 3-4) is fully ours and complete.
import { db } from "../db.js";
import { lookupRole } from "../allowlist.js";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";

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
 * Per-user-id cache of the resolved GitHub @handle, so the /user call happens
 * once per process per user rather than on every request. Sessions are
 * long-lived and a user's login rarely changes, so a plain in-memory map (reset
 * on cold start) is sufficient — no TTL needed for correctness.
 */
const loginCache = new Map<string, string>();

/**
 * Per-user-id cache of the GitHub-verified emails, memoized like loginCache so
 * the /user/emails call happens once per process per user. Never a TTL: emails
 * change rarely and a cold start re-reads them.
 */
const emailsCache = new Map<string, string[]>();

/** GitHub API headers shared by the /user and /user/emails calls. */
function githubHeaders(accessToken: string): HeadersInit {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "docs-factory-review",
  };
}

/**
 * Exchange a GitHub OAuth access token for the account's @handle via /user.
 * Returns null on any failure (network, revoked token, rate limit) so the
 * caller can fall back to the numeric id without crashing verification.
 */
async function fetchGithubLogin(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", { headers: githubHeaders(accessToken) });
    if (!res.ok) return null;
    const body = (await res.json()) as { login?: unknown };
    return typeof body.login === "string" && body.login.length > 0 ? body.login : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the account's VERIFIED GitHub emails via /user/emails. Returns [] on any
 * failure (network, or the `user:email` scope not granted) so the caller falls
 * back to the user-row email alone. Only verified addresses are trusted — an
 * unverified email must never grant allowlist access.
 */
async function fetchGithubEmails(accessToken: string): Promise<string[]> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: githubHeaders(accessToken),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { email?: unknown; verified?: unknown }[];
    if (!Array.isArray(body)) return [];
    return body
      .filter((e) => e.verified === true && typeof e.email === "string" && e.email.length > 0)
      .map((e) => e.email as string);
  } catch {
    return [];
  }
}

/**
 * Resolve the GitHub @handle for a user, preferring the memoized value and
 * falling back to the numeric account id when the token can't be exchanged.
 */
async function resolveLogin(
  userId: string,
  accountId: string,
  accessToken: string | null,
): Promise<string> {
  const cached = loginCache.get(userId);
  if (cached) return cached;
  const login = accessToken ? await fetchGithubLogin(accessToken) : null;
  const resolved = login ?? accountId;
  if (login) loginCache.set(userId, login);
  return resolved;
}

/**
 * All emails to attribute to this user: the Neon Auth user-row primary plus
 * every GitHub-verified address, memoized per user id. `primaryEmail` is always
 * included so the allowlist still works when the /user/emails call fails or the
 * OAuth token lacks the `user:email` scope.
 */
async function resolveEmails(
  userId: string,
  primaryEmail: string | null,
  accessToken: string | null,
): Promise<string[]> {
  const base = primaryEmail ? [primaryEmail] : [];
  const cached = emailsCache.get(userId);
  if (cached) return [...new Set([...base, ...cached])];
  const github = accessToken ? await fetchGithubEmails(accessToken) : [];
  if (github.length) emailsCache.set(userId, github);
  return [...new Set([...base, ...github])];
}

/** Extract the Neon Auth session token from a cookie or Authorization header. */
export function sessionToken(header: Headers): string | undefined {
  const auth = header.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = header.get("cookie");
  if (!cookie) return undefined;
  // Neon Auth sets an opaque session token in `__Secure-neonauth.session_token`
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
 * Resolve a session token to a GitHub identity via the neon_auth schema.
 * Returns null when the token is absent/invalid/expired. Isolated so the exact
 * neon_auth session/account column names can be confirmed against a live
 * project without touching the rest of the provider.
 */
async function resolveIdentity(token: string): Promise<NeonIdentity | null> {
  const sql = db();
  try {
    // LEFT join the github account: a valid session + user is enough to be an
    // authenticated identity. If the github account row is absent (or stored
    // under a different providerId than we expect), we still resolve the user
    // and match the allowlist on their email — rather than collapsing the whole
    // identity to anonymous, which would silently lock out an allowlisted user.
    const rows = await sql<
      {
        user_id: string;
        account_id: string | null;
        access_token: string | null;
        name: string | null;
        email: string | null;
      }[]
    >`
      select
        u.id as user_id,
        acc."accountId" as account_id,
        acc."accessToken" as access_token,
        u.name as name,
        u.email as email
      from neon_auth.session s
      join neon_auth."user" u on u.id = s."userId"
      left join neon_auth.account acc on acc."userId" = u.id and acc."providerId" = 'github'
      where s.token = ${token}
        and s."expiresAt" > now()
      limit 1
    `;
    const row = rows[0];
    // No session/user for this token (or expired) → genuinely logged out.
    if (!row) return null;
    // Prefer the GitHub @handle for the display login; when there's no github
    // account to resolve it from, use the user id as a stable placeholder.
    const login = row.account_id
      ? await resolveLogin(row.user_id, row.account_id, row.access_token)
      : row.user_id;
    // Allowlist github_login candidates: the resolved @handle plus the numeric
    // account id, so a row seeded with either matches even when the /user token
    // exchange fails (leaving `login` as the numeric id).
    const logins = [login, row.account_id].filter((x): x is string => !!x);
    const emails = await resolveEmails(row.user_id, row.email, row.access_token);
    return {
      userId: row.user_id,
      login,
      logins,
      name: row.name ?? undefined,
      emails,
    };
  } catch {
    // neon_auth not present (e.g. not yet provisioned) → treat as logged out.
    return null;
  }
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
