// Reviewer allowlist lookups. The allowlist is ours (reviewer_allowlist table),
// independent of how identity is established (Neon Auth in prod, mock locally).
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";
import type { Queryable } from "./db.js";

/** Map the allowlist `role` text column to the proto Role. */
export function roleFromDb(role: string | null): Role {
  if (role === "maintainer") return Role.MAINTAINER;
  if (role === "reviewer") return Role.REVIEWER;
  return Role.ANONYMOUS;
}

/**
 * Resolve an identity's role from the allowlist by github login(s) and/or any of
 * the identity's emails (all case-insensitive). Returns ANONYMOUS when not
 * listed. Maintainer wins if entries disagree.
 *
 * Why a list of logins: `github_login` may be seeded as the @handle OR the
 * numeric GitHub account id. We can only resolve the @handle by exchanging the
 * stored OAuth token via GitHub's /user API, which can fail (expired/revoked
 * token) and fall back to the numeric id — so we match on BOTH candidates,
 * letting a login-seeded row hit either way.
 *
 * Why a list of emails: a reviewer's row is often seeded with a different address
 * than their GitHub *primary* email — and Neon Auth stores only the primary in
 * neon_auth."user".email. Matching every GitHub-verified email (see neon-auth.ts)
 * makes an email-seeded row hit regardless of which address the user later makes
 * primary.
 */
export async function lookupRole(
  sql: Queryable,
  opts: { logins?: string[]; emails?: string[] },
): Promise<Role> {
  // Normalize + dedupe both sides; drop empties so a blank can't match a blank row.
  const norm = (xs: string[] | undefined) =>
    [...new Set((xs ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const logins = norm(opts.logins);
  const emails = norm(opts.emails);
  if (logins.length === 0 && emails.length === 0) return Role.ANONYMOUS;
  const rows = await sql<{ role: string }[]>`
    select role from reviewer_allowlist
    where (lower(github_login) = any(${logins}::text[]))
       or (lower(email) = any(${emails}::text[]))
  `;
  let best = Role.ANONYMOUS;
  for (const r of rows) {
    const role = roleFromDb(r.role);
    if (role === Role.MAINTAINER) return Role.MAINTAINER;
    if (role === Role.REVIEWER) best = Role.REVIEWER;
  }
  return best;
}
