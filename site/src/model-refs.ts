// model-refs.ts — resolve links between prose (docs/blogs) and the estate model.
//
// Two linkage mechanisms share these helpers:
//   • inline `[label](model:<id>)` links (remark-model-links -> <ModelRef>)
//   • page-level `references:` frontmatter (ConceptHeader + backlinks)
//
// Unlike explain.ts (which only concerns itself with page-worthy kinds), this
// layer resolves ANY element id and computes the reverse index (backlinks) from
// content frontmatter, so the model becomes a bidirectional navigation index.

import type { ElementModel } from "likec4/model";
import { likec4model, hasExplainPage, explainHref, kindLabel } from "./explain";

// Fallback reference views (whole-estate) if an element has no scoped view.
const PREFERRED_VIEWS = ["capabilityMap", "technologyCatalog", "referenceContext"];

/** Any element in the estate model, or null if the id is unknown. */
export function findModelElement(id: string): ElementModel | null {
  return likec4model.findElement(id) ?? null;
}

/** Route to an element's explanation page, or null if its kind has no page. */
export function modelHref(id: string): string | null {
  return hasExplainPage(id) ? explainHref(id) : null;
}

/** Human label for the element (title), or the raw id if unknown. */
export function elementLabel(id: string): string {
  return findModelElement(id)?.title ?? id;
}

export interface ModelRefInfo {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  summary: string;
  href: string | null;
  externalUrl: string | null;
}

/** Resolve everything a UI needs to render a reference to an element. */
export function resolveRef(id: string): ModelRefInfo | null {
  const el = findModelElement(id);
  if (!el) return null;
  const summary = !el.summary.isEmpty
    ? el.summary.text
    : !el.description.isEmpty
      ? el.description.text
      : "";
  return {
    id,
    title: el.title,
    kind: el.kind,
    kindLabel: kindLabel(el.kind),
    summary,
    href: modelHref(id),
    externalUrl: el.links[0]?.url ?? null,
  };
}

/**
 * Pick the view to seed a diagram with for a given element. Prefer the
 * element's own scoped view (a `view of <element>` authored in
 * architecture/model/views/explain-views.likec4, surfaced as `element.defaultView`)
 * so the diagram is an ad-hoc neighborhood around the subject. Fall back to a
 * reference view, then any containing view. Single source of truth shared by
 * the explain page's diagram and the inline model popup.
 */
export function pickScopedViewId(id: string): string | null {
  const el = findModelElement(id);
  if (!el) return null;
  const scoped = el.defaultView;
  if (scoped) return String(scoped.id);
  const views = [...el.views()].map((v) => String(v.id));
  if (views.length === 0) return null;
  for (const preferred of PREFERRED_VIEWS) {
    if (views.includes(preferred)) return preferred;
  }
  return views[0];
}

/**
 * The element's OWN scoped view only (`view of <element>`, `include *` = the
 * node plus its direct neighbors) — a focused neighborhood, never a
 * whole-estate fallback. Used by the inline popup, which should always be
 * centered on the clicked node with just a little environment around it.
 * Returns null when no scoped view is authored for the element.
 */
export function focusedViewId(id: string): string | null {
  const el = findModelElement(id);
  const scoped = el?.defaultView;
  return scoped ? String(scoped.id) : null;
}
