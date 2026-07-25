/**
 * content-core — the single authority for the docs-factory content-parsing
 * contract: fence resolution, heading slugging, path identity, text
 * normalization, frontmatter split. Consumed by the render plugin
 * (remark-code-snippets), the version manifest (build-version-manifest.mjs),
 * the site libs (content-source.ts, content-ref.ts), and the review server
 * (anchor.ts). See docs/design/build-pipeline.md.
 *
 * THIS BARREL IS BROWSER-SAFE: it re-exports only the pure, Node-free modules
 * (no `node:crypto` / `node:fs` / `node:child_process`). Importing it can never
 * drag Node built-ins into a Vite client bundle — that regression (PR #62)
 * stays impossible by construction. The Node-only modules (hash, frontmatter,
 * walk, pipeline, vocab) are re-exported from the sibling `node.mjs` barrel, or
 * imported directly by leaf path. Do NOT add a Node-only re-export here.
 */
export * from "./normalize.mjs";
export * from "./fences.mjs";
export * from "./slug.mjs";
export * from "./identity.mjs";
