// backlinks.ts — reverse index from a model element id to the content pages
// whose `references:` frontmatter names it.
//
// Kept SEPARATE from model-refs.ts on purpose: this module imports content.ts
// (which eagerly imports every doc/blog MDX). Those MDX modules can import
// <ModelRef>, so if model-refs.ts imported content.ts we'd form a cycle
// (content -> MDX -> ModelRef -> model-refs -> content) that leaves `pages`
// uninitialised at eval time and blanks the whole app. Only the explain page
// consumes backlinks, and no MDX imports this module, so the chain stays acyclic.

import { pages, type ContentPage } from "./content";

function toRefIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}

const backlinks = new Map<string, ContentPage[]>();
for (const page of pages) {
  for (const id of toRefIds(page.frontmatter.references)) {
    const list = backlinks.get(id);
    if (list) list.push(page);
    else backlinks.set(id, [page]);
  }
}

/** Content pages whose `references:` frontmatter names this element id. */
export function backlinksFor(id: string): ContentPage[] {
  return backlinks.get(id) ?? [];
}
