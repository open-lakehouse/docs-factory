// The discovery files an emitted docs site serves: sitemap.xml + robots.txt, and
// the llms.txt / llms-full.txt agent index (llmstxt.org convention: H1 +
// blockquote summary + H2 Diátaxis sections + a Blog section; each entry links
// the canonical HTML route AND its `.md` twin).
//
// The sitemap lists canonical HTML routes only — never the `.md` twins (they're
// noindex; the HTML is the indexed canonical). Pure over page records, except
// lastmod(), which asks git.
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPublic } from "../../site/src/content-core/frontmatter.mjs";
import {
  canonicalUrl,
  metaDescription,
  siteOrigin,
  twinUrl,
} from "../../site/src/content-core/head.mjs";
import { docIdentity, hrefFromIdentity } from "../../site/src/content-core/identity.mjs";
import { DIATAXIS } from "../../site/src/content-core/vocab.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

const SECTION_TITLE = {
  tutorial: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanation",
};

/** A page's <lastmod>: git commit date (preferred), else mtime. A legacy
 *  frontmatter `date` is still honored when present. Returns an ISO date string. */
export function lastmod(absPath, meta) {
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
 * are prepended. Non-public pages and pages with no route are dropped. A site
 * passes its own `hrefFor` / `indexRoutes` / `isIncluded` (e.g. to keep drafts in
 * a local preview).
 */
export function sitemapUrls(
  pages,
  origin = siteOrigin(),
  { hrefFor = hrefFromIdentity, indexRoutes = ["/"], isIncluded = isPublic } = {},
) {
  const urls = indexRoutes.map((href) => ({
    loc: href === "/" ? origin : `${origin}${href}`,
    lastmod: null,
  }));
  for (const { absPath, meta } of pages) {
    if (!isIncluded(meta)) continue;
    const loc = canonicalUrl(docIdentity(absPath, meta), origin, hrefFor);
    if (!loc) continue;
    urls.push({ loc, lastmod: lastmod(absPath, meta) });
  }
  return urls;
}

export function renderSitemap(urls) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const { loc, lastmod: lm } of urls) {
    lines.push(
      lm
        ? `  <url><loc>${loc}</loc><lastmod>${lm}</lastmod></url>`
        : `  <url><loc>${loc}</loc></url>`,
    );
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}

export function renderRobots(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${origin}/sitemap.xml`,
    "# Machine-readable corpus: /llms.txt, /llms-full.txt, and per-page .md twins",
    "# (the .md twins are noindex; this HTML is the canonical).",
    "",
  ].join("\n");
}

/**
 * A page record with its resolved identity/routes, or null if not public/routable.
 * A site passes its own `hrefFor` / `isIncluded`.
 */
export function toEntry(
  absPath,
  meta,
  body,
  origin,
  { hrefFor = hrefFromIdentity, isIncluded = isPublic } = {},
) {
  if (!isIncluded(meta)) return null;
  const identity = docIdentity(absPath, meta);
  const href = hrefFor(identity);
  if (!href) return null;
  return {
    identity,
    href,
    canonical: canonicalUrl(identity, origin, hrefFor),
    twin: twinUrl(identity, origin, hrefFor),
    title: meta.title ?? href,
    description: meta.summary ?? metaDescription(meta, body),
    diataxis: meta.diataxis,
  };
}

/**
 * Render /llms.txt (pure, for testing). `entries` are toEntry() records. Docs group
 * by Diátaxis quadrant (from their identity/meta); blogs go under a Blog section.
 * Each line links the canonical route and its `.md` twin. `apis` (api.mjs
 * apiEntries) link their OpenAPI spec instead of a twin.
 */
export function renderLlmsIndex(entries, { title, summary, origin = "", apis = [] }) {
  const lines = [`# ${title}`, "", `> ${summary}`, ""];
  const bySection = Object.fromEntries(DIATAXIS.map((k) => [k, []]));
  const blog = [];

  for (const e of entries) {
    const line = `- [${e.title}](${e.canonical}) ([md](${e.twin})): ${e.description}`;
    if (e.identity.area === "blogs") blog.push(line);
    else if (e.diataxis && e.diataxis in bySection) bySection[e.diataxis].push(line);
  }

  for (const section of DIATAXIS) {
    if (bySection[section].length === 0) continue;
    lines.push(`## ${SECTION_TITLE[section]}`, "", ...bySection[section].sort(), "");
  }
  if (blog.length) lines.push("## Blog", "", ...blog.sort(), "");
  if (apis.length) {
    lines.push(
      "## API reference",
      "",
      ...apis.map(
        (a) => `- [${a.title}](${origin}${a.route}) ([OpenAPI](${a.specUrl})): ${a.summary}`,
      ),
      "",
    );
  }

  // Resources (Phase 2 adds concepts.json here).
  lines.push(
    "## Resources",
    "",
    `- [Full-text corpus](${origin}/llms-full.txt): every page's Markdown twin concatenated.`,
    `- [Runnable scripts index](${origin}/scripts.json): CI-verified PEP 723 tutorial scripts + their runtime contracts.`,
    "",
  );

  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

/** Render /llms-full.txt (pure over entries + a body resolver, for testing). */
export function renderLlmsFull(entries, resolveBody) {
  const parts = [];
  for (const e of entries) {
    const body = resolveBody(e.href);
    if (!body) continue;
    parts.push(`# ${e.canonical}\n\n${body}`);
  }
  return `${parts.join("\n\n---\n\n")}\n`;
}
