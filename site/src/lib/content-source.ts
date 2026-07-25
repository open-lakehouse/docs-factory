/**
 * Shared content discovery helpers. The path→identity logic now lives ONCE in
 * site/src/content-core/identity.mjs (shared with the version manifest and the
 * review server); this module re-exports the pure functions and keeps only the
 * Vite-coupled `docPaths` glob, which cannot move because `import.meta.glob(...)`
 * requires a literal string argument (Vite static analysis).
 *
 * Two on-disk layouts produce the same logical doc:
 *   - file mode:   content/<project>/<bucket>/<slug>.md
 *   - folder mode: content/<project>/<bucket>/<slug>/index.md
 * A leading `NNN-` prefix on the slug-bearing segment is an ordering signal, not
 * identity; `parseDocPath` strips it, `orderKeyFromPath` keeps it for the sidebar
 * sort. A doc may override its URL slug with a `slug:` frontmatter field, applied
 * by callers that have the frontmatter (see content.ts / sidebar.ts).
 */
export {
  parseDocPath,
  orderKeyFromPath,
  slugFromBlogPath,
  projectFromPath,
  bucketFromPath,
  slugFromPath,
} from "../content-core/identity.mjs";

/** All doc file paths discovered at build time (keys from import.meta.glob).
 * This file is one level deeper than src/, hence `../../../content`. */
export const docPaths = Object.keys(
  import.meta.glob("../../../content/{delta,unitycatalog,open-lakehouse}/**/*.{md,mdx}", { eager: true }),
).filter((p) => !p.endsWith("/README.md"));
