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
 * Resolve an identity's role from the allowlist by github login and/or any of
 * the identity's emails (all case-insensitive). Returns ANONYMOUS when not
 * listed. Maintainer wins if entries disagree.
 *
 * Why a list of emails, not one: a reviewer's allowlist row is often seeded with
 * a different address than their GitHub *primary* email — and Neon Auth stores
 * only the primary in neon_auth."user".email. Matching every GitHub-verified
 * email (see neon-auth.ts) makes an email-seeded row hit regardless of which
 * address the user later makes primary. `github_login` is the robust key and is
 * matched independently, so a login-seeded row hits even with no email at all.
 */
export async function lookupRole(
  sql: Queryable,
  opts: { login?: string; emails?: string[] },
): Promise<Role> {
  const { login } = opts;
  // Normalize + dedupe emails; drop empties so a `[""]` can't match a blank row.
  const emails = [...new Set((opts.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!login && emails.length === 0) return Role.ANONYMOUS;
  const rows = await sql<{ role: string }[]>`
    select role from reviewer_allowlist
    where (${login ?? null}::text is not null and lower(github_login) = lower(${login ?? null}))
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
