// Prod auth provider: Neon Auth (GitHub OAuth) + the reviewer allowlist.
//
// Neon Auth stores users, sessions, and linked OAuth accounts in the neon_auth
// schema, queryable with SQL. The verification path is:
//   1. read the Neon Auth session token from the request (cookie or bearer)
//   2. resolve it to a user id + a valid (unexpired) session
//   3. resolve that user's linked GitHub login via neon_auth.account
//   4. look the login/email up in reviewer_allowlist → role
//
// Step 3 subtlety: neon_auth.account stores GitHub's numeric OAuth account id in
// "accountId", NOT the @handle. To let the allowlist be seeded by github_login,
// we exchange the account's stored "accessToken" for the real login via GitHub's
// /user API, memoized per user id so it isn't a per-request network hit. If that
// call fails we fall back to the numeric id (allowlist won't match on it, but
// email still can), so verification never crashes.
//
// The resolver fails closed (returns anonymous) rather than guessing — auth is
// additive, so an unresolved session simply sees published content. The
// allowlist half (steps 3-4) is fully ours and complete.
import { db } from "../db.js";
import { lookupRole } from "../allowlist.js";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";

interface NeonIdentity {
  /** Stable Neon Auth user id — the key for authorship + read-state. */
  userId: string;
  /**
   * GitHub @handle. Resolved from the OAuth access token (see resolveLogin);
   * falls back to the numeric account id if the GitHub API is unreachable, in
   * which case the allowlist's github_login match won't hit but email still can.
   */
  login: string;
  name?: string;
  email?: string;
}

/**
 * Per-user-id cache of the resolved GitHub @handle, so the /user call happens
 * once per process per user rather than on every request. Sessions are
 * long-lived and a user's login rarely changes, so a plain in-memory map (reset
 * on cold start) is sufficient — no TTL needed for correctness.
 */
const loginCache = new Map<string, string>();

/**
 * Exchange a GitHub OAuth access token for the account's @handle via /user.
 * Returns null on any failure (network, revoked token, rate limit) so the
 * caller can fall back to the numeric id without crashing verification.
 */
async function fetchGithubLogin(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "docs-factory-review",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { login?: unknown };
    return typeof body.login === "string" && body.login.length > 0 ? body.login : null;
  } catch {
    return null;
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

/** Extract the Neon Auth session token from a cookie or Authorization header. */
function sessionToken(header: Headers): string | undefined {
  const auth = header.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = header.get("cookie");
  if (!cookie) return undefined;
  const name = process.env.NEON_AUTH_COOKIE_NAME ?? "neon-auth.session-token";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
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
      join neon_auth.account acc on acc."userId" = u.id and acc."providerId" = 'github'
      where s.token = ${token}
        and s."expiresAt" > now()
      limit 1
    `;
    const row = rows[0];
    if (!row?.account_id) return null;
    const login = await resolveLogin(row.user_id, row.account_id, row.access_token);
    return {
      userId: row.user_id,
      login,
      name: row.name ?? undefined,
      email: row.email ?? undefined,
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
      const role = await lookupRole(db(), identity);
      const ident = { userId: identity.userId, name: identity.name };
      // Authenticated but not allowlisted: known identity, published-only access.
      if (role === Role.ANONYMOUS) {
        return viewer(identity.login, Role.ANONYMOUS, ident);
      }
      return viewer(identity.login, role, ident);
    },
  };
}
