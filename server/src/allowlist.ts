// Reviewer allowlist lookups. The allowlist is ours (reviewer_allowlist table),
// keyed by the stable Neon Auth user id, independent of how identity is
// established (Neon Auth in prod, mock locally).
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";
import type { Queryable } from "./db.js";

/** Map the allowlist `role` text column to the proto Role. */
export function roleFromDb(role: string | null): Role {
  if (role === "maintainer") return Role.MAINTAINER;
  if (role === "reviewer") return Role.REVIEWER;
  return Role.ANONYMOUS;
}

/**
 * Whether Neon Auth's `role` column marks the user a site admin. Distinct from
 * the reviewer_allowlist role above: this is Better Auth's admin-plugin column on
 * neon_auth."user", set via the Neon Console and independent of our allowlist.
 * Better Auth stores multiple roles comma-separated ("user,admin"), so we test
 * membership, not equality — lower/trim each entry so "admin" matches but
 * "administrator" does not.
 */
export function hasAdminRole(role: string | null | undefined): boolean {
  return (role ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .includes("admin");
}

/**
 * Resolve a user's role from the allowlist by their stable user id. Returns
 * ANONYMOUS when the user is not listed (or has never logged in — an allowlist
 * row cannot exist without a matching user_identity row). The lookup is an exact
 * user_id match, so a GitHub login rename never changes the resolved role.
 */
export async function lookupRole(
  sql: Queryable,
  opts: { userId?: string | null },
): Promise<Role> {
  const userId = opts.userId?.trim();
  if (!userId) return Role.ANONYMOUS;
  const rows = await sql<{ role: string }[]>`
    select role from reviewer_allowlist where user_id = ${userId}
  `;
  return roleFromDb(rows[0]?.role ?? null);
}
