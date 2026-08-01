// Emit dist/sitemap.xml + dist/robots.txt (Phase 1e of the agentic-docs plan).
//
// The sitemap lists the CANONICAL HTML routes only — never the `.md` twins (they
// carry X-Robots-Tag: noindex; the HTML is the indexed canonical). Mirrors
// prerender-shells.mjs's page enumeration + the git-authoritative isPublic() gate,
// so the sitemap and the prerendered shells agree on exactly which routes exist.
//
// Run order: after `vite build`, before assemble-vercel-output.mjs (writes into
// dist/). Framework-free: reuses content-core for discovery/identity/URLs.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter, isPublic } from "../src/content-core/frontmatter.mjs";
import { docIdentity, hrefFromIdentity } from "../src/content-core/identity.mjs";
import { walkBlogs, walkContent } from "../src/content-core/walk.mjs";
import { canonicalUrl, siteOrigin } from "../src/content-core/head.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const distDir = resolve(siteRoot, "dist");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** The synthetic index routes prerender-shells also emits. */
const INDEX_ROUTES = ["/", "/docs", "/blog"];

/** A page's <lastmod>: git commit date (preferred), else mtime. A legacy
 *  frontmatter `date` is still honored when present. Returns an ISO date string. */
function lastmod(absPath, meta) {
  if (typeof meta.date === "string" && ISO_DATE.test(meta.date)) return meta.date.slice(0, 10);
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", "--", absPath], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    if (out) return out.slice(0, 10);
  } catch {
    /* fall through to mtime */
  }
  try {
    return statSync(absPath).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Build the sitemap URL list (pure, for testing). Each entry is `{ loc, lastmod }`
 * for a canonical HTML route. `pages` is `[{ absPath, meta }]`; the index routes
 * are prepended. Non-public pages and pages with no route are dropped.
 */
export function sitemapUrls(pages, origin = siteOrigin()) {
  const urls = INDEX_ROUTES.map((href) => ({
    loc: href === "/" ? origin : `${origin}${href}`,
    lastmod: null,
  }));
  for (const { absPath, meta } of pages) {
    if (!isPublic(meta)) continue;
    const loc = canonicalUrl(docIdentity(absPath, meta), origin);
    if (!loc) continue;
    urls.push({ loc, lastmod: lastmod(absPath, meta) });
  }
  return urls;
}

function renderSitemap(urls) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const { loc, lastmod: lm } of urls) {
    lines.push(
      lm ? `  <url><loc>${loc}</loc><lastmod>${lm}</lastmod></url>` : `  <url><loc>${loc}</loc></url>`,
    );
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}

function renderRobots(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${origin}/sitemap.xml`,
    "# Machine-readable corpus: /llms.txt, /llms-full.txt, and per-page .md twins",
    "# (the .md twins are noindex; this HTML is the canonical).",
    "",
  ].join("\n");
}

function main() {
  const origin = siteOrigin();
  const pages = [
    ...walkContent(resolve(repoRoot, "content")),
    ...walkBlogs(resolve(repoRoot, "blogs")),
  ].map((absPath) => ({ absPath, meta: splitFrontmatter(readFileSync(absPath, "utf8")).meta }));

  const urls = sitemapUrls(pages, origin);
  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, "sitemap.xml"), renderSitemap(urls));
  writeFileSync(resolve(distDir, "robots.txt"), renderRobots(origin));
  console.log(`build-sitemap: wrote sitemap.xml (${urls.length} urls) + robots.txt into ${relative(siteRoot, distDir)}/.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
