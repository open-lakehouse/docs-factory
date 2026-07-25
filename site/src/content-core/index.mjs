/**
 * content-core — the single authority for the docs-factory content-parsing
 * contract: fence resolution, heading slugging, path identity, text
 * normalization, frontmatter split. Consumed by the render plugin
 * (remark-code-snippets), the version manifest (build-version-manifest.mjs),
 * the site libs (content-source.ts, content-ref.ts), and the review server
 * (anchor.ts). See docs/design/build-pipeline.md.
 */
export * from "./normalize.mjs";
export * from "./hash.mjs";
export * from "./fences.mjs";
export * from "./slug.mjs";
export * from "./identity.mjs";
export * from "./frontmatter.mjs";
export * from "./walk.mjs";
export * from "./pipeline.mjs";
export { vocab, DIATAXIS, PROJECTS, STATUSES, PAGE_WORTHY_KINDS } from "./vocab.mjs";
