// graph.ts — the single join between content pages and the estate model.
//
// This is the runtime "knowledge graph" the navigation reads from: it unifies
//   • content pages (docs + blogs) and their *effective* model references,
//   • model nodes (capabilities / specifications / implementations) grouped for
//     the concept index,
//   • the inverse index (element id → pages) that powers "referenced by",
//   • 1-hop related-content over the STABLE model edges only.
//
// A page's effective references are the union of:
//   • explicit `references:` frontmatter (docs + blogs),
//   • the engine elements its `engines:` slugs map to (docs + blogs), so a
//     multi-engine how-to joins every engine node it exercises without the
//     author hand-writing them,
//   • (blogs only) the `element:` anchor of each of its `tags:` — the ADR-0004
//     hybrid join.
//
// IMPORT-CYCLE DISCIPLINE (see backlinks.ts): this module imports content.ts
// (which eagerly imports every doc/blog MDX, and those MDX modules import
// <ModelRef> → model-refs.ts). So this module MUST NOT be imported by any MDX
// file — only route/index components (AxisIndex, ExplainPage, DocPage) import
// it. explain.ts / model-refs.ts / tags.ts / engine-map.ts do
// not import content.ts, so pulling them in here is safe.

import { pages, docs, type ContentPage } from "./content";
import { getTag } from "./tags";
import { resolveRef, type ModelRefInfo } from "./model-refs";
import { getExplainElement } from "./explain";
import { ENGINE_ELEMENT } from "./engine-map";

// --- Effective references ---------------------------------------------------

function toRefIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

/**
 * Model element ids a page effectively references: explicit `references:` ∪
 * engine-slug-derived ∪ (blogs) tag-element. The one place this union is
 * defined; backlinks.ts re-exports it so the reverse index and the facet
 * filters agree.
 */
export function effectiveRefIds(page: ContentPage): string[] {
  const ids = new Set<string>(toRefIds(page.frontmatter.references));
  if (page.area === "blogs") {
    for (const tag of page.frontmatter.tags ?? []) {
      const element = getTag(tag).element;
      if (element) ids.add(element);
    }
  }
  for (const engine of page.frontmatter.engines ?? []) {
    const element = ENGINE_ELEMENT[engine];
    if (element) ids.add(element);
  }
  return [...ids];
}

// --- Reverse index (element id → pages) -------------------------------------

const backlinks = new Map<string, ContentPage[]>();
for (const page of pages) {
  for (const id of effectiveRefIds(page)) {
    const list = backlinks.get(id);
    if (list) list.push(page);
    else backlinks.set(id, [page]);
  }
}

/** Content pages that reference this element id (explicit, engine, or tag). */
export function backlinksFor(id: string): ContentPage[] {
  return backlinks.get(id) ?? [];
}

// --- Facet filtering (axis indexes) -----------------------------------------

/**
 * Pages (from any set) matching the active facets.
 *   • refIds  → AND: a page must reference *all* selected concept nodes.
 *   • engineIds (slugs) → OR: a page shown if it exercises *any* selected engine
 *     ("show me pages that cover Polars or DuckDB" is the natural query).
 * Empty facets → the input set unchanged. The AND/OR asymmetry is deliberate.
 */
export function pagesByRefs(
  pageSet: ContentPage[],
  refIds: string[],
  engineSlugs: string[],
): ContentPage[] {
  const refs = refIds.map((r) => r.trim()).filter(Boolean);
  const engines = engineSlugs.map((e) => e.trim()).filter(Boolean);
  if (refs.length === 0 && engines.length === 0) return pageSet;

  return pageSet.filter((page) => {
    const effective = new Set(effectiveRefIds(page));
    const refsOk = refs.every((r) => effective.has(r));
    const enginesOk =
      engines.length === 0 ||
      engines.some((slug) => {
        const element = ENGINE_ELEMENT[slug];
        return element ? effective.has(element) : false;
      });
    return refsOk && enginesOk;
  });
}

/** All docs matching the active facets (thin wrapper over `pagesByRefs`). */
export function docsByRefs(refIds: string[], engineSlugs: string[]): ContentPage[] {
  return pagesByRefs(docs, refIds, engineSlugs);
}

// --- Diátaxis bucketing -----------------------------------------------------

export type DiataxisKey = "tutorial" | "how-to" | "reference" | "explanation";

export interface DiataxisBuckets {
  tutorial: ContentPage[];
  "how-to": ContentPage[];
  reference: ContentPage[];
  explanation: ContentPage[];
}

// Directory bucket (plural) → diataxis frontmatter value (singular), used as a
// fallback when a page omits the `diataxis:` field.
const BUCKET_TO_DIATAXIS: Record<string, DiataxisKey> = {
  tutorials: "tutorial",
  "how-to": "how-to",
  reference: "reference",
  explanation: "explanation",
};

function diataxisOf(page: ContentPage): DiataxisKey | null {
  const fm = page.frontmatter.diataxis;
  if (fm === "tutorial" || fm === "how-to" || fm === "reference" || fm === "explanation") {
    return fm;
  }
  if (page.bucket && page.bucket in BUCKET_TO_DIATAXIS) {
    return BUCKET_TO_DIATAXIS[page.bucket];
  }
  return null;
}

/** Split a set of pages into the four Diátaxis buckets (keyed by singular vocab). */
export function bucketByDiataxis(pageSet: ContentPage[]): DiataxisBuckets {
  const buckets: DiataxisBuckets = {
    tutorial: [],
    "how-to": [],
    reference: [],
    explanation: [],
  };
  for (const page of pageSet) {
    const key = diataxisOf(page);
    if (key) buckets[key].push(page);
  }
  return buckets;
}

export const DIATAXIS_LABELS: Record<DiataxisKey, string> = {
  tutorial: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanation",
};

/** Diátaxis keys in reading order — Learn → Do → Look up → Understand. */
export const DIATAXIS_ORDER: DiataxisKey[] = [
  "tutorial",
  "how-to",
  "reference",
  "explanation",
];

// --- Facet vocabularies -----------------------------------------------------

/**
 * Model ids that at least one page in the given area references — so facet
 * chips only ever show nodes that actually filter something. Resolved to
 * ModelRefInfo (title + card data) and sorted by title.
 */
export function referencedConcepts(area?: "docs" | "blogs"): ModelRefInfo[] {
  const ids = new Set<string>();
  for (const page of pages) {
    if (area && page.area !== area) continue;
    for (const id of effectiveRefIds(page)) ids.add(id);
  }
  return [...ids]
    .map(resolveRef)
    .filter((r): r is ModelRefInfo => r !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

// --- Related content (1-hop, stable edges only) -----------------------------

// Only the stable altitude edges (ADR-0005) are walked for relatedness — the
// spec/implementation layer whose ids don't churn. Widening this to functional
// edges (`governs`, `vends`, `flows`, `consumes`) waits until the logical-layer
// vocabulary settles (see the plan's deferred follow-ups). Keeping it a single
// constant makes that a one-line change.
const RELATED_EDGE_KINDS = new Set<string>(["specifies", "realizes", "implements"]);

function isRelatedEdge(kind: string | null | undefined): boolean {
  return kind != null && RELATED_EDGE_KINDS.has(kind);
}

/** An id plus its 1-hop neighbors along the stable edges (both directions). */
function expandStable(ids: string[]): Set<string> {
  const out = new Set<string>(ids);
  for (const id of ids) {
    const el = getExplainElement(id);
    if (!el) continue;
    for (const rel of el.outgoing()) {
      if (isRelatedEdge(rel.kind)) out.add(String(rel.target.id));
    }
    for (const rel of el.incoming()) {
      if (isRelatedEdge(rel.kind)) out.add(String(rel.source.id));
    }
  }
  return out;
}

/**
 * Pages related to this one via shared model neighborhood: expand the page's
 * effective references by one hop along the stable edges, then rank other pages
 * by how many of those expanded ids they also reference. Same-project ties
 * break first, then by overlap. Excludes the page itself.
 */
export function relatedPages(page: ContentPage, limit = 6): ContentPage[] {
  const neighborhood = expandStable(effectiveRefIds(page));
  if (neighborhood.size === 0) return [];

  const scored: { page: ContentPage; overlap: number }[] = [];
  for (const other of pages) {
    if (other.href === page.href) continue;
    const overlap = effectiveRefIds(other).filter((id) => neighborhood.has(id)).length;
    if (overlap > 0) scored.push({ page: other, overlap });
  }

  scored.sort((a, b) => {
    const sameA = a.page.project === page.project ? 1 : 0;
    const sameB = b.page.project === page.project ? 1 : 0;
    if (sameA !== sameB) return sameB - sameA;
    if (a.overlap !== b.overlap) return b.overlap - a.overlap;
    return (a.page.frontmatter.title ?? a.page.slug).localeCompare(
      b.page.frontmatter.title ?? b.page.slug,
    );
  });

  return scored.slice(0, limit).map((s) => s.page);
}
