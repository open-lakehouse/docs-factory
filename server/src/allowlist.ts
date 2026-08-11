// Reviewer allowlist lookups. The allowlist is ours (reviewer_allowlist table),
// keyed by the stable Neon Auth user id, independent of how identity is
// established (Neon Auth in prod, mock locally).

import type { Queryable } from "./db.js";
import { Role } from "./gen/docs_factory/review/v1/messages_pb.js";

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
export async function lookupRole(sql: Queryable, opts: { userId?: string | null }): Promise<Role> {
  const userId = opts.userId?.trim();
  if (!userId) return Role.ANONYMOUS;
  const rows = await sql<{ role: string }[]>`
    select role from reviewer_allowlist where user_id = ${userId}
  `;
  return roleFromDb(rows[0]?.role ?? null);
}

/** The subset of a Viewer that content-grant checks read. */
export interface GrantViewer {
  isAllowlisted: boolean;
  userId?: string | null;
}

/**
 * Pure predicate: does this viewer hold a scoped grant, given the viewer's
 * non-cancelled review_request rows for one piece of content? Allowlisted
 * viewers always pass. Extracted from the DB lookups below so the grant rule is
 * unit-testable (mirrors deriveReviewState). `rows` are the caller's already
 * status-filtered request rows; we test `status <> 'cancelled'` here too so the
 * rule holds regardless of how the caller filtered.
 *
 * The grant survives a request being `satisfied` (approving is the normal review
 * action — recordApproval flips the reviewer's own open request to satisfied),
 * so an external contributor keeps view+comment on the content they approved.
 * Only `cancelled` revokes.
 */
export function grantFromRequestRows(viewer: GrantViewer, rows: { status: string }[]): boolean {
  if (viewer.isAllowlisted) return true;
  if (!viewer.userId?.trim()) return false;
  return rows.some((r) => r.status !== "cancelled");
}

/**
 * Whether `viewer` may access one piece of content: allowlisted globally, or
 * holding a non-cancelled review_request (open OR satisfied) addressed to them
 * for this `(area, slug)`. `area` is db-form ('blogs'|'docs'). Backed by the
 * review_request_reviewer_idx (reviewer_user_id, status) index.
 */
export async function hasContentGrant(
  sql: Queryable,
  viewer: GrantViewer,
  area: string,
  slug: string,
): Promise<boolean> {
  if (viewer.isAllowlisted) return true;
  const userId = viewer.userId?.trim();
  if (!userId) return false;
  const rows = await sql<{ status: string }[]>`
    select status from review_request
    where area = ${area} and slug = ${slug}
      and reviewer_user_id = ${userId} and status <> 'cancelled'
    limit 1
  `;
  return grantFromRequestRows(viewer, rows);
}

/**
 * Whether this user holds ANY non-cancelled review_request across all content.
 * Cheap existence check used to set Viewer.has_scoped_grants so the site-wide
 * AccessGate can admit an external contributor. Call only for a viewer who is
 * NOT allowlisted (allowlisted viewers are admitted regardless).
 */
export async function hasAnyContentGrant(
  sql: Queryable,
  userId: string | null | undefined,
): Promise<boolean> {
  const id = userId?.trim();
  if (!id) return false;
  const rows = await sql<{ one: number }[]>`
    select 1 as one from review_request
    where reviewer_user_id = ${id} and status <> 'cancelled' limit 1
  `;
  return rows.length > 0;
}
