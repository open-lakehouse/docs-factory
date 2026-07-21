// engine-map.ts — reconcile the frontmatter `engines:` vocabulary with the
// estate model's `implementation` elements, so an engine a how-to exercises
// becomes a first-class navigable node without authors hand-writing a
// `references:` entry for it.
//
// The two vocabularies are parallel but distinct: `engines:` is a language/tool
// slug that drives engine-tabbed code snippets; the model element is the
// architecture node. Do NOT try to derive this from `-[realizes]-> queryEngine`
// — `deltaRs` doesn't realize the query-engine capability (it only implements
// deltaSpec), and both `rust` and `python` name the same delta-rs library. An
// explicit map is the only correct source.
//
// Mirror any change here in tools/docsnip/src/docsnip/frontmatter.py
// (ENGINE_ELEMENT), which uses it for coverage counting.

/** Frontmatter engine slug → LikeC4 `implementation` element id. */
export const ENGINE_ELEMENT: Record<string, string> = {
  python: "deltaRs", // delta-rs Python binding (deltalake)
  rust: "deltaRs", // delta-rs, the Rust library
  polars: "polars",
  duckdb: "duckdb",
  spark: "deltaSpark", // the Delta connector authors exercise
  typescript: "deltaRs", // TS Delta access is via delta-rs bindings today
};

/** Accepted engine slugs (mirror of docsnip's ENGINES vocabulary). */
export const ENGINE_SLUGS = Object.keys(ENGINE_ELEMENT);

/** Distinct engine element ids — the "engines" group in the concept index. */
export const ENGINE_ELEMENT_IDS = [...new Set(Object.values(ENGINE_ELEMENT))];

/** Whether a model element id is one an engine slug maps to. */
export function isEngineElement(id: string): boolean {
  return ENGINE_ELEMENT_IDS.includes(id);
}
