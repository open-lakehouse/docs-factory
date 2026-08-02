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
import GithubSlugger from "github-slugger";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString as mdastToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { FILE_RE, parseFenceMeta, resolveFence } from "./fences.mjs";
import { hashBody, hashSource, splitFrontmatter } from "./frontmatter.mjs";
import { docIdentity } from "./identity.mjs";
import { normalizeText } from "./normalize.mjs";
import { extractHeadings } from "./slug.mjs";
import { normalizeTopics } from "./topics.mjs";
import { buildMerkleTree, PREAMBLE_KEY } from "./tree.mjs";
import { walkBlogs, walkContent } from "./walk.mjs";

/** The git sha of HEAD, for provenance (falls back to "unknown" outside git). */
export function gitSha(repoRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).toString().trim();
  } catch {
    return "unknown";
  }
}

/**
 * Walk the body's top-level blocks ONCE, in document order, collecting:
 *   - `snippets`: every `file=` fence resolved to a snippet ref (repo-relative
 *     path, region, source line range, file hash) via the canonical
 *     {@link resolveFence}, so stored text/line ranges match the rendered block.
 *   - `sources`: each referenced file's full source, once.
 *   - `codeBlocks`: every NON-`file=` fenced block (raw text + lang) — a Merkle
 *     leaf, since "the example changed" is a high-value diff signal.
 *   - `preamble`: normalized prose before the first heading (blog intros), which
 *     extractHeadings drops.
 * Each code/snippet block carries the `sectionSlug` of the heading it lives under
 * (or PREAMBLE_KEY before the first heading) and a document `position`, so the
 * tree can nest it under the right section. The slugger MUST match
 * extractHeadings (rehype-slug ids), so we use one GithubSlugger over the same
 * document-order headings.
 */
function collectBlocks(body, mdPath, repoRoot) {
  const tree = fromMarkdown(body);
  const children = tree.children ?? [];
  const mdDir = dirname(mdPath);
  const snippets = [];
  const codeBlocks = [];
  const sources = new Map(); // path -> { text, fileHash }
  const slugger = new GithubSlugger();
  let sectionSlug = PREAMBLE_KEY;
  let sawHeading = false;
  const preambleParts = [];
  let position = 0;

  for (const node of children) {
    if (node.type === "heading") {
      const text = mdastToString(node).trim();
      if (text) {
        sectionSlug = slugger.slug(text);
        sawHeading = true;
      }
      continue;
    }
    if (!sawHeading && node.type !== "code") {
      preambleParts.push(mdastToString(node));
    }
    if (node.type !== "code") continue;

    const parsed = parseFenceMeta(node.meta ?? "");
    if (!parsed) {
      // Non-file= fenced block: a Merkle code leaf.
      codeBlocks.push({
        lang: node.lang ?? "",
        text: (node.value ?? "").replace(/\r\n/g, "\n").replace(/\n$/, ""),
        sectionSlug,
        position: position++,
      });
      continue;
    }
    const abs = resolve(mdDir, parsed.file);
    const relPath = relative(repoRoot, abs);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch {
      // A broken reference fails the real build (remark plugin throws); here we
      // skip it so manifest generation stays resilient.
      continue;
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
      continue;
    }
    snippets.push({
      path: relPath,
      region: resolved.region,
      startLine: resolved.startLine,
      endLine: resolved.endLine,
      fileHash: sources.get(relPath).fileHash,
      sectionSlug,
      position: position++,
    });
  }

  return {
    snippets,
    codeBlocks,
    preamble: preambleParts.length ? { bodyText: normalizeText(preambleParts.join(" ")) } : null,
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
  const { snippets, codeBlocks, preamble, sources } = collectBlocks(body, path, repoRoot);
  const headings = extractHeadings(body);
  // The structural Merkle tree — a stricter fingerprint than contentHash, whose
  // node keys are the same heading anchors comments pin to. contentHash stays the
  // version identity; rootHash answers "this structure" vs "these bytes".
  const { rootHash, tree, sections } = buildMerkleTree({
    headings,
    snippets,
    codeBlocks,
    preamble,
  });
  // The product/topic axis for the review layer's "what changed for X" rollup.
  const topics = normalizeTopics({
    tags: Array.isArray(meta.tags) ? meta.tags : undefined,
    project: id.area === "docs" ? id.project : undefined,
    warn: (label) =>
      console.warn(
        `[topics] ${id.area}/${id.slug}: unknown tag "${label}" (not in content/vocab.json topics)`,
      ),
  });
  return {
    ...id, // {area, slug} or {area, project, bucket, slug}
    contentHash: hashBody(body),
    rootHash,
    title: meta.title ?? id.slug,
    frontmatterStatus: meta.status ?? "",
    topics,
    // Sections now carry Merkle hashes (nodeHash/subtreeHash/parentAnchorSlug/
    // depthPath) alongside the heading anchor fields the DB already stored.
    sections,
    tree,
    // Strip the tree-only attribution fields from the stored snippet refs.
    snippets: snippets.map(({ sectionSlug, position, ...ref }) => ref),
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
