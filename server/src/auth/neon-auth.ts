// Prod auth provider: Neon Auth (GitHub OAuth) + the reviewer allowlist.
//
// Neon Auth stores users, sessions, and linked OAuth accounts in the neon_auth
// schema, queryable with SQL. The verification path is:
//   1. read the Neon Auth session token from the request (cookie or bearer)
//   2. resolve it to a user id + a valid (unexpired) session
//   3. resolve that user's linked GitHub login via neon_auth.account
//   4. look the login/email up in reviewer_allowlist → role
//
// Step 2's exact table/column shape and token format are finalized when the
// Neon Auth project is provisioned (NEON_AUTH_* env). Until then the resolver
// below fails closed (returns anonymous) rather than guessing — auth is
// additive, so an unresolved session simply sees published content. The
// allowlist half (steps 3-4) is fully ours and complete.
import { db } from "../db.js";
import { lookupRole } from "../allowlist.js";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";

interface NeonIdentity {
  /** Stable Neon Auth user id — the key for authorship + read-state. */
  userId: string;
  login: string;
  name?: string;
  email?: string;
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
      { user_id: string; login: string | null; name: string | null; email: string | null }[]
    >`
      select u.id as user_id, acc."providerAccountId" as login, u.name as name, u.email as email
      from neon_auth.session s
      join neon_auth."user" u on u.id = s."userId"
      join neon_auth.account acc on acc."userId" = u.id and acc.provider = 'github'
      where s."sessionToken" = ${token}
        and (s.expires is null or s.expires > now())
      limit 1
    `;
    const row = rows[0];
    if (!row?.login) return null;
    return {
      userId: row.user_id,
      login: row.login,
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
