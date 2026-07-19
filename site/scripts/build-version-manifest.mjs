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
// Output: site/src/generated/content-versions.json. Run via `just version-manifest`.
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

/**
 * Extract headings with rehype-slug-identical ids. rehype-slug uses
 * github-slugger with a single shared instance per document and slugs headings
 * in document order, so duplicate headings collide into `-1`, `-2`, etc. We
 * replicate that exactly. The fingerprint is the lowercased, whitespace-
 * collapsed heading text — a stable re-anchor key when the id changes.
 */
function extractHeadings(body) {
  const tree = fromMarkdown(body);
  const slugger = new GithubSlugger();
  const headings = [];
  let ordinal = 0;
  visit(tree, "heading", (node) => {
    const text = mdastToString(node).trim();
    if (!text) return;
    headings.push({
      id: slugger.slug(text),
      text,
      level: node.depth,
      order: ordinal++,
      fingerprint: text.toLowerCase().replace(/\s+/g, " "),
    });
  });
  return headings;
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
      return {
        area: "blogs",
        slug,
        contentHash: hashBody(body),
        title: meta.title ?? slug,
        frontmatterStatus: meta.status ?? "",
        headings: extractHeadings(body),
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
    return {
      area: "docs",
      slug,
      project,
      bucket,
      contentHash: hashBody(body),
      title: meta.title ?? slug,
      frontmatterStatus: meta.status ?? "",
      headings: extractHeadings(body),
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
