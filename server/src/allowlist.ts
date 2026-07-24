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
 * Resolve an identity's role from the allowlist by github login and/or email
 * (case-insensitive). Returns ANONYMOUS when not listed. Maintainer wins if a
 * login and email disagree.
 */
export async function lookupRole(
  sql: Queryable,
  opts: { login?: string; email?: string },
): Promise<Role> {
  const { login, email } = opts;
  if (!login && !email) return Role.ANONYMOUS;
  const rows = await sql<{ role: string }[]>`
    select role from reviewer_allowlist
    where (${login ?? null}::text is not null and lower(github_login) = lower(${login ?? null}))
       or (${email ?? null}::text is not null and lower(email) = lower(${email ?? null}))
  `;
  let best = Role.ANONYMOUS;
  for (const r of rows) {
    const role = roleFromDb(r.role);
    if (role === Role.MAINTAINER) return Role.MAINTAINER;
    if (role === Role.REVIEWER) best = Role.REVIEWER;
  }
  return best;
}
