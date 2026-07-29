// Re-anchoring: when a new content version is registered, relink open comment
// threads from the prior version to the new version. Two independent matchers,
// one per anchor track — prose (heading + quote) and code (snippet source).
//
// Prose match precedence for a comment's (anchor_slug, anchor_fingerprint,
// optional quote):
//   1. quote present and found in the section that still carries anchor_slug
//      → keep, refresh the quote's start offset.
//   2. quote present and found (exact, else fuzzy ≥ threshold) in ANY new
//      section → relink anchor_slug to that section, refresh start.
//   3. anchor_slug still present (heading-level comment, or quote drifted)
//      → keep at section level.
//   4. fingerprint match (heading renamed but same normalized text) → relink.
//   5. no match → mark the thread orphaned (retained, shown separately).
//
// Code match precedence for a comment's (code_path, code_region, code_line_hash):
//   1. region still present in the file's snippet set → keep.
//   2. line-hash found in the file's current text → relink line/end_line.
//   3. no match → orphaned (retained).
//
// A comment is a thread root when parent_id is null. Orphaned roots are never
// deleted and stay resolvable.
import { createHash } from "node:crypto";
import type { Sql } from "./db.js";

// normalize()/hashLine() are the SAME contract as content-core's normalizeText
// (site/src/content-core/normalize.mjs) / hashLineSync (site/src/content-core/
// hash.mjs) and the browser client's
// content-ref.ts. The server keeps its own tiny copies rather than reaching
// across the package boundary into site/ (which would couple the Neon Function
// bundle to the site tree); a drift test in content-core asserts all copies
// agree, so the "must match" is enforced by CI, not by comment. See
// docs/design/build-pipeline.md.
export function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function hashLine(line: string): string {
  // Trim BOTH ends, not just trailing. The browser captures this hash from the
  // rendered snippet, which resolveFence has already dedented, so its lines have
  // no leading indentation; but the server re-anchor (reanchorCodeThreads Tier
  // 2) hashes full source lines that still carry their original indentation.
  // Trimming leading whitespace too makes the hash dedent-invariant so the two
  // sides agree for indented snippet regions. Same contract as content-core
  // hashLineSync / content-ref.ts hashLine; the drift test asserts parity.
  return createHash("sha256").update(line.trim()).digest("hex").slice(0, 16);
}

export interface NewSection {
  anchorSlug: string;
  fingerprint: string;
  /** Normalized plain-text body of the section (heading excluded). */
  text: string;
}

/**
 * Locate `quote` within `text` (both already normalized). Returns the char
 * offset of an exact match, else the best fuzzy window offset if its similarity
 * clears `threshold`, else -1. Fuzzy is a bounded token-overlap ratio — cheap,
 * dependency-free, good enough for "the sentence moved and was lightly edited".
 */
export function findQuote(text: string, quote: string, threshold = 0.8): number {
  if (!quote) return -1;
  const exact = text.indexOf(quote);
  if (exact !== -1) return exact;
  // Fuzzy: slide a window the size of the quote and score token overlap.
  const qTokens = new Set(quote.split(" ").filter(Boolean));
  if (qTokens.size === 0) return -1;
  const words = text.split(" ");
  const win = quote.split(" ").length;
  let best = -1;
  let bestScore = 0;
  let offset = 0;
  for (let i = 0; i + win <= words.length; i++) {
    const window = words.slice(i, i + win);
    let hit = 0;
    for (const w of window) if (qTokens.has(w)) hit++;
    const score = hit / qTokens.size;
    if (score > bestScore) {
      bestScore = score;
      best = offset;
    }
    offset += words[i].length + 1; // +1 for the joining space
  }
  return bestScore >= threshold ? best : -1;
}

/**
 * Re-anchor open PROSE threads for (area, slug) against the new section set.
 * Returns the number of threads that could not be matched (now orphaned).
 * No-op when there are no comments yet. Code-anchored threads (code_path set)
 * are skipped here — they go through reanchorCodeThreads.
 */
export async function reanchorThreads(
  sql: Sql,
  area: string,
  slug: string,
  sections: NewSection[],
  // Anchor slugs whose Merkle subtree is provably unchanged vs. the prior
  // version (from tree-diff). A thread on such a section cannot have drifted, so
  // it's kept without running the fuzzy quote scan — a fast path, not a
  // correctness change (the tiers below still handle everything else).
  unchangedSlugs: ReadonlySet<string> = new Set(),
): Promise<number> {
  const bySlug = new Map(sections.map((s) => [s.anchorSlug, s]));
  const byFingerprint = new Map(sections.map((s) => [s.fingerprint, s]));
  // Normalize each section's text ONCE, not once per orphan-candidate root — the
  // Tier-2 scan below runs over the whole section set for every drifted root, so
  // caching turns O(roots × sections) normalize() calls into O(sections).
  const normBySlug = new Map(sections.map((s) => [s.anchorSlug, normalize(s.text)]));

  const roots = await sql<
    {
      id: string;
      anchor_slug: string;
      anchor_fingerprint: string;
      orphaned: boolean;
      selector_quote: string | null;
    }[]
  >`
    select id, anchor_slug, anchor_fingerprint, orphaned, selector_quote
    from comment
    where area = ${area} and slug = ${slug} and parent_id is null
      and code_path is null
  `;

  let orphaned = 0;
  for (const root of roots) {
    // Fast path: the section this thread anchors to is byte-identical to the
    // prior version (its subtree hash matched). Keep it as-is, skipping the
    // quote scan. Only applies when the slug still exists in the new section set.
    if (unchangedSlugs.has(root.anchor_slug) && bySlug.has(root.anchor_slug)) {
      if (root.orphaned) {
        await sql`update comment set orphaned = false where id = ${root.id}`;
      }
      continue;
    }

    const quote = root.selector_quote ? normalize(root.selector_quote) : null;

    // Tier 1: quote still lives in its own section.
    if (quote) {
      const ownNorm = normBySlug.get(root.anchor_slug);
      if (ownNorm !== undefined) {
        const at = findQuote(ownNorm, quote);
        if (at !== -1) {
          await refreshStart(sql, root, at);
          continue;
        }
      }
      // Tier 2: quote found in some other section → relink slug + start.
      let matched: { slug: string; start: number } | null = null;
      for (const s of sections) {
        if (s.anchorSlug === root.anchor_slug) continue;
        const at = findQuote(normBySlug.get(s.anchorSlug) ?? normalize(s.text), quote);
        if (at !== -1) {
          matched = { slug: s.anchorSlug, start: at };
          break;
        }
      }
      if (matched) {
        await relink(sql, root.id, matched.slug, matched.start);
        continue;
      }
    }

    // Tier 3: heading-level comment (or quote drifted) but slug still present.
    if (bySlug.has(root.anchor_slug)) {
      if (root.orphaned) {
        await sql`update comment set orphaned = false where id = ${root.id}`;
      }
      continue;
    }
    // Tier 4: fingerprint match (heading renamed, same normalized text).
    const viaFingerprint = byFingerprint.get(root.anchor_fingerprint);
    if (viaFingerprint) {
      await relink(sql, root.id, viaFingerprint.anchorSlug, null);
      continue;
    }
    // Tier 5: no match → orphan.
    if (!root.orphaned) {
      await sql`update comment set orphaned = true where id = ${root.id}`;
    }
    orphaned++;
  }
  return orphaned;
}

export interface NewSnippet {
  path: string;
  region: string;
  startLine: number;
  endLine: number;
  fileHash: string;
}

export interface NewSource {
  path: string;
  text: string;
  fileHash: string;
}

/**
 * Re-anchor open CODE threads for (area, slug) against the new snippet + source
 * set. Precedence: region present → line-hash found in file → orphan. Returns
 * the orphaned count.
 */
export async function reanchorCodeThreads(
  sql: Sql,
  area: string,
  slug: string,
  snippets: NewSnippet[],
  sources: NewSource[],
): Promise<number> {
  const regionsByPath = new Map<string, Set<string>>();
  for (const s of snippets) {
    if (!s.region) continue;
    (regionsByPath.get(s.path) ?? regionsByPath.set(s.path, new Set()).get(s.path)!).add(s.region);
  }
  const sourceByPath = new Map(sources.map((f) => [f.path, f]));

  const roots = await sql<
    {
      id: string;
      orphaned: boolean;
      code_path: string;
      code_region: string | null;
      code_line_hash: string | null;
    }[]
  >`
    select id, orphaned, code_path, code_region, code_line_hash
    from comment
    where area = ${area} and slug = ${slug} and parent_id is null
      and code_path is not null
  `;

  let orphaned = 0;
  for (const root of roots) {
    const src = sourceByPath.get(root.code_path);

    // Tier 1: the referenced region still exists in this file.
    if (root.code_region && regionsByPath.get(root.code_path)?.has(root.code_region)) {
      if (root.orphaned) {
        await sql`update comment set orphaned = false where id = ${root.id}`;
      }
      continue;
    }

    // Tier 2: the anchored line still exists somewhere in the file (moved).
    if (src && root.code_line_hash) {
      const lines = src.text.split("\n");
      const idx = lines.findIndex((l) => hashLine(l) === root.code_line_hash);
      if (idx !== -1) {
        const line = idx + 1;
        await sql`
          update comment
          set code_line = ${line}, code_end_line = ${line},
              code_file_hash = ${src.fileHash}, orphaned = false
          where id = ${root.id}
        `;
        continue;
      }
    }

    // Tier 3: gone → orphan.
    if (!root.orphaned) {
      await sql`update comment set orphaned = true where id = ${root.id}`;
    }
    orphaned++;
  }
  return orphaned;
}

/** Un-orphan a prose root and refresh its quote start offset. */
async function refreshStart(
  sql: Sql,
  root: { id: string },
  start: number,
): Promise<void> {
  await sql`
    update comment
    set orphaned = false, selector_start = ${start}
    where id = ${root.id}
  `;
}

/** Relink a prose root to a new anchor slug, optionally setting the quote start. */
async function relink(
  sql: Sql,
  id: string,
  anchorSlug: string,
  start: number | null,
): Promise<void> {
  if (start !== null) {
    await sql`
      update comment
      set anchor_slug = ${anchorSlug}, selector_start = ${start}, orphaned = false
      where id = ${id}
    `;
  } else {
    await sql`
      update comment
      set anchor_slug = ${anchorSlug}, orphaned = false
      where id = ${id}
    `;
  }
}
