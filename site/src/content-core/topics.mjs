/**
 * The product/topic axis: normalize a page's freeform blog `tags` and validated
 * doc `project` onto the controlled `topics` vocabulary in content/vocab.json.
 *
 * The review layer stores `topics text[]` per content version so the site can
 * answer "what changed for Delta / Unity Catalog / DuckDB?" with a single
 * `topics @> array[$1]` query, then aggregate the per-document Merkle tree diff
 * along that axis. Blog `tags` are freeform and drift (unity-catalog vs
 * unitycatalog, delta-lake vs delta-kernel), and docs carry no tags at all — only
 * a `project`. This module is the ONE place that reconciles both into canonical
 * topic ids, mirroring how vocab.mjs is the one place the other vocabularies live.
 *
 * Node-only (reads vocab.json via vocab.mjs). Re-exported from node.mjs, never
 * from the browser-safe index.mjs.
 */
import { vocab } from "./vocab.mjs";

/** Canonical topic ids (controlled vocabulary). */
export const TOPICS = vocab.topics ?? [];
/** Spelling/alias → canonical id (or null to deliberately drop, e.g. "devrel"). */
export const TOPIC_SYNONYMS = vocab.topicSynonyms ?? {};

const CANONICAL = new Set(TOPICS);

/**
 * Fold one raw label (a blog tag or a doc project) to a canonical topic id.
 * Returns the canonical id, or null if the label is unknown / deliberately
 * dropped. A label already canonical passes through; a known synonym is folded;
 * anything else is null (the caller decides whether to warn).
 */
export function canonicalizeTopic(label) {
  if (typeof label !== "string") return null;
  const key = label.trim().toLowerCase();
  if (!key) return null;
  if (CANONICAL.has(key)) return key;
  if (key in TOPIC_SYNONYMS) return TOPIC_SYNONYMS[key]; // may be null (dropped)
  return null;
}

/**
 * Normalize a page's product/topic axis to a deduped, sorted list of canonical
 * topic ids. `tags` is the blog frontmatter array; `project` is the doc project.
 * Unknown labels are dropped; when `warn` is provided it is called once per
 * dropped label (so manifest generation can surface vocab drift without failing
 * the build). Sorted so the stored array is deterministic across runs.
 *
 * @param {{ tags?: string[], project?: string, warn?: (label: string) => void }} input
 * @returns {string[]}
 */
export function normalizeTopics({ tags, project, warn } = {}) {
  const out = new Set();
  const raw = [];
  if (Array.isArray(tags)) raw.push(...tags);
  if (project) raw.push(project);
  for (const label of raw) {
    const id = canonicalizeTopic(label);
    if (id) {
      out.add(id);
    } else if (
      // Only warn for genuinely-unknown labels, not ones synonyms map to null
      // (an intentional drop like "devrel") and not empty/non-string junk.
      typeof label === "string" &&
      label.trim() &&
      warn &&
      !(label.trim().toLowerCase() in TOPIC_SYNONYMS)
    ) {
      warn(label);
    }
  }
  return [...out].sort();
}
