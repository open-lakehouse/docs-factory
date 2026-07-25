/**
 * The orchestrated content pipeline: one walk → parse → the version manifest the
 * review backend consumes. Everything is computed through the shared content-core
 * modules, so the manifest can no longer disagree with what the site renders.
 *
 * Node/Bun only (filesystem + git). The site render path uses the same fences/
 * slug/identity/normalize modules via the remark plugin and content-source.ts.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { splitFrontmatter, hashBody, hashSource } from "./frontmatter.mjs";
import { extractHeadings } from "./slug.mjs";
import { parseFenceMeta, resolveFence, FILE_RE } from "./fences.mjs";
import { docIdentity } from "./identity.mjs";
import { walkBlogs, walkContent } from "./walk.mjs";
import { fromMarkdown } from "mdast-util-from-markdown";
import { visit } from "unist-util-visit";

/** The git sha of HEAD, for provenance (falls back to "unknown" outside git). */
export function gitSha(repoRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).toString().trim();
  } catch {
    return "unknown";
  }
}

/**
 * Resolve every `file=` fence in the body to a snippet ref (repo-relative path,
 * region, source line range, file hash) and collect each referenced file's full
 * source once. Uses the canonical {@link resolveFence}, so the stored text and
 * line ranges match the rendered (dedented) block — fixing the dedent divergence.
 */
function resolveSnippets(body, mdPath, repoRoot) {
  const tree = fromMarkdown(body);
  const mdDir = dirname(mdPath);
  const snippets = [];
  const sources = new Map(); // path -> { text, fileHash }

  visit(tree, "code", (node) => {
    const parsed = parseFenceMeta(node.meta ?? "");
    if (!parsed) return;
    const abs = resolve(mdDir, parsed.file);
    const relPath = relative(repoRoot, abs);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      // A broken reference fails the real build (remark plugin throws); here we
      // skip it so manifest generation stays resilient.
      return;
    }
    const normalized = src.replace(/\r\n/g, "\n");
    if (!sources.has(relPath)) {
      sources.set(relPath, { text: normalized, fileHash: hashSource(normalized) });
    }
    let resolved;
    try {
      resolved = resolveFence(normalized, { start: parsed.start, end: parsed.end });
    } catch {
      // Marker problems are reported by snippetcheck / the render build; skip here.
      return;
    }
    snippets.push({
      path: relPath,
      region: resolved.region,
      startLine: resolved.startLine,
      endLine: resolved.endLine,
      fileHash: sources.get(relPath).fileHash,
    });
  });

  return {
    snippets,
    sources: [...sources.entries()].map(([path, v]) => ({
      path,
      text: v.text,
      fileHash: v.fileHash,
    })),
  };
}

/** Build one manifest entry from a file path + repo root. */
function entryFor(path, repoRoot) {
  const raw = readFileSync(path, "utf8");
  const { meta, body } = splitFrontmatter(raw);
  const id = docIdentity(path, meta);
  const { snippets, sources } = resolveSnippets(body, path, repoRoot);
  return {
    ...id, // {area, slug} or {area, project, bucket, slug}
    contentHash: hashBody(body),
    title: meta.title ?? id.slug,
    frontmatterStatus: meta.status ?? "",
    headings: extractHeadings(body),
    snippets,
    sources,
  };
}

/**
 * Build the full content-version manifest: every blog draft + doc page, sorted
 * stably by (area, project, bucket, slug), each stamped with the git sha.
 */
export function buildVersionManifest(repoRoot) {
  const sha = gitSha(repoRoot);
  const paths = [
    ...walkBlogs(resolve(repoRoot, "blogs")),
    ...walkContent(resolve(repoRoot, "content")),
  ];
  return paths
    .map((p) => ({ ...entryFor(p, repoRoot), gitSha: sha }))
    .sort((a, b) =>
      (a.area + (a.project ?? "") + (a.bucket ?? "") + a.slug).localeCompare(
        b.area + (b.project ?? "") + (b.bucket ?? "") + b.slug,
      ),
    );
}
