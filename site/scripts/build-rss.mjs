// Emit dist/blog/rss.xml (Phase 1f of the agentic-docs plan).
//
// Blog ordering authority is content.ts's `blogPosts` (sorted by slug). content.ts
// is Vite/glob-coupled and not importable by a plain node script, so we RE-DERIVE
// the identical comparator here — the same pattern build-llmstxt uses to re-derive
// published URLs. Keep the comparator in step with content.ts:blogPosts.
//
// Publish dates are no longer frontmatter; RSS omits pubDate unless a legacy
// `date` is still present. Lastmod for sitemaps falls back to git/mtime.
//
// Run order: after `vite build`, before assemble-vercel-output.mjs. Advertised via
// rel=alternate type=application/rss+xml in the Phase-0 head on /blog and /.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPublic, splitFrontmatter } from "../src/content-core/frontmatter.mjs";
import { canonicalUrl, metaDescription, siteOrigin } from "../src/content-core/head.mjs";
import { docIdentity } from "../src/content-core/identity.mjs";
import { walkBlogs } from "../src/content-core/walk.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const distDir = resolve(siteRoot, "dist");

/** Escape text for inclusion in an XML text node / attribute. */
function xml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** An ISO `date` (YYYY-MM-DD) → RFC-822 (RSS pubDate). Empty string if unparseable. */
export function rfc822(date) {
  if (typeof date !== "string" || !date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toUTCString();
}

/**
 * The ordered RSS items (pure, for testing). `pages` is `[{ absPath, meta, body }]`
 * for blog posts; non-public posts are dropped and the rest are sorted by slug —
 * identical to content.ts:blogPosts. Each item is `{ title, link, description,
 * pubDate }` (`pubDate` empty unless a legacy frontmatter `date` remains).
 */
export function rssItems(pages, origin = siteOrigin()) {
  return pages
    .filter(({ meta }) => isPublic(meta))
    .sort((a, b) => (a.meta.slug ?? "").localeCompare(b.meta.slug ?? ""))
    .map(({ absPath, meta, body }) => {
      const identity = docIdentity(absPath, meta);
      return {
        title: meta.title ?? identity.slug ?? "",
        link: canonicalUrl(identity, origin),
        description: metaDescription(meta, body ?? ""),
        pubDate: rfc822(meta.date),
      };
    })
    .filter((item) => item.link);
}

function renderRss(items, origin) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    "  <title>Open Lakehouse — Blog</title>",
    `  <link>${origin}/blog</link>`,
    "  <description>Deep dives on the open lakehouse.</description>",
  ];
  for (const { title, link, description, pubDate } of items) {
    lines.push("  <item>");
    lines.push(`    <title>${xml(title)}</title>`);
    lines.push(`    <link>${link}</link>`);
    lines.push(`    <guid>${link}</guid>`);
    if (description) lines.push(`    <description>${xml(description)}</description>`);
    if (pubDate) lines.push(`    <pubDate>${pubDate}</pubDate>`);
    lines.push("  </item>");
  }
  lines.push("</channel></rss>", "");
  return lines.join("\n");
}

function main() {
  const origin = siteOrigin();
  const pages = walkBlogs(resolve(repoRoot, "blogs")).map((absPath) => {
    const { meta, body } = splitFrontmatter(readFileSync(absPath, "utf8"));
    return { absPath, meta, body };
  });
  const items = rssItems(pages, origin);
  const outDir = resolve(distDir, "blog");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "rss.xml"), renderRss(items, origin));
  console.log(
    `build-rss: wrote blog/rss.xml (${items.length} items) into ${relative(siteRoot, distDir)}/.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
