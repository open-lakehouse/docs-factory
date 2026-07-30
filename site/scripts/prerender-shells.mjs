// Prerender a per-route static HTML shell for every public page (Phase 0 of the
// agentic-docs plan).
//
// The site is a client-rendered SPA: `dist/index.html` is one empty shell, and
// gen-vercel-config.mjs routes every non-/api, non-asset request to it. So a
// crawler or non-JS agent hitting /docs/x/y/z gets no title, no description, no
// content. This step fixes that WITHOUT full SSR/hydration: for each public
// route it writes `dist/<href>/index.html` = the built shell (so it inherits
// Vite's hashed asset tags) with an injected per-route `<head>` (title, meta
// description, canonical, OpenGraph, Twitter, JSON-LD, rel=alternate to the .md
// twin) and a `<noscript>` body rendered from the markdown. The `#root` div
// stays empty, so the existing client bundle boots and takes over exactly as
// today — no hydration mismatch to manage.
//
// DB-free by design: the public corpus is gated on the git-authoritative
// frontmatter status via content-core's shared `isPublic()` (PUBLISH_STATUS),
// the same gate build-llmstxt.mjs uses and mirrored by the server's
// READY_STATUS. A `ready` page may briefly precede its DB `released` state; that
// skew is accepted to keep the build decoupled from the review DB.
//
// Run order: after `vite build` (needs the built dist/index.html + assets),
// before assemble-vercel-output.mjs (which copies dist/ → .vercel/output/static).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter, isPublic } from "../src/content-core/frontmatter.mjs";
import { docIdentity, hrefFromIdentity } from "../src/content-core/identity.mjs";
import { walkBlogs, walkContent } from "../src/content-core/walk.mjs";
import { pageHead, siteOrigin, jsonLd } from "../src/content-core/head.mjs";
import { renderMarkdownToHtml } from "../src/content-core/render-markdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const distDir = resolve(siteRoot, "dist");
const templatePath = resolve(distDir, "index.html");

const origin = siteOrigin();

/** Escape a string for safe insertion into HTML text/attribute context. */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Serialize a JSON-LD object for embedding in a `<script>` element. JSON.stringify
 * alone is unsafe: a `</script>` (or `<!--`) sequence in any string value closes
 * the element early and leaks the rest as markup. Escaping `<` as `<` keeps
 * the payload valid JSON while making it impossible to break out of the script.
 */
function jsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Render the assembled head object into the tag string injected into <head>. */
function renderHeadTags(head) {
  const lines = [
    `<title>${esc(head.title)}</title>`,
    head.description ? `<meta name="description" content="${esc(head.description)}" />` : "",
    head.canonical ? `<link rel="canonical" href="${esc(head.canonical)}" />` : "",
    head.twin
      ? `<link rel="alternate" type="text/markdown" href="${esc(head.twin)}" title="Markdown" />`
      : "",
    ...head.og.map(([p, c]) => `<meta property="${esc(p)}" content="${esc(c)}" />`),
    ...head.twitter.map(([n, c]) => `<meta name="${esc(n)}" content="${esc(c)}" />`),
    head.jsonLd
      ? `<script type="application/ld+json">${jsonLdScript(head.jsonLd)}</script>`
      : "",
  ];
  return lines.filter(Boolean).join("\n    ");
}

// Markers wrapping everything this step injects, so injection is IDEMPOTENT:
// the `/` route is written to dist/index.html, which is also the template
// source, so a re-run (or the standalone `prerender` script) must strip prior
// output before re-injecting rather than compounding it.
const HEAD_START = "<!-- prerender:head:start -->";
const HEAD_END = "<!-- prerender:head:end -->";
const BODY_START = "<!-- prerender:noscript:start -->";
const BODY_END = "<!-- prerender:noscript:end -->";

/** Remove any previously-injected head/noscript blocks (idempotency). */
function stripInjected(html) {
  return html
    .replace(new RegExp(`\\s*${HEAD_START}[\\s\\S]*?${HEAD_END}`, "g"), "")
    .replace(new RegExp(`\\s*${BODY_START}[\\s\\S]*?${BODY_END}`, "g"), "");
}

/**
 * Produce one route's HTML from the template: strip any prior injection, drop
 * the shell's placeholder <title>, then inject the per-route head tags before
 * </head> and the <noscript> body after <body ...>, each wrapped in markers.
 */
function renderShell(template, headTags, noscriptHtml) {
  let html = stripInjected(template).replace(/<title>[\s\S]*?<\/title>\s*/i, "");
  html = html.replace(
    /<\/head>/i,
    `    ${HEAD_START}\n    ${headTags}\n    ${HEAD_END}\n  </head>`,
  );
  if (noscriptHtml) {
    html = html.replace(
      /(<body[^>]*>)/i,
      `$1\n    ${BODY_START}\n    <noscript>\n${noscriptHtml}\n    </noscript>\n    ${BODY_END}`,
    );
  }
  return html;
}

/** Write a shell for a route href (e.g. "/docs/a/b/c" or "/") as index.html. */
function writeRoute(template, href, headTags, noscriptHtml) {
  const rel = href === "/" ? "index.html" : `${href.replace(/^\//, "")}/index.html`;
  const outPath = resolve(distDir, rel);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderShell(template, headTags, noscriptHtml));
  return relative(distDir, outPath);
}

/** One page (doc or blog): parse, gate on ready, build head + noscript, write. */
function renderPage(template, absPath) {
  const raw = readFileSync(absPath, "utf8");
  const { meta, body } = splitFrontmatter(raw);
  if (!isPublic(meta)) return null;
  const identity = docIdentity(absPath, meta);
  const href = hrefFromIdentity(identity);
  if (!href) return null;
  const head = pageHead({ identity, meta, body, origin });
  const noscript = wrapNoscript(head, renderMarkdownToHtml(body));
  return writeRoute(template, href, renderHeadTags(head), noscript);
}

/** The <noscript> body: an H1 + description + the rendered markdown, indented. */
function wrapNoscript(head, bodyHtml) {
  const parts = [`<h1>${esc(stripTitleSuffix(head.title))}</h1>`];
  if (head.description) parts.push(`<p>${esc(head.description)}</p>`);
  if (bodyHtml) parts.push(bodyHtml);
  return parts.map((p) => `      ${p}`).join("\n");
}

/** Drop the " — Open Lakehouse" suffix for the in-body H1. */
function stripTitleSuffix(title) {
  return title.replace(/\s+—\s+Open Lakehouse$/, "");
}

/** A synthetic index route (`/`, `/docs`, `/blog`) with a WebSite/simple head. */
function renderIndex(template, href, title, description) {
  const identity = { area: "site" };
  const canonical = href === "/" ? origin : `${origin}${href}`;
  const head = {
    title: title,
    description,
    canonical,
    twin: null,
    og: [
      ["og:title", title],
      ["og:description", description],
      ["og:url", canonical],
      ["og:type", "website"],
      ["og:site_name", "Open Lakehouse"],
    ],
    twitter: [
      ["twitter:card", "summary"],
      ["twitter:title", title],
      ["twitter:description", description],
    ],
    jsonLd: jsonLd({ identity, meta: {}, url: canonical, description, origin }),
  };
  const noscript = wrapNoscript(head, "");
  return writeRoute(template, href, renderHeadTags(head), noscript);
}

function main() {
  let template;
  try {
    template = readFileSync(templatePath, "utf8");
  } catch {
    console.error(
      `prerender-shells: no ${relative(siteRoot, templatePath)} — run \`vite build\` first.`,
    );
    process.exit(1);
  }

  const written = [];

  // Synthetic index pages.
  written.push(
    renderIndex(template, "/", "Open Lakehouse", "Documentation for the open lakehouse stack."),
  );
  written.push(
    renderIndex(template, "/docs", "Documentation — Open Lakehouse", "Diátaxis docs for Delta Lake, Unity Catalog, and the open lakehouse."),
  );
  written.push(
    renderIndex(template, "/blog", "Blog — Open Lakehouse", "Deep dives on the open lakehouse."),
  );

  // Content + blog pages (ready only).
  for (const absPath of [
    ...walkContent(resolve(repoRoot, "content")),
    ...walkBlogs(resolve(repoRoot, "blogs")),
  ]) {
    const out = renderPage(template, absPath);
    if (out) written.push(out);
  }

  console.log(`prerender-shells: wrote ${written.length} route shell(s) into dist/.`);
}

main();
