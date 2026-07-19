// Re-anchoring: when a new content version is registered, relink open comment
// threads from the prior version's sections to the new version's sections.
//
// Match precedence for a comment's stored (anchor_slug, anchor_fingerprint):
//   1. exact anchor_slug present in the new version  → keep, section unchanged
//   2. fingerprint match (heading renamed but same text after normalize) → relink
//   3. no match → mark the thread orphaned (retained, shown separately)
//
// Full wiring against the comment table lands in Phase 3 (comments); this module
// provides the matcher now so RegisterVersion can report an orphan count and the
// logic has a single home.
import type { Sql } from "./db.js";

export interface NewSection {
  anchorSlug: string;
  fingerprint: string;
}

/**
 * Re-anchor open threads for (area, slug) against the new section set. Returns
 * the number of threads that could not be matched (now orphaned). A comment is a
 * thread root when parent_id is null. No-op when there are no comments yet.
 */
export async function reanchorThreads(
  sql: Sql,
  area: string,
  slug: string,
  sections: NewSection[],
): Promise<number> {
  const bySlug = new Set(sections.map((s) => s.anchorSlug));
  const byFingerprint = new Map(sections.map((s) => [s.fingerprint, s.anchorSlug]));

  const roots = await sql<
    { id: string; anchor_slug: string; anchor_fingerprint: string; orphaned: boolean }[]
  >`
    select id, anchor_slug, anchor_fingerprint, orphaned
    from comment
    where area = ${area} and slug = ${slug} and parent_id is null
  `;

  let orphaned = 0;
  for (const root of roots) {
    if (bySlug.has(root.anchor_slug)) {
      if (root.orphaned) {
        await sql`update comment set orphaned = false where id = ${root.id}`;
      }
      continue;
    }
    const viaFingerprint = byFingerprint.get(root.anchor_fingerprint);
    if (viaFingerprint) {
      await sql`
        update comment
        set anchor_slug = ${viaFingerprint}, orphaned = false
        where id = ${root.id}
      `;
      continue;
    }
    if (!root.orphaned) {
      await sql`update comment set orphaned = true where id = ${root.id}`;
    }
    orphaned++;
  }
  return orphaned;
}
