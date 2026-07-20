// backlinks.ts — reverse index from a model element id to the content pages
// that reference it. A page references an element two ways:
//   • explicit `references:` frontmatter (docs + blogs)
//   • (blogs) a `tags:` entry whose tags.yml registry carries an `element:`
//     anchor — the ADR-0004 hybrid join, so posts surface via their topics
//     without hand-writing `references:`.
//
// Kept SEPARATE from model-refs.ts on purpose: this module imports content.ts
// (which eagerly imports every doc/blog MDX). Those MDX modules can import
// <ModelRef>, so if model-refs.ts imported content.ts we'd form a cycle
// (content -> MDX -> ModelRef -> model-refs -> content) that leaves `pages`
// uninitialised at eval time and blanks the whole app. Only the explain page
// consumes backlinks, and no MDX imports this module, so the chain stays acyclic.
// (tags.ts imports model-refs/EntityCard, neither of which imports content, so
// pulling in getTag here does not reintroduce the cycle.)

import { pages, type ContentPage } from "./content";
import { getTag } from "./tags";

function toRefIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}

/** Element ids a page references: explicit `references:` ∪ tag-derived (blogs). */
function effectiveRefIds(page: ContentPage): string[] {
  const ids = new Set(toRefIds(page.frontmatter.references));
  if (page.area === "blogs") {
    for (const tag of page.frontmatter.tags ?? []) {
      const element = getTag(tag).element;
      if (element) ids.add(element);
    }
  }
  return [...ids];
}

const backlinks = new Map<string, ContentPage[]>();
for (const page of pages) {
  for (const id of effectiveRefIds(page)) {
    const list = backlinks.get(id);
    if (list) list.push(page);
    else backlinks.set(id, [page]);
  }
}

/** Content pages that reference this element id (explicit or tag-derived). */
export function backlinksFor(id: string): ContentPage[] {
  return backlinks.get(id) ?? [];
}
