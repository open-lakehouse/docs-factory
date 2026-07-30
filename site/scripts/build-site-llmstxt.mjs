// Emit this site's own /llms.txt + /llms-full.txt (Phase 1d of the agentic-docs
// plan). This is the INBOUND index of THIS site — distinct from build-llmstxt.mjs,
// which emits per-project OUTBOUND files (public/<project>.llms.txt) pointing at
// the external published sites (delta.io, docs.unitycatalog.io). Leave that as-is.
//
// /llms.txt (llmstxt.org convention): H1 + blockquote summary + H2 Diátaxis
// sections + a Blog section; each entry links the canonical HTML route AND its
// `.md` twin. /llms-full.txt concatenates every ready page's RICH twin body (read
// from dist/, written by build-md-twins) under a route header — NEVER the raw
// annotation-heavy source.
//
// Run order: after build-md-twins.mjs (needs the twins on disk for llms-full),
// before assemble-vercel-output.mjs. DB-free: isPublic() (status: ready) gate.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter, isPublic } from "../src/content-core/frontmatter.mjs";
import { docIdentity, hrefFromIdentity } from "../src/content-core/identity.mjs";
import { walkBlogs, walkContent } from "../src/content-core/walk.mjs";
import { DIATAXIS } from "../src/content-core/vocab.mjs";
import { canonicalUrl, twinUrl, metaDescription, siteOrigin } from "../src/content-core/head.mjs";
import { twinPathForHref } from "./build-md-twins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const distDir = resolve(siteRoot, "dist");

const SITE_TITLE = "Open Lakehouse documentation";
const SITE_SUMMARY =
  "Documentation and deep dives for the open lakehouse stack — Delta Lake, Unity " +
  "Catalog, and the surrounding ecosystem. Every page is available as a clean " +
  "Markdown twin (this route + .md).";

const SECTION_TITLE = {
  tutorial: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanation",
};

/** A page record with its resolved identity/routes, or null if not public/routable. */
function toEntry(absPath, meta, body, origin) {
  if (!isPublic(meta)) return null;
  const identity = docIdentity(absPath, meta);
  const href = hrefFromIdentity(identity);
  if (!href) return null;
  return {
    identity,
    href,
    canonical: canonicalUrl(identity, origin),
    twin: twinUrl(identity, origin),
    title: meta.title ?? href,
    description: meta.summary ?? metaDescription(meta, body),
  };
}

/**
 * Render /llms.txt (pure, for testing). `entries` are toEntry() records. Docs group
 * by Diátaxis quadrant (from their identity/meta); blogs go under a Blog section.
 * Each line links the canonical route and its `.md` twin.
 */
export function renderLlmsIndex(entries, { title = SITE_TITLE, summary = SITE_SUMMARY } = {}) {
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

  // Resources (Phase 2 adds concepts.json here).
  lines.push(
    "## Resources",
    "",
    `- [Full-text corpus](/llms-full.txt): every page's Markdown twin concatenated.`,
    `- [Runnable scripts index](/scripts.json): CI-verified PEP 723 tutorial scripts + their runtime contracts.`,
    "",
  );

  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

/** Read a page's RICH twin body from dist/ (frontmatter stripped). Empty if the
 *  twin isn't present (build-md-twins must run first). Never reads raw source. */
function twinBody(href) {
  try {
    return splitFrontmatter(readFileSync(twinPathForHref(href), "utf8")).body.trim();
  } catch {
    return "";
  }
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

function main() {
  const origin = siteOrigin();
  const entries = [];
  for (const absPath of [
    ...walkContent(resolve(repoRoot, "content")),
    ...walkBlogs(resolve(repoRoot, "blogs")),
  ]) {
    const { meta, body } = splitFrontmatter(readFileSync(absPath, "utf8"));
    const e = toEntry(absPath, meta, body, origin);
    if (e) {
      e.diataxis = meta.diataxis;
      entries.push(e);
    }
  }

  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, "llms.txt"), renderLlmsIndex(entries));
  writeFileSync(resolve(distDir, "llms-full.txt"), renderLlmsFull(entries, twinBody));
  console.log(`build-site-llmstxt: wrote llms.txt + llms-full.txt (${entries.length} pages) into ${relative(siteRoot, distDir)}/.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
