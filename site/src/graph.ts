// graph.ts — the single join between content pages and the estate model.
//
// It unifies content pages (docs + blogs) and their *effective* model
// references, and derives 1-hop related-content over the STABLE model edges
// only.
//
// A page's effective references are the union of:
//   • explicit `references:` frontmatter (docs + blogs),
//   • the `explains:` element an explanation page is canonical for (docs),
//   • (blogs only) the `element:` anchor of each of its `tags:` — the ADR-0004
//     hybrid join.
//
// (An `engines:`-derived join once contributed here too; it was dropped because
// the language↔engine↔implementation mapping it relied on was unsound — see
// docs/design/build-pipeline.md. A proper language × engine × client coverage
// model is deferred to a later, targeted effort.)
//
// IMPORT-CYCLE DISCIPLINE: this module imports content.ts (which eagerly
// imports every doc/blog MDX, and those MDX modules import <ModelRef> →
// model-refs.ts). So this module MUST NOT be imported by any MDX file. explain.ts
// / model-refs.ts / tags.ts / explain-bindings.ts do not import content.ts
// (content.ts registers into explain-bindings, not vice-versa), so pulling them
// in here is safe.

import { type ContentPage, pages } from "./content";
import { getExplainElement } from "./explain";
import { getTag } from "./tags";

// --- Effective references ---------------------------------------------------

function toRefIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

/**
 * Model element ids a page effectively references: explicit `references:` ∪
 * `explains:` ∪ (blogs) tag-element. The one place this union is defined.
 */
export function effectiveRefIds(page: ContentPage): string[] {
  const ids = new Set<string>(toRefIds(page.frontmatter.references));
  // The element a page is the canonical explanation of is a first-class
  // reference — it binds the page to that node the way the old model-side
  // `explainDoc` metadata used to. Mirrors frontmatter.py effective_reference_ids.
  if (typeof page.frontmatter.explains === "string" && page.frontmatter.explains) {
    ids.add(page.frontmatter.explains);
  }
  if (page.area === "blogs") {
    for (const tag of page.frontmatter.tags ?? []) {
      const element = getTag(tag).element;
      if (element) ids.add(element);
    }
  }
  return [...ids];
}

// --- Diátaxis bucketing -----------------------------------------------------

export type DiataxisKey = "tutorial" | "how-to" | "reference" | "explanation";

// Directory bucket (plural) → diataxis frontmatter value (singular), used as a
// fallback when a page omits the `diataxis:` field — and for UI that keys off
// the on-disk folder name (the review tree).
const BUCKET_TO_DIATAXIS: Record<string, DiataxisKey> = {
  tutorials: "tutorial",
  tutorial: "tutorial",
  "how-to": "how-to",
  reference: "reference",
  explanation: "explanation",
};

/** Resolve a folder name or frontmatter value to a Diátaxis key, if known. */
export function diataxisKeyOf(bucketOrAxis: string): DiataxisKey | null {
  if (
    bucketOrAxis === "tutorial" ||
    bucketOrAxis === "how-to" ||
    bucketOrAxis === "reference" ||
    bucketOrAxis === "explanation"
  ) {
    return bucketOrAxis;
  }
  return BUCKET_TO_DIATAXIS[bucketOrAxis] ?? null;
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
