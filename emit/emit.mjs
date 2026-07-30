#!/usr/bin/env node
/**
 * emit.mjs — the deterministic emitter core.
 *
 * Resolve a canonical blog draft (blogs/<slug>/index.md) and FLATTEN its rich
 * constructs into portable, self-contained Markdown for a downstream target, plus
 * an image manifest. See emit/README.md and blogs/CONVENTIONS.md §5.
 *
 *   bun emit.mjs --slug <slug> --target <target>
 *     → blogs/<slug>/dist/<slug>.md
 *     → blogs/<slug>/dist/assets.json
 *
 * The two target-agnostic transforms (snippet inlining, the prose-colon guard) are
 * imported VERBATIM from the preview harness so there is exactly one implementation
 * of each. The construct FLATTENS (journey/callout/likec4/code-caption) are
 * Markdown-emitting variants that live here. Delivery to the target (create a
 * Google Doc, upload images, share) is a separate agent step — the /blog-emit skill.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Shared, target-agnostic transforms — imported verbatim from the preview.
import remarkCodeSnippets from "../site/src/plugins/remark-code-snippets.mjs";
import remarkDirectiveProseGuard from "../site/src/plugins/remark-directive-prose-guard.mjs";

// The construct renderers (journey / callout / likec4 / code-caption) and the
// prose-unwrap are now TARGET-PROVIDED (each target module declares which plugins
// it uses via its `constructs` map + flags), so the core imports none of them
// directly — see emit/targets/*.mjs. This keeps one linear core pipeline while
// letting a target flatten (gdocs) OR upgrade to components (unitycatalog).
import remarkUnwrapProse from "./plugins/remark-unwrap-prose.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

// --- args -----------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") args.slug = argv[++i];
    else if (a === "--target") args.target = argv[++i];
    else if (a.startsWith("--slug=")) args.slug = a.slice(7);
    else if (a.startsWith("--target=")) args.target = a.slice(9);
  }
  return args;
}

async function loadTarget(name) {
  const mod = await import(`./targets/${name}.mjs`);
  return mod.default ?? mod;
}

// --- frontmatter + HTML-comment handling ----------------------------------

/**
 * A remark plugin: extract & strip the YAML frontmatter node, capture its parsed
 * value into `capture.frontmatter`, prepend the `title` as a top-level `#` heading,
 * and drop every HTML-comment node (drafting annotations that shouldn't ship).
 */
const COMMENT_RE = /^\s*<!--[\s\S]*-->\s*$/;

/** Recursively drop HTML-comment nodes anywhere in the tree. mdast keeps a
 * `<!-- … -->` as an `html` node — a block comment as a top-level `html` node, an
 * inline comment as an `html` node inside a paragraph. Both are drafting
 * annotations that must not ship. Also trims a paragraph that becomes empty after
 * its trailing comment is removed. */
function stripComments(node) {
  if (!node.children) return;
  const hadComment = node.children.some(
    (c) => c.type === "html" && COMMENT_RE.test(c.value),
  );
  node.children = node.children.filter(
    (c) => !(c.type === "html" && COMMENT_RE.test(c.value)),
  );
  // A comment removed from mid-prose can leave a dangling whitespace-only text
  // node (the space that preceded it). Trim leading/trailing whitespace-only text
  // children so remark-stringify doesn't emit a stray `&#x20;`.
  if (hadComment) {
    while (
      node.children.length &&
      node.children.at(-1).type === "text" &&
      !node.children.at(-1).value.trim()
    )
      node.children.pop();
    while (
      node.children.length &&
      node.children[0].type === "text" &&
      !node.children[0].value.trim()
    )
      node.children.shift();
    // Trim a trailing space left on the last text node right before the comment.
    const last = node.children.at(-1);
    if (last && last.type === "text") last.value = last.value.replace(/\s+$/, "");
  }
  for (const child of node.children) stripComments(child);
}

/**
 * @param capture  object the parsed frontmatter is captured onto (`capture.frontmatter`).
 * @param opts     `{ titleAsH1, frontmatter }`:
 *                 - `titleAsH1` — when true (Google Docs), the frontmatter `title`
 *                   is prepended as a top-level `#` heading (Docs has no title field
 *                   of its own). Targets whose site renders the title from
 *                   frontmatter (e.g. UnityCatalog's `BlogPost.astro` renders
 *                   `post.data.title`) pass `titleAsH1: false` so it isn't duplicated.
 *                 - `frontmatter(draftFm) → object | string` — an OUTPUT-frontmatter
 *                   hook. gdocs omits it (its body carries no YAML). A content-
 *                   collection target (unitycatalog) returns the target-shaped
 *                   frontmatter, which is prepended to the tree as a `yaml` node so
 *                   remark-frontmatter serializes it as a leading `--- … ---` block.
 */
function remarkPrelude(capture, opts = {}) {
  const titleAsH1 = opts.titleAsH1 ?? true;
  const frontmatterFn = opts.frontmatter ?? null;
  return (tree) => {
    const kept = [];
    let title;
    for (const node of tree.children) {
      if (node.type === "yaml") {
        try {
          capture.frontmatter = parseYaml(node.value) ?? {};
        } catch {
          capture.frontmatter = {};
        }
        title = capture.frontmatter.title;
        continue; // strip the frontmatter block from the body
      }
      kept.push(node);
    }
    tree.children = kept;
    stripComments(tree); // remove block + inline HTML comments everywhere
    // Drop any paragraph left empty (or whitespace-only) after comment removal.
    tree.children = tree.children.filter(
      (n) =>
        !(
          n.type === "paragraph" &&
          (n.children.length === 0 ||
            n.children.every((c) => c.type === "text" && !c.value.trim()))
        ),
    );
    if (title && titleAsH1) {
      tree.children.unshift({
        type: "heading",
        depth: 1,
        children: [{ type: "text", value: String(title) }],
      });
    }
    // Output-frontmatter targets (content collections) get a leading `--- … ---`
    // block. The hook maps the draft frontmatter to the target's shape; a returned
    // object is serialized to YAML, a returned string is used verbatim. Prepend it
    // FIRST (before any H1) so it is the document's opening block.
    if (frontmatterFn) {
      const mapped = frontmatterFn(capture.frontmatter ?? {});
      if (mapped != null) {
        const yaml =
          typeof mapped === "string" ? mapped : stringifyYaml(mapped).replace(/\n$/, "");
        tree.children.unshift({ type: "yaml", value: yaml });
      }
    }
  };
}

// --- LikeC4 PNG regeneration ----------------------------------------------

/**
 * Regenerate PNGs from the unified architecture LikeC4 workspace,
 * deterministically into `outDir` (throwaway, under dist/). The emitter reads
 * back `<viewId>.png` by the `likec4=<viewId>` title on the draft image.
 * Returns `outDir` if anything was exported, else null.
 */
function regenerateLikeC4(modelDir, outDir, hasLikeC4Refs) {
  if (!hasLikeC4Refs) return null;
  if (!existsSync(modelDir)) return null;
  mkdirSync(outDir, { recursive: true });
  // Use the preview harness's pinned likec4 binary if present; else fall back to
  // bunx. Mirrors blogs/CONVENTIONS.md §5: --sequence is required for dynamic views
  // (real lifelines, not a box-and-arrow graph). --flat keeps the output dir flat
  // (one <viewId>.png per view, no per-view subfolders). Output dir is absolute so
  // it does not depend on the process cwd.
  const localBin = join(REPO_ROOT, "site", "node_modules", ".bin", "likec4");
  const useLocal = existsSync(localBin);
  const bin = useLocal ? localBin : "bunx";
  const base = ["export", "png", "--sequence", "--flat", "-o", outDir, modelDir];
  const args = useLocal ? base : ["likec4", ...base];
  try {
    execFileSync(bin, args, { stdio: "inherit" });
  } catch (err) {
    throw new Error(
      `LikeC4 PNG export failed for ${modelDir}. Ensure a headless Chromium is ` +
        `installed (\`bunx playwright install chromium\` once). Underlying error: ${err.message}`,
    );
  }
  return outDir;
}

/**
 * Generate the framework-agnostic LikeC4 web-component bundle for a target that
 * renders diagrams interactively (e.g. UnityCatalog's Astro site, which has no
 * React). The bundle registers a `<likec4-view view-id="…">` custom element backed
 * by the unified architecture model.
 *
 * Returns `outFile` on success, else null (draft has no likec4= refs).
 */
function generateLikeC4WebComponent(modelDir, outFile, hasLikeC4Refs) {
  if (!hasLikeC4Refs) return null;
  if (!existsSync(modelDir)) return null;
  mkdirSync(dirname(outFile), { recursive: true });
  const localBin = join(REPO_ROOT, "site", "node_modules", ".bin", "likec4");
  const useLocal = existsSync(localBin);
  const bin = useLocal ? localBin : "bunx";
  const base = ["gen", "webcomponent", "-o", outFile, modelDir];
  const args = useLocal ? base : ["likec4", ...base];
  try {
    execFileSync(bin, args, { stdio: "inherit" });
  } catch (err) {
    throw new Error(
      `LikeC4 web-component generation failed for ${modelDir}. Underlying error: ${err.message}`,
    );
  }
  return outFile;
}

// --- delivery sidecar (idempotency) ---------------------------------------

// Each post carries its delivery state in a committed sidecar dotfile next to
// index.md: `blogs/<slug>/.emitted.json`, keyed by target →
// { doc_id, url, updated }. Self-contained in the post folder (so it travels with
// the post, no global registry) while keeping index.md itself PURE — no tooling
// state in the canonical source. The core READS it (create-vs-update hint); the
// /blog-emit skill WRITES it after a create. A dotfile so it reads as tooling
// metadata, not content; committed (only dist/ is gitignored).
function sidecarPath(draftDir) {
  return join(draftDir, ".emitted.json");
}

function readSidecar(draftDir) {
  const p = sidecarPath(draftDir);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

// --- core: emit one file ---------------------------------------------------

/** Default architecture LikeC4 workspace, the source for `likec4=` view PNGs. */
export function defaultModelDir() {
  return join(REPO_ROOT, "architecture", "model");
}

/**
 * The target-agnostic emitter core: parse ONE source markdown file, flatten its
 * rich constructs per `target`, and return the rendered string + captured
 * frontmatter + image manifest. WRITES NOTHING — callers decide where output and
 * assets land (the blog CLI in `main()`; the site twin driver in
 * `site/scripts/build-md-twins.mjs`).
 *
 * @param {object} o
 * @param {string} o.inputPath     absolute path to the source .md
 *                                  (blogs/<slug>/index.md OR content/**\/*.md).
 * @param {object} o.target        a loaded target module (see targets/*.mjs).
 * @param {string} [o.modelDir]    architecture model dir for LikeC4 export
 *                                  (default: `defaultModelDir()`).
 * @param {string} o.likec4OutDir  throwaway dir where regenerated <viewId>.png land.
 * @param {string} [o.assetsDir]   dir the likec4-md plugin resolves non-likec4
 *                                  images against (default: dirname(inputPath)).
 * @param {string} [o.webComponentPath] where to write the LikeC4 web-component
 *                                  bundle (only for targets with `likec4WebComponent`).
 * @returns {Promise<{output:string, frontmatter:object, manifest:Array, likec4Dir:(string|null), webComponentPath:(string|null)}>}
 */
export async function emitOne({
  inputPath,
  target,
  modelDir = defaultModelDir(),
  likec4OutDir,
  assetsDir,
  webComponentPath: webComponentOut,
}) {
  if (!existsSync(inputPath)) throw new Error(`source not found: ${inputPath}`);
  const input = readFileSync(inputPath, "utf8");
  const imageDir = assetsDir ?? dirname(inputPath);
  const hasLikeC4Refs = /\blikec4=\S+/.test(input);
  const likec4Dir = regenerateLikeC4(modelDir, likec4OutDir, hasLikeC4Refs);

  const capture = {};
  const manifest = [];

  // The construct renderers are TARGET-PROVIDED. gdocs supplies its `-md`
  // flatteners; unitycatalog supplies MDX-emitting variants (+ a no-op for
  // callouts, which its site styles from the raw `:::` directive). The shared
  // core (parse/gfm/directive/proseGuard/frontmatter/prelude/codeSnippets) is
  // identical for every target.
  const constructs = target.constructs ?? {};
  const componentImportBase = target.componentImportBase;
  // A JSX-emitting target (unitycatalog) adds remark-mdx as a stringify EXTENSION:
  // it augments remark-stringify's compiler to serialize mdxJsxFlowElement/mdxjsEsm
  // nodes as MDX, rather than replacing the compiler. remark-stringify still runs.
  const stringifyExtension = target.stringifyExtension ?? null;

  let processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective) // parse :::/:::: container directives
    .use(remarkDirectiveProseGuard) // undo false-positive :x text directives in prose
    .use(remarkFrontmatter) // parse the YAML block into a `yaml` node
    .use(remarkPrelude, capture, {
      titleAsH1: target.titleAsH1,
      frontmatter: target.frontmatter,
    }) // strip draft fm + comments, opt. title → # H1, opt. emit target frontmatter
    .use(remarkCodeSnippets); // inline file=/start=/end= (real code from snippets/)

  // TL;DR, then callouts, then journey (so a callout/tldr nested in a step is
  // already rendered), then code-caption, then likec4 — mirroring the preview's
  // plugin order. A target that doesn't declare a construct simply skips it.
  if (constructs.tldr) processor = processor.use(constructs.tldr, { componentImportBase });
  if (constructs.callouts) processor = processor.use(constructs.callouts, { componentImportBase });
  if (constructs.journey) processor = processor.use(constructs.journey, { componentImportBase });
  if (constructs.codeCaption) processor = processor.use(constructs.codeCaption);
  if (constructs.likec4)
    processor = processor.use(constructs.likec4, {
      manifest,
      assetsDir: imageDir,
      likec4Dir,
      renderImage: target.renderImage,
      componentImportBase,
    });

  // Prose-unwrap is only for targets whose importer reflows (Google Docs); MDX
  // must keep authored line breaks, so unitycatalog opts out.
  if (target.unwrapProse ?? true) processor = processor.use(remarkUnwrapProse);

  processor = processor.use(remarkGfm);
  // A JSX-serializing target escapes MDX-significant chars in prose LAST, so bare
  // `<`/`{` in the draft's text don't break the MDX stringify (code is untouched).
  if (target.safeText) processor = processor.use(target.safeText);
  if (stringifyExtension) processor = processor.use(stringifyExtension);
  processor = processor.use(remarkStringify, target.stringify);

  const file = await processor.process({ value: input, path: inputPath });
  const output = String(file);

  // Interactive-LikeC4 targets (no React) get the framework-agnostic web-component
  // bundle registering <likec4-view>. Deterministic + no network, so it belongs in
  // the core. Guarded on the target opting in, a write path being supplied, AND the
  // source actually having a .likec4 reference.
  let webComponentPath = null;
  if (target.likec4WebComponent && webComponentOut) {
    webComponentPath = generateLikeC4WebComponent(modelDir, webComponentOut, hasLikeC4Refs);
  }

  return {
    output,
    frontmatter: capture.frontmatter ?? {},
    manifest,
    likec4Dir,
    webComponentPath,
  };
}

// --- main (blog CLI) -------------------------------------------------------

async function main() {
  const { slug, target: targetName } = parseArgs(process.argv.slice(2));
  if (!slug) throw new Error("usage: bun emit.mjs --slug <slug> --target <target>");
  if (!targetName) throw new Error("usage: bun emit.mjs --slug <slug> --target <target>");

  const target = await loadTarget(targetName);
  const draftDir = join(REPO_ROOT, "blogs", slug);
  const draftPath = join(draftDir, "index.md");
  if (!existsSync(draftPath)) throw new Error(`draft not found: ${draftPath}`);

  // dist/ root holds the shared, target-agnostic LikeC4 PNG export; each target's
  // FLATTENED/RENDERED output lands under dist/<target>/ so cross-publishing to
  // several targets (gdocs review → unitycatalog → …) is non-destructive: one
  // target's index.mdx never clobbers another's <slug>.md. dist/ is gitignored.
  const distDir = join(draftDir, "dist");
  const targetDistDir = join(distDir, targetName);
  mkdirSync(targetDistDir, { recursive: true });

  const { output, frontmatter, manifest, webComponentPath } = await emitOne({
    inputPath: draftPath,
    target,
    likec4OutDir: join(distDir, ".likec4-export"),
    // The likec4-md plugin resolves committed (non-likec4) images against the
    // draft folder itself, as before.
    assetsDir: draftDir,
    webComponentPath: join(targetDistDir, "likec4-webcomponent.mjs"),
  });

  // Existing delivery (if any) for this target — the create-vs-update hint. It
  // lives in the post's sidecar `.emitted.json` (keyed by target), self-contained
  // in blogs/<slug>/ so the mapping travels with the post (no global registry) and
  // index.md stays pure. The delivery skill writes this key back after a create.
  const existing = readSidecar(draftDir)[targetName] ?? null;

  const outName = target.outputFile ?? `${slug}.md`;
  const outPath = join(targetDistDir, outName);
  const assetsPath = join(targetDistDir, "assets.json");
  writeFileSync(outPath, output, "utf8");
  writeFileSync(
    assetsPath,
    JSON.stringify(
      {
        slug,
        target: targetName,
        title: frontmatter?.title ?? null,
        // The delivery agent reads this: null → CREATE (a new Doc / a new post
        // dir) and record it in the sidecar `.emitted.json`; set → UPDATE that
        // target in place. Shape is target-specific (gdocs: { doc_id, url,
        // updated }; unitycatalog: { post_dir, updated }).
        existing,
        images: manifest,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const rel = (p) => p.replace(REPO_ROOT + "/", "");
  console.log(`emitted (${targetName}):`);
  console.log(`  ${rel(outPath)}`);
  console.log(`  ${rel(assetsPath)}  (${manifest.length} image${manifest.length === 1 ? "" : "s"})`);
  if (webComponentPath) console.log(`  ${rel(webComponentPath)}  (LikeC4 web component)`);
  console.log(
    existing
      ? `  delivery: UPDATE existing ${targetName} target (${existing.url ?? existing.post_dir ?? "recorded"})`
      : `  delivery: CREATE new ${targetName} target (no "${targetName}" in ${slug}/.emitted.json)`,
  );
}

// Run the blog CLI only when invoked directly (bun emit.mjs …), not when this
// module is imported for its exported core (emitOne) — e.g. by the site twin driver.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`emit: ${err.message}`);
    process.exitCode = 1;
  });
}
