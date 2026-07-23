/**
 * Shared content discovery helpers — one place for path parsing so content.ts
 * and sidebar.ts don't each re-derive project/bucket/slug.
 *
 * Two on-disk layouts produce the same logical doc:
 *   - file mode:   content/<project>/<bucket>/<slug>.md
 *   - folder mode: content/<project>/<bucket>/<slug>/index.md   (testable,
 *                  colocated tutorials — the folder carries the script, tests,
 *                  and compose alongside index.md; see PR #49)
 * In folder mode the `index` filename is not the slug — the *folder* is. All the
 * helpers below normalize a folder-mode path down to its directory first, so
 * both layouts yield the same {project, bucket, slug}.
 *
 * A leading `NNN-` prefix on the slug-bearing segment is an ordering signal, not
 * identity, so `parseDocPath` strips it from the slug (`002-python-client` →
 * `python-client`); `orderKeyFromPath` returns the prefixed name for the sidebar
 * to sort on. A doc may still override its URL slug with a `slug:` frontmatter
 * field so it can be renamed without breaking the URL. Path parsing here only
 * knows the on-disk name; the frontmatter override is applied by callers that
 * have the frontmatter (see content.ts / sidebar.ts).
 *
 * NOTE: `import.meta.glob(...)` requires a LITERAL string argument (Vite static
 * analysis), so the glob patterns are inlined at each call site; they cannot be
 * passed as variables from here.
 */

/**
 * Normalize a doc path so its last segment is always the slug-bearing one, and
 * strip the extension. File mode is returned as `.../<slug>`; folder mode
 * (`.../<slug>/index.md[x]`) has its `index` filename dropped so `.../<slug>`
 * becomes the leaf. Either way the last three segments are project/bucket/slug.
 */
function normalizeDocPath(path: string): string {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] ?? "";
  if (/^index\.mdx?$/.test(filename)) {
    return parts.slice(0, -1).join("/");
  }
  return path.replace(/\.mdx?$/, "");
}

export function slugFromBlogPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] ?? path;
}

/**
 * A leading `NNN-` numeric prefix on a filename/folder is an ORDERING signal for
 * the sidebar (see sidebar.ts), not part of the identity — strip it so the slug
 * (and thus the URL) is clean without every doc needing a `slug:` override.
 * `002-python-client` → `python-client`, `01-intro` → `intro`. A doc can still
 * set `slug:` in frontmatter to override this derived slug (see content.ts).
 */
function stripOrderPrefix(segment: string): string {
  return segment.replace(/^\d+-/, "");
}

export function parseDocPath(path: string): { project: string; bucket: string; slug: string } {
  const parts = normalizeDocPath(path).split("/");
  return {
    project: parts[parts.length - 3] ?? "",
    bucket: parts[parts.length - 2] ?? "",
    slug: stripOrderPrefix(parts[parts.length - 1] ?? ""),
  };
}

/**
 * The raw last path segment WITH its `NNN-` order prefix intact — the sidebar's
 * within-bucket sort key. Kept separate from `slug` (which strips the prefix for
 * the URL) so ordering lives on disk while routes stay clean.
 */
export function orderKeyFromPath(path: string): string {
  const parts = normalizeDocPath(path).split("/");
  return parts[parts.length - 1] ?? "";
}

export function projectFromPath(filePath: string): string {
  return parseDocPath(filePath).project;
}

export function bucketFromPath(filePath: string): string {
  return parseDocPath(filePath).bucket;
}

export function slugFromPath(filePath: string): string {
  return parseDocPath(filePath).slug;
}

/** All doc file paths discovered at build time (keys from import.meta.glob).
 * This file is one level deeper than src/, hence `../../../content`. */
export const docPaths = Object.keys(
  import.meta.glob("../../../content/{delta,unitycatalog,open-lakehouse}/**/*.{md,mdx}", { eager: true }),
).filter((p) => !p.endsWith("/README.md"));
