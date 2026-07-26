/**
 * Canonical content path → identity.
 *
 * Two on-disk layouts produce the same logical doc:
 *   - file mode:   content/<project>/<bucket>/<slug>.md
 *   - folder mode: content/<project>/<bucket>/<slug>/index.md
 * In folder mode the `index` filename is not the slug — the *folder* is. A
 * leading `NNN-` prefix on the slug-bearing segment is an ordering signal, not
 * identity, so it is stripped from the slug. A doc may override its URL slug with
 * a `slug:` frontmatter field.
 *
 * This is THE authority for that mapping. site/src/lib/content-source.ts
 * re-exports these pure functions (keeping only its Vite-only `docPaths` glob),
 * and site/scripts/build-version-manifest.mjs uses {@link docIdentity} — which
 * previously derived the slug inline as `parts[last]`, so folder-mode pages
 * registered `slug="index"` and could never match the site's docRef. Going
 * through one function fixes that by construction.
 */

/**
 * Normalize a doc path so its last segment is the slug-bearing one, extension
 * stripped. Folder mode (a slug dir holding index.md[x]) drops the index
 * filename so the folder is the leaf; file mode strips the extension. Either way the last
 * three segments are project/bucket/slug.
 */
export function normalizeDocPath(path) {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] ?? "";
  if (/^index\.mdx?$/.test(filename)) {
    return parts.slice(0, -1).join("/");
  }
  return path.replace(/\.mdx?$/, "");
}

/** Strip a leading `NNN-` order prefix: `002-python-client` → `python-client`. */
export function stripOrderPrefix(segment) {
  return segment.replace(/^\d+-/, "");
}

/** Blog slug = the folder name (the slug dir under blogs holding index.md). */
export function slugFromBlogPath(path) {
  const parts = path.split("/");
  return parts[parts.length - 2] ?? path;
}

/** Parse a doc path into `{project, bucket, slug}` (slug: order-prefix stripped). */
export function parseDocPath(path) {
  const parts = normalizeDocPath(path).split("/");
  return {
    project: parts[parts.length - 3] ?? "",
    bucket: parts[parts.length - 2] ?? "",
    slug: stripOrderPrefix(parts[parts.length - 1] ?? ""),
  };
}

/** The raw last segment WITH its `NNN-` prefix intact — the sidebar sort key. */
export function orderKeyFromPath(path) {
  const parts = normalizeDocPath(path).split("/");
  return parts[parts.length - 1] ?? "";
}

export function projectFromPath(filePath) {
  return parseDocPath(filePath).project;
}
export function bucketFromPath(filePath) {
  return parseDocPath(filePath).bucket;
}
export function slugFromPath(filePath) {
  return parseDocPath(filePath).slug;
}

/**
 * Full logical identity of a content file, applying the `slug:` frontmatter
 * override the way the site's content.ts does. Blogs are `{area:"blogs", slug}`;
 * docs are `{area:"docs", project, bucket, slug}`. This is what the version
 * manifest registers, so it must match the site's blogRef/docRef exactly.
 */
export function docIdentity(path, meta = {}) {
  // A blog post is `blogs/<slug>/index.md` (walkBlogs yields absolute paths, so
  // match `/blogs/` or a leading `blogs/`). Everything else is a doc page.
  if (path.endsWith("/index.md") && /(^|\/)blogs\//.test(path)) {
    return { area: "blogs", slug: slugFromBlogPath(path) };
  }
  const { project, bucket, slug: pathSlug } = parseDocPath(path);
  const fmSlug = meta.slug;
  const slug = typeof fmSlug === "string" && fmSlug ? fmSlug : pathSlug;
  return { area: "docs", project, bucket, slug };
}

/**
 * The in-app route for a logical identity, matching the site's App.tsx routing
 * and content.ts href construction: `/blog/<slug>` for blogs, and
 * `/docs/<project>/<bucket>/<slug>` for docs. This is the string form of
 * site/src/lib/content-ref.ts#refHref for a `docIdentity` value, kept here so
 * the framework-free content-core owns the mapping (used by remark-source-links
 * to resolve source-relative links). Returns null if a docs identity is missing
 * a component (project/bucket/slug).
 */
export function hrefFromIdentity(identity) {
  if (!identity) return null;
  if (identity.area === "blogs") {
    return identity.slug ? `/blog/${identity.slug}` : null;
  }
  const { project, bucket, slug } = identity;
  if (!project || !bucket || !slug) return null;
  return `/docs/${project}/${bucket}/${slug}`;
}
