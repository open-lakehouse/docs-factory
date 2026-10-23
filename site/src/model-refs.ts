// model-refs.ts — resolve links between prose (docs/blogs) and the estate model.
//
// Two linkage mechanisms share these helpers:
//   • inline `[label](model:<id>)` links (remark-model-links -> <ModelRef>)
//   • page-level `references:` frontmatter (projection / JSON-LD; preview lookups)
//
// Unlike explain.ts (which only concerns itself with page-worthy kinds), this
// layer resolves ANY element id and computes the reverse index (backlinks) from
// content frontmatter, so the model becomes a bidirectional navigation index.

import type { ElementModel } from "likec4/model";
import { kindLabel, likec4model } from "./explain";
import { explanationHref } from "./explain-bindings";

/** Any element in the estate model, or null if the id is unknown. */
export function findModelElement(id: string): ElementModel | null {
  return likec4model.findElement(id) ?? null;
}

/** Route to the content page that canonically explains this element, or null if
 * no page declares `explains: <id>` yet (see explain-bindings.ts). */
export function modelHref(id: string): string | null {
  return explanationHref(id);
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
