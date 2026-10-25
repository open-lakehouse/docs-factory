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
// Each tier records the thread's `anchor_state` so the UI and agents can say
// where it went: `exact` (as authored), `moved` (under another heading than
// the one it was written under), `rewritten` (only a fuzzy match; the matched
// text is kept as `anchor_current_quote`), `section` (heading kept, quote
// gone), `orphaned`. A null state reads as `exact`: never re-anchored.
//
// An open suggestion whose quote misses its own section (tier 1) is marked
// applied when that section now reads like the edit landed: the replacement
// (or, for a deletion, the bare join) framed by the quote's own context.
//
// Code match precedence for a comment's (code_path, code_region, code_line_hash):
//   1. region still present in the file's snippet set → keep.
//   2. line-hash found in the file's current text → relink line/end_line.
//   3. no match → orphaned (retained).
//
// A comment is a thread root when parent_id is null. Orphaned roots are never
// deleted and stay resolvable.
import { createHash } from "node:crypto";
import type { Queryable } from "./db.js";

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

export type AnchorState = "exact" | "moved" | "rewritten" | "section" | "orphaned";

export interface QuoteMatch {
  /** Char offset in the normalized text. */
  at: number;
  exact: boolean;
  /** The matched window of the normalized text: the quote itself when exact. */
  text: string;
}

/**
 * Locate `quote` within `text` (both already normalized): an exact match, else
 * the best fuzzy window if its similarity clears `threshold`, else null. Fuzzy
 * is a bounded token-overlap ratio — cheap, dependency-free, good enough for
 * "the sentence moved and was lightly edited".
 */
export function locateQuote(text: string, quote: string, threshold = 0.8): QuoteMatch | null {
  if (!quote) return null;
  const exact = text.indexOf(quote);
  if (exact !== -1) return { at: exact, exact: true, text: quote };
  // Fuzzy: slide a window the size of the quote and score token overlap.
  const qTokens = new Set(quote.split(" ").filter(Boolean));
  if (qTokens.size === 0) return null;
  const words = text.split(" ");
  const win = quote.split(" ").length;
  let best = -1;
  let bestWord = 0;
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
      bestWord = i;
    }
    offset += words[i].length + 1; // +1 for the joining space
  }
  if (bestScore < threshold) return null;
  return { at: best, exact: false, text: words.slice(bestWord, bestWord + win).join(" ") };
}

/** Offset of `quote` in `text` per {@link locateQuote}, or -1. */
export function findQuote(text: string, quote: string, threshold = 0.8): number {
  return locateQuote(text, quote, threshold)?.at ?? -1;
}

// Same contract as content-core's PREAMBLE_KEY / isPreambleAnchor: the browser
// sends "" for a selection above every heading, and re-anchoring relinks it to
// the preamble section's key. Both mean the same place.
const PREAMBLE_KEY = "__preamble__";
function sameAnchor(a: string, b: string): boolean {
  return a === b || ((!a || a === PREAMBLE_KEY) && (!b || b === PREAMBLE_KEY));
}

/**
 * Re-anchor open PROSE threads for (area, slug) against the new section set.
 * Returns the number of threads that could not be matched (now orphaned).
 * No-op when there are no comments yet. Code-anchored threads (code_path set)
 * are skipped here — they go through reanchorCodeThreads.
 */
/** Characters of quote context that must frame an applied suggestion. */
const APPLIED_CONTEXT = 12;

/**
 * Whether normalized section `text` shows a suggestion applied: the replacement
 * sits next to the quote's original prefix or suffix context. A deletion needs
 * both sides to meet, since an empty replacement says nothing on its own.
 * Conservative by design; a miss just leaves the suggestion for a human.
 */
export function suggestionApplied(
  text: string,
  s: { prefix: string; suffix: string; replacement: string },
): boolean {
  const before = normalize(s.prefix).slice(-APPLIED_CONTEXT);
  const after = normalize(s.suffix).slice(0, APPLIED_CONTEXT);
  const replacement = normalize(s.replacement);
  const candidates = replacement
    ? [`${before} ${replacement}`, `${replacement} ${after}`]
    : [`${before} ${after}`];
  return candidates.some((c) => {
    const needle = normalize(c);
    return needle.length >= APPLIED_CONTEXT && text.includes(needle);
  });
}

export async function reanchorThreads(
  sql: Queryable,
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
      selector_prefix: string | null;
      selector_suffix: string | null;
      suggestion_replacement: string | null;
      suggestion_state: string | null;
      anchor_state?: AnchorState | null;
      authored_anchor_slug?: string | null;
    }[]
  >`
    select id, anchor_slug, anchor_fingerprint, orphaned, selector_quote,
           selector_prefix, selector_suffix, suggestion_replacement, suggestion_state,
           anchor_state, authored_anchor_slug
    from comment
    where area = ${area} and slug = ${slug} and parent_id is null
      and code_path is null and scope = 'section'
  `;

  let orphaned = 0;
  for (const root of roots) {
    const authored = root.authored_anchor_slug ?? root.anchor_slug;
    const placedAt = (slug: string): AnchorState =>
      sameAnchor(slug, authored) ? "exact" : "moved";
    // Write only what changed, so re-registering an unchanged page is a no-op.
    const keep = async (state: AnchorState) => {
      if (!root.orphaned && (root.anchor_state ?? "exact") === state) return;
      await sql`
        update comment
        set orphaned = false, anchor_state = ${state}, anchor_current_quote = null
        where id = ${root.id}
      `;
    };

    // Fast path: the section this thread anchors to is byte-identical to the
    // prior version (its subtree hash matched), so its state from that version
    // stands; skip the quote scan. Only applies when the slug still exists in
    // the new section set, and not to an orphan, whose state needs recomputing.
    if (unchangedSlugs.has(root.anchor_slug) && bySlug.has(root.anchor_slug) && !root.orphaned) {
      continue;
    }

    const quote = root.selector_quote ? normalize(root.selector_quote) : null;

    // Tier 1: quote still lives in its own section.
    if (quote) {
      const ownNorm = normBySlug.get(root.anchor_slug);
      if (ownNorm !== undefined) {
        const hit = locateQuote(ownNorm, quote);
        if (hit) {
          await place(sql, root.id, {
            start: hit.at,
            state: hit.exact ? placedAt(root.anchor_slug) : "rewritten",
            currentQuote: hit.exact ? null : hit.text,
          });
          continue;
        }
        if (
          root.suggestion_state === "open" &&
          suggestionApplied(ownNorm, {
            prefix: root.selector_prefix ?? "",
            suffix: root.selector_suffix ?? "",
            replacement: root.suggestion_replacement ?? "",
          })
        ) {
          await sql`
            update comment
            set suggestion_state = 'applied', suggestion_state_by = 'system',
                suggestion_state_at = now()
            where id = ${root.id}
          `;
        }
      }
      // Tier 2: quote found in some other section → relink slug + start.
      let matched: { slug: string; hit: QuoteMatch } | null = null;
      for (const s of sections) {
        if (s.anchorSlug === root.anchor_slug) continue;
        const hit = locateQuote(normBySlug.get(s.anchorSlug) ?? normalize(s.text), quote);
        if (hit) {
          matched = { slug: s.anchorSlug, hit };
          break;
        }
      }
      if (matched) {
        const { slug, hit } = matched;
        await place(sql, root.id, {
          slug,
          start: hit.at,
          state: hit.exact ? placedAt(slug) : "rewritten",
          currentQuote: hit.exact ? null : hit.text,
        });
        continue;
      }
    }

    // Tier 3: heading-level comment (or quote drifted) but slug still present.
    if (bySlug.has(root.anchor_slug)) {
      await keep(quote ? "section" : placedAt(root.anchor_slug));
      continue;
    }
    // Tier 4: fingerprint match (heading renamed, same normalized text).
    const viaFingerprint = byFingerprint.get(root.anchor_fingerprint);
    if (viaFingerprint) {
      await place(sql, root.id, {
        slug: viaFingerprint.anchorSlug,
        state: quote ? "section" : placedAt(viaFingerprint.anchorSlug),
      });
      continue;
    }
    // Tier 5: no match → orphan.
    if (!root.orphaned) {
      await sql`
        update comment
        set orphaned = true, anchor_state = 'orphaned', anchor_current_quote = null
        where id = ${root.id}
      `;
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
  sql: Queryable,
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
        await sql`
          update comment set orphaned = false, anchor_state = 'exact' where id = ${root.id}
        `;
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
              code_file_hash = ${src.fileHash}, orphaned = false, anchor_state = 'moved'
          where id = ${root.id}
        `;
        continue;
      }
    }

    // Tier 3: gone → orphan.
    if (!root.orphaned) {
      await sql`
        update comment set orphaned = true, anchor_state = 'orphaned' where id = ${root.id}
      `;
    }
    orphaned++;
  }
  return orphaned;
}

/** Un-orphan a prose root and refresh its quote start offset. */
/** Re-place a thread root: un-orphan it with its new state, slug, and quote offset. */
async function place(
  sql: Queryable,
  id: string,
  p: { slug?: string; start?: number; state: AnchorState; currentQuote?: string | null },
): Promise<void> {
  const currentQuote = p.currentQuote ?? null;
  if (p.slug !== undefined && p.start !== undefined) {
    await sql`
      update comment
      set anchor_slug = ${p.slug}, selector_start = ${p.start}, orphaned = false,
          anchor_state = ${p.state}, anchor_current_quote = ${currentQuote}
      where id = ${id}
    `;
  } else if (p.slug !== undefined) {
    await sql`
      update comment
      set anchor_slug = ${p.slug}, orphaned = false,
          anchor_state = ${p.state}, anchor_current_quote = ${currentQuote}
      where id = ${id}
    `;
  } else {
    await sql`
      update comment
      set orphaned = false, selector_start = ${p.start ?? null},
          anchor_state = ${p.state}, anchor_current_quote = ${currentQuote}
      where id = ${id}
    `;
  }
}
