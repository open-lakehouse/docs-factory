/**
 * Blog → docs links. Authors link a docs page from a post as a source-relative
 * path (`../../content/unitycatalog/how-to/024-marimo-remote-storage/index.md`)
 * so the draft still renders on GitHub. A post is read on another site, where
 * that path resolves against nothing, so the blog emit rewrites each one to the
 * page's absolute URL on its project's docs site (emit/docs/sites), the same
 * URL the docs emitter makes canonical.
 *
 * Only a page the docs emit publishes (`status: ready`) resolves. A link to a
 * draft page, another post, or any other `.md` source is unwrapped to its label
 * with a warning, so an emitted post never ships a link that 404s.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isEmitted, splitFrontmatter } from "../site/src/content-core/frontmatter.mjs";
import { canonicalUrl } from "../site/src/content-core/head.mjs";
import { docIdentity } from "../site/src/content-core/identity.mjs";
import { walkContent } from "../site/src/content-core/walk.mjs";
import remarkSourceLinks from "../site/src/plugins/remark-source-links.mjs";
import { DOCS_SITES } from "./docs/sites/index.mjs";
import remarkUnwrapDeadLinks from "./plugins/remark-unwrap-dead-links.mjs";

/** A docs identity's absolute URL on its project's own site, or null. */
export function docsUrlFor(identity, sites = DOCS_SITES) {
  if (identity?.area !== "docs") return null;
  const site = sites.find((s) => s.project === identity.project);
  return site ? canonicalUrl(identity, site.origin, site.hrefFor) : null;
}

/** The absolute URL of every page the docs sites publish. */
export function publishedDocsUrls(repoRoot, sites = DOCS_SITES) {
  const urls = new Set();
  for (const site of sites) {
    for (const absPath of walkContent(join(repoRoot, "content", site.project))) {
      const { meta } = splitFrontmatter(readFileSync(absPath, "utf8"));
      if (!isEmitted(meta)) continue;
      const url = docsUrlFor(docIdentity(absPath, meta), sites);
      if (url) urls.add(url);
    }
  }
  return urls;
}

/**
 * `url` as a root-relative path when it is on `siteUrl`'s host (`www.` or
 * not), so a post links docs its own site serves as internal links; else as is.
 */
export function onSite(url, siteUrl) {
  if (!siteUrl) return url;
  const host = (u) => new URL(u).host.replace(/^www\./, "");
  if (host(url) !== host(siteUrl)) return url;
  const { pathname, search, hash } = new URL(url);
  return `${pathname}${search}${hash}`;
}

/**
 * The `[plugin, options]` pairs a blog emit runs: resolve docs links, then
 * unwrap whatever is left pointing at a `.md` source. `siteUrl` is the post's
 * own site: docs on it are linked by path.
 *
 * @param {{ repoRoot: string, sites?: object[], knownUrls?: Set<string>, siteUrl?: string,
 *   onUnresolved?: (info: { url: string, mdPath: string, candidate: string | null }) => void }} o
 */
export function blogLinkPlugins({
  repoRoot,
  sites = DOCS_SITES,
  knownUrls,
  siteUrl,
  onUnresolved,
} = {}) {
  const known = knownUrls ?? publishedDocsUrls(repoRoot, sites);
  return [
    [
      remarkSourceLinks,
      {
        hrefFor: (identity) => {
          const url = docsUrlFor(identity, sites);
          return url && onSite(url, siteUrl);
        },
        knownHrefs: new Set([...known].map((url) => onSite(url, siteUrl))),
        onUnresolved:
          onUnresolved ??
          (({ url, candidate }) =>
            console.warn(
              `warning: link ${url} ${candidate ? `→ ${candidate} is not a published docs page` : "is not a docs page"}; emitted as plain text`,
            )),
      },
    ],
    [remarkUnwrapDeadLinks],
  ];
}
