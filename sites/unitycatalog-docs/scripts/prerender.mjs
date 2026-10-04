// Build the static site: client bundle, SSR bundle, then one fully rendered HTML
// file per route (dist/<route>.html) with that route's <head> from the
// emitter's src/generated/heads.json. The client bundle hydrates the markup.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(root, "dist");
const ssrDir = resolve(root, ".ssr");
const headsPath = resolve(root, "src/generated/heads.json");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON.stringify alone lets a `</script>` in a value close the element early. */
function jsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function renderHeadTags(head) {
  const lines = [
    `<title>${esc(head.title)}</title>`,
    head.description ? `<meta name="description" content="${esc(head.description)}" />` : "",
    head.robots ? `<meta name="robots" content="${esc(head.robots)}" />` : "",
    head.canonical ? `<link rel="canonical" href="${esc(head.canonical)}" />` : "",
    head.twin
      ? `<link rel="alternate" type="text/markdown" href="${esc(head.twin)}" title="Markdown" />`
      : "",
    ...(head.alternates ?? []).map(
      (a) =>
        `<link rel="alternate" type="${esc(a.type)}" href="${esc(a.href)}" title="${esc(a.title)}" />`,
    ),
    ...(head.og ?? []).map(([p, c]) => `<meta property="${esc(p)}" content="${esc(c)}" />`),
    ...(head.twitter ?? []).map(([n, c]) => `<meta name="${esc(n)}" content="${esc(c)}" />`),
    head.jsonLd ? `<script type="application/ld+json">${jsonLdScript(head.jsonLd)}</script>` : "",
  ];
  return lines.filter(Boolean).join("\n    ");
}

// `/how-to/duckdb` → dist/how-to/duckdb.html: canonical routes have no trailing
// slash, and static hosts serve an extensionless URL from its `.html` file. The
// `.md` twin and the page's scripts dir sit beside it under the same name.
function outPathFor(route) {
  return resolve(distDir, route === "/" ? "index.html" : `${route.replace(/^\//, "")}.html`);
}

if (!existsSync(headsPath)) {
  throw new Error("src/generated/heads.json is missing: run the docs-factory emitter first.");
}
const heads = JSON.parse(readFileSync(headsPath, "utf8"));

await build({ root, logLevel: "warn" });
await build({
  root,
  logLevel: "warn",
  build: { ssr: "src/entry-server.tsx", outDir: ssrDir, emptyOutDir: true },
});

const { render, routes } = await import(pathToFileURL(resolve(ssrDir, "entry-server.js")).href);
// Read once up front: the "/" route overwrites dist/index.html itself.
const template = readFileSync(resolve(distDir, "index.html"), "utf8");

async function page(route, head) {
  const app = await render(route);
  return template.replace("<!--head-->", renderHeadTags(head)).replace("<!--app-->", app);
}

const missing = [];
for (const route of routes) {
  const head = heads[route];
  if (!head) missing.push(route);
  const out = outPathFor(route);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await page(route, head ?? { title: heads["/"]?.title ?? "" }));
}
writeFileSync(
  resolve(distDir, "404.html"),
  await page("/404", { title: `Page not found — ${heads["/"]?.title ?? ""}`, robots: "noindex" }),
);
rmSync(ssrDir, { recursive: true, force: true });

if (missing.length) {
  throw new Error(`no head metadata for: ${missing.join(", ")} (re-run the emitter)`);
}
console.log(`prerender: wrote ${routes.length} route(s) + 404.html into dist/.`);
