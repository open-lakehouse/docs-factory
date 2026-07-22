// Build the content version manifest consumed by the review backend.
//
// For every blog draft and doc page we emit a stable content version:
//   - contentHash: sha256 of the markdown BODY (frontmatter excluded), so a
//     frontmatter-only edit does not churn the version.
//   - headings: the section anchors, with ids computed the SAME way the site
//     computes them at render time — github-slugger, one instance per document,
//     visited in document order (this is exactly what rehype-slug does). The
//     fingerprint is the normalized heading text used to re-anchor comments
//     across versions when a heading id changes.
//
// Output: site/src/generated/content-versions.json (gitignored). Run via
// `just version-manifest`, or implicitly via `just register-versions`.
// Node-only (no Vite): path parsing mirrors site/src/lib/content-source.ts but
// is re-implemented here because that module depends on import.meta.glob.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import yaml from "js-yaml";
import GithubSlugger from "github-slugger";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const blogsDir = join(repoRoot, "blogs");
const contentDir = join(repoRoot, "content");
const outFile = join(repoRoot, "site/src/generated/content-versions.json");

/** The git sha of HEAD, for provenance (falls back to "unknown" outside git). */
function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

/** Split YAML frontmatter from the markdown body. */
function splitFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  let meta = {};
  try {
    meta = yaml.load(match[1]) ?? {};
  } catch {
    meta = {};
  }
  return { meta, body: raw.slice(match[0].length) };
}

/** sha256 of the body (frontmatter excluded), normalized to \n line endings. */
function hashBody(body) {
  return createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex");
}

/** Normalize prose for anchoring: lowercase + collapse whitespace + trim. Must
 * match server anchor.ts normalize() and client content-ref.ts fingerprint(). */
function normalizeText(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Extract headings (with rehype-slug-identical ids) plus each section's
 * normalized body text. rehype-slug uses github-slugger with a single shared
 * instance per document and slugs headings in document order, so duplicate
 * headings collide into `-1`, `-2`, etc. We replicate that exactly. The
 * fingerprint is the lowercased, whitespace-collapsed heading text — a stable
 * re-anchor key when the id changes.
 *
 * `bodyText`/`charLen` are the normalized plain text of the section body (the
 * content after this heading, up to the next heading of equal-or-higher level).
 * The server uses this to re-anchor quote comments across versions.
 */
function extractHeadings(body) {
  const tree = fromMarkdown(body);
  const slugger = new GithubSlugger();
  // First pass: the heading nodes, in order, with their positions in the tree's
  // top-level child list so we can slice the body between headings.
  const children = tree.children ?? [];
  const headingIdx = [];
  children.forEach((node, i) => {
    if (node.type === "heading") headingIdx.push(i);
  });

  const headings = [];
  let ordinal = 0;
  for (let h = 0; h < headingIdx.length; h++) {
    const node = children[headingIdx[h]];
    const text = mdastToString(node).trim();
    if (!text) continue;
    // Section body = top-level nodes between this heading and the next heading
    // whose depth is <= this one (a subheading's body belongs to it, so we stop
    // at the next same-or-shallower heading, matching how a reader scopes it).
    const start = headingIdx[h] + 1;
    let end = children.length;
    for (let j = h + 1; j < headingIdx.length; j++) {
      if ((children[headingIdx[j]].depth ?? 6) <= node.depth) {
        end = headingIdx[j];
        break;
      }
    }
    const bodyNodes = children.slice(start, end).filter((n) => n.type !== "heading");
    const bodyText = normalizeText(bodyNodes.map((n) => mdastToString(n)).join(" "));
    headings.push({
      id: slugger.slug(text),
      text,
      level: node.depth,
      order: ordinal++,
      fingerprint: normalizeText(text),
      bodyText,
      charLen: bodyText.length,
    });
  }
  return headings;
}

const FILE_RE = /\bfile=(\S+)/;
const START_RE = /\bstart=(\S+)/;
const END_RE = /\bend=(\S+)/;

/** Line index (0-based) of the unique line containing `marker`, or -1. Mirrors
 * remark-code-snippets.mjs region resolution (marker must be unique). */
function markerLine(lines, marker) {
  let found = -1;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(marker)) {
      if (n === 0) found = i;
      n++;
    }
  }
  return n === 1 ? found : -1;
}

/**
 * Resolve every `file=` code fence in the body to a snippet ref (path, region,
 * source line range) and collect each referenced file's full source once. The
 * region line range mirrors remark-code-snippets.mjs: whole file, or the region
 * strictly between the unique start/end marker lines (markers excluded).
 *
 * `path` is repo-relative so the server key matches across builds. Returns
 * { snippets: [...], sources: [{path, text, fileHash}] }.
 */
function resolveSnippets(body, mdPath) {
  const tree = fromMarkdown(body);
  const mdDir = dirname(mdPath);
  const snippets = [];
  const sources = new Map(); // path -> { text, fileHash }

  visit(tree, "code", (node) => {
    const meta = node.meta ?? "";
    const fileM = meta.match(FILE_RE);
    if (!fileM) return;
    const abs = resolve(mdDir, fileM[1]);
    const relPath = relative(repoRoot, abs);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      // A broken reference fails the real build (remark plugin throws); here we
      // skip it so manifest generation stays resilient, and it simply gets no
      // snippet ref.
      return;
    }
    const normalized = src.replace(/\r\n/g, "\n");
    if (!sources.has(relPath)) {
      sources.set(relPath, {
        text: normalized,
        fileHash: createHash("sha256").update(normalized).digest("hex"),
      });
    }
    const lines = normalized.split("\n");
    const startM = meta.match(START_RE);
    const endM = meta.match(END_RE);
    let region = "";
    let startLine = 1;
    let endLine = lines.length;
    if (startM && endM) {
      const s = markerLine(lines, startM[1]);
      const e = markerLine(lines, endM[1]);
      if (s !== -1 && e !== -1 && e > s) {
        region = `${startM[1]}..${endM[1]}`;
        startLine = s + 2; // 1-based, first line after the start marker
        endLine = e; // 1-based line before the end marker (e is 0-based end marker)
      }
    }
    snippets.push({ path: relPath, region, startLine, endLine, fileHash: sources.get(relPath).fileHash });
  });

  return {
    snippets,
    sources: [...sources.entries()].map(([path, v]) => ({ path, text: v.text, fileHash: v.fileHash })),
  };
}

/** Recursively list files under `dir` matching `.md`/`.mdx`, excluding README. */
function walk(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e)) && name !== "README.md") {
      out.push(full);
    }
  }
  return out;
}

function blogEntries() {
  return walk(blogsDir, [".md"])
    .filter((p) => p.endsWith("/draft.md"))
    .map((path) => {
      const raw = readFileSync(path, "utf8");
      const { meta, body } = splitFrontmatter(raw);
      // slug = folder name, matching slugFromBlogPath.
      const slug = relative(blogsDir, path).split("/")[0];
      const { snippets, sources } = resolveSnippets(body, path);
      return {
        area: "blogs",
        slug,
        contentHash: hashBody(body),
        title: meta.title ?? slug,
        frontmatterStatus: meta.status ?? "",
        headings: extractHeadings(body),
        snippets,
        sources,
      };
    });
}

function docEntries() {
  return walk(contentDir, [".md", ".mdx"]).map((path) => {
    const raw = readFileSync(path, "utf8");
    const { meta, body } = splitFrontmatter(raw);
    // .../content/<project>/<bucket>/<slug>.md, matching parseDocPath.
    const parts = relative(contentDir, path).split("/");
    const project = parts[0] ?? "";
    const bucket = parts[1] ?? "";
    const slug = (parts[parts.length - 1] ?? "").replace(/\.mdx?$/, "");
    const { snippets, sources } = resolveSnippets(body, path);
    return {
      area: "docs",
      slug,
      project,
      bucket,
      contentHash: hashBody(body),
      title: meta.title ?? slug,
      frontmatterStatus: meta.status ?? "",
      headings: extractHeadings(body),
      snippets,
      sources,
    };
  });
}

function main() {
  const sha = gitSha();
  const entries = [...blogEntries(), ...docEntries()]
    .map((e) => ({ ...e, gitSha: sha }))
    .sort((a, b) =>
      (a.area + (a.project ?? "") + (a.bucket ?? "") + a.slug).localeCompare(
        b.area + (b.project ?? "") + (b.bucket ?? "") + b.slug,
      ),
    );
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Wrote ${entries.length} content versions to ${relative(repoRoot, outFile)} (git ${sha.slice(0, 8)}).`);
}

main();
