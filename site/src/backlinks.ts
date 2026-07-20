// backlinks.ts — reverse index from a model element id to the content pages
// that reference it.
//
// The join and the index now live in graph.ts (the single unifier), which owns
// `effectiveRefIds` and the element-id → pages map so the reverse index and the
// facet filters can never disagree. This module stays as the stable import
// surface for consumers that only need the reverse lookup (e.g. ExplainPage).
//
// A page references an element three ways (all handled by graph.effectiveRefIds):
//   • explicit `references:` frontmatter (docs + blogs),
//   • an `engines:` slug mapped to its model element (docs + blogs), so a
//     multi-engine how-to surfaces under every engine node it exercises,
//   • (blogs) a `tags:` entry whose tags.yml registry carries an `element:`
//     anchor — the ADR-0004 hybrid join.
//
// IMPORT-CYCLE NOTE: graph.ts imports content.ts (which eagerly imports every
// doc/blog MDX, and those MDX modules import <ModelRef> → model-refs). So
// neither graph.ts nor this module may be imported by any MDX file — only
// route/index components consume them, keeping the chain acyclic.

export { backlinksFor, effectiveRefIds } from "./graph";
