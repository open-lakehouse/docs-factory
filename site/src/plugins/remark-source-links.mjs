/**
 * remark-source-links — resolve *source-relative* Markdown links (one blog/doc
 * referring to another) into the in-app route the site actually serves.
 *
 * Authors write cross-references as ordinary relative links so the source still
 * renders on GitHub and in any plain-Markdown viewer, e.g. from
 * `content/delta/explanation/002-delta-kernel-architecture.md`:
 *
 *     [what is delta lake](./what-is-delta-lake.md)
 *     [table features](../reference/table-features.md)
 *
 * MDX leaves those raw relative URLs on the `<a>`, so in the preview they
 * resolve against the *current browser route* (`/docs/delta/explanation/...`)
 * and 404. This plugin rewrites each such link to the canonical route
 * (`/docs/delta/reference/table-features`).
 *
 * Resolution goes through the repo's path→identity authority
 * (content-core/identity.mjs), NOT a raw file lookup, because:
 *   - files carry a leading `NNN-` order prefix on disk
 *     (`001-what-is-delta-lake.md`) that is NOT part of the URL slug — authors
 *     link against the prefix-less logical slug (`./what-is-delta-lake.md`);
 *   - folder-mode pages (`<slug>/index.md`) are addressed by their folder.
 * Both forms normalize (via parseDocPath → stripOrderPrefix / normalizeDocPath)
 * to the same identity that the page registry is keyed on, so the author never
 * has to know the on-disk prefix or the index.md filename.
 *
 * Unresolvable links (a target that isn't a published page — README.md,
 * `blogs/CONVENTIONS.md`, `../site/README.md`, or a typo) are left INERT: a
 * single warning is logged and `node.url` is passed through unchanged, so the
 * preview never crashes.
 *
 * KNOWN LIMITATION: the injected `knownHrefs` registry is built from paths
 * only, so it does not see a page's `slug:` frontmatter override. A link that
 * targets a page which renamed its URL via `slug:` won't match and will warn +
 * stay inert (rather than resolving to the pre-override slug). This is rare and
 * acceptable under the warn-and-inert policy.
 *
 * @param {{ knownHrefs?: Set<string> }} [opts]
 *   knownHrefs — the set of published in-app hrefs (built in vite.config.ts from
 *   the same globs content.ts uses). A resolved candidate must be in this set to
 *   be rewritten; otherwise the link is left inert.
 */
import { dirname, resolve } from "node:path";

import { docIdentity, hrefFromIdentity } from "../content-core/identity.mjs";

// A URL is source-relative-linkable only if its path part points at a Markdown
// source file. Split an optional `#anchor` (and any `?query`) off first.
const MD_PATH_RE = /\.mdx?$/;

/** External / already-absolute / other-scheme URLs we must not touch. */
function isExternalOrAbsolute(url) {
  return (
    /^([a-z][a-z0-9+.-]*:)?\/\//i.test(url) || // http(s)://, protocol-relative //
    /^[a-z][a-z0-9+.-]*:/i.test(url) || // mailto:, data:, model:, tel:, etc.
    url.startsWith("/") || // site-absolute
    url.startsWith("#") // bare in-page anchor
  );
}

export default function remarkSourceLinks(opts = {}) {
  const knownHrefs = opts.knownHrefs ?? null;

  return (tree, file) => {
    const mdPath = file?.history?.[0] ?? file?.path;
    if (!mdPath) return;
    const mdDir = dirname(mdPath);

    const walk = (node) => {
      if (node.type === "link" && typeof node.url === "string") {
        rewrite(node);
      }
      if (node.children) for (const child of node.children) walk(child);
    };

    const rewrite = (node) => {
      const url = node.url;
      if (isExternalOrAbsolute(url)) return;

      // Peel off a trailing `#anchor` (and any `?query`) so we resolve just the
      // path, then re-append the fragment to the rewritten href.
      const hashAt = url.indexOf("#");
      const pathPart = hashAt === -1 ? url : url.slice(0, hashAt);
      const fragment = hashAt === -1 ? "" : url.slice(hashAt);
      if (!MD_PATH_RE.test(pathPart)) return; // not a .md/.mdx target

      const absTarget = resolve(mdDir, pathPart);
      const candidate = hrefFromIdentity(docIdentity(absTarget));
      if (candidate && (!knownHrefs || knownHrefs.has(candidate))) {
        node.url = candidate + fragment;
        return;
      }

      // Unresolvable — leave inert, warn once.
      console.warn(
        `remark-source-links: unresolved ${url} in ${mdPath}` +
          (candidate ? ` → ${candidate} (not a published page)` : ""),
      );
    };

    walk(tree);
  };
}
