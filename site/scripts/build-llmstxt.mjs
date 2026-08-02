// Generate per-project llms.txt into site/public/ at build time (a prebuild
// step alongside build-version-manifest.mjs). Vite copies public/ verbatim into
// dist/, so the published site serves `/<project>.llms.txt`.
//
// This lives on the SITE side (not docsnip) on purpose: it re-uses content-core
// as the single source for content discovery (walkContent), frontmatter split
// (splitFrontmatter), identity, and the Diátaxis vocabulary — the same modules
// the version manifest and the render path use. Previously docsnip's Python
// llmstxt.py re-derived the published-URL logic independently, kept in step only
// by a cross-language drift test; deriving URLs from the canonical docIdentity /
// parseDocPath here removes that duplication.
//
// llms.txt follows the llmstxt.org convention: an H1 title, a blockquote
// summary, then H2 sections grouped by Diátaxis quadrant. Only `status: ready`
// pages are listed — this keys on git authoring intent alone so llms.txt stays
// build-time and DB-free (there is no review DB at build). A `ready` page enters
// llms.txt as soon as the author marks it, which may briefly precede its DB
// `released` state (the gate for anonymous site visibility); that small skew is
// accepted to keep authoring and deploy decoupled.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPublic, splitFrontmatter } from "../src/content-core/frontmatter.mjs";
import { parseDocPath } from "../src/content-core/identity.mjs";
import { DIATAXIS } from "../src/content-core/vocab.mjs";
import { walkContent } from "../src/content-core/walk.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const contentRoot = resolve(repoRoot, "content");
const outDir = resolve(__dirname, "../public");

// Per-project published-site URL base for llms.txt links, and the H1/summary
// header. Placeholder URL bases until the restructured sites' scheme is
// confirmed; the generator is scheme-agnostic. A project with no entry here is
// skipped (it has no published site to link to yet).
const PROJECTS = {
  delta: {
    urlBase: "https://delta.io/docs",
    title: "Delta Lake documentation",
    summary:
      "Multi-engine, engine-neutral documentation for Delta Lake — usable from " +
      "Spark, the deltalake Python package, delta-rs (Rust), DuckDB, and Polars.",
  },
  unitycatalog: {
    urlBase: "https://docs.unitycatalog.io",
    title: "Unity Catalog documentation",
    summary: "Documentation for Unity Catalog, the open catalog for the lakehouse.",
  },
};

const SECTION_TITLE = {
  tutorial: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanation",
};

/**
 * A page's published URL, derived from the CANONICAL identity so it matches the
 * URLs the site serves (parseDocPath applies folder mode, order-prefix
 * stripping; a `slug:` frontmatter override wins). `content/<project>/<bucket>/
 * <slug>[/index].md → <urlBase>/<bucket>/<slug>`.
 */
function pageUrl(urlBase, absPath, meta) {
  const rel = relative(contentRoot, absPath);
  const { bucket, slug: pathSlug } = parseDocPath(rel);
  const slug = typeof meta.slug === "string" && meta.slug ? meta.slug : pathSlug;
  return `${urlBase.replace(/\/$/, "")}/${bucket}/${slug}`;
}

/** Render one project's llms.txt from its ready pages. */
function render(project, cfg, pages) {
  const lines = [`# ${cfg.title}`, "", `> ${cfg.summary}`, ""];
  const bySection = Object.fromEntries(DIATAXIS.map((k) => [k, []]));

  for (const { absPath, meta } of pages) {
    if (!isPublic(meta)) continue;
    const quadrant = meta.diataxis;
    if (!(quadrant in bySection)) continue;
    const url = pageUrl(cfg.urlBase, absPath, meta);
    const title = meta.title ?? url;
    const desc = meta.summary ?? meta.title ?? "";
    bySection[quadrant].push(`- [${title}](${url}): ${desc}`);
  }

  for (const section of DIATAXIS) {
    const entries = bySection[section];
    if (entries.length === 0) continue;
    lines.push(`## ${SECTION_TITLE[section]}`, "");
    lines.push(...entries.sort());
    lines.push("");
  }
  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

// Group every content page under its project (the first path segment), parsing
// frontmatter once.
const byProject = new Map();
for (const absPath of walkContent(contentRoot)) {
  const project = relative(contentRoot, absPath).split("/")[0];
  if (!(project in PROJECTS)) continue;
  const { meta } = splitFrontmatter(readFileSync(absPath, "utf8"));
  (byProject.get(project) ?? byProject.set(project, []).get(project)).push({ absPath, meta });
}

mkdirSync(outDir, { recursive: true });
const written = [];
for (const [project, cfg] of Object.entries(PROJECTS)) {
  const pages = byProject.get(project);
  if (!pages) continue;
  const outPath = resolve(outDir, `${project}.llms.txt`);
  writeFileSync(outPath, render(project, cfg, pages));
  written.push(relative(repoRoot, outPath));
}

console.log(`Wrote ${written.length} llms.txt file(s): ${written.join(", ")}`);
