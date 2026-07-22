// explain-bindings.ts — the element-id → explanation-page href registry.
//
// Explanation prose now lives as an ordinary content page under
// content/**/explanation/ whose frontmatter declares `explains: <id>`. The model
// element points *at* that page by relationship rather than owning its body, and
// there is no /explain/<id> route: a concept's canonical URL is its doc page.
//
// IMPORT-CYCLE NOTE: this module has NO imports. It cannot pull in content.ts,
// because content.ts eagerly imports every doc/blog MDX and those MDX modules
// import <ModelRef> → model-refs.ts → this module. Instead content.ts *registers*
// its explanation pages here at module-eval time (register()), and the MDX-chain
// readers (model-refs.ts, ModelDiagram, …) look them up. content.ts always
// evaluates before any route renders, so the registry is populated in time.

// id -> the href of the content page that canonically explains it.
const hrefByElement = new Map<string, string>();

/** Called once by content.ts for each page with an `explains:` id. First
 * registration wins (docsnip makes a duplicate `explains:` a hard error). */
export function registerExplanation(id: string, href: string): void {
  if (id && !hrefByElement.has(id)) hrefByElement.set(id, href);
}

/** The doc-page href that canonically explains this element id, or null. */
export function explanationHref(id: string): string | null {
  return hrefByElement.get(id) ?? null;
}

/** Whether some content page is the canonical explanation of this element id. */
export function hasExplanationPage(id: string): boolean {
  return hrefByElement.has(id);
}
