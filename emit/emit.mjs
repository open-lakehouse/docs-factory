#!/usr/bin/env node
/**
 * emit.mjs — the deterministic emitter core.
 *
 * Resolve a canonical blog draft (blogs/<slug>/index.md) and FLATTEN its rich
 * constructs into portable, self-contained Markdown for a downstream target, plus
 * an image manifest. See emit/README.md and blogs/CONVENTIONS.md §5.
 *
 *   bun emit.mjs --slug <slug> [--target <target>[,<target>…]]…
 *     → blogs/<slug>/dist/<target>/index.mdx
 *     → blogs/<slug>/dist/<target>/assets.json
 *
 * Without `--target` it emits every target in the draft's `target:` list.
 *
 * The two target-agnostic transforms (snippet inlining, the prose-colon guard) are
 * imported VERBATIM from the preview harness so there is exactly one implementation
 * of each. The construct renderers (journey/callout/likec4/code-caption) come in
 * Markdown-flattening and MDX-component variants that live here. Delivery to the
 * target (copy the MDX post into the sibling site repo, upload images) is a separate
 * agent step — the /blog-emit skill.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// Shared, target-agnostic transforms — imported verbatim from the preview.
import { isPublic, splitFrontmatter } from "../site/src/content-core/frontmatter.mjs";
import { generateLikeC4Mermaid, hasLikeC4Marker } from "../site/src/plugins/lib/likec4-ref.mjs";
import remarkCodeSnippets from "../site/src/plugins/remark-code-snippets.mjs";
import remarkDirectiveProseGuard from "../site/src/plugins/remark-directive-prose-guard.mjs";
// The construct renderers (journey / callout / images / code-caption) and the
// prose-unwrap are now TARGET-PROVIDED (each target module declares which plugins
// it uses via its `constructs` map + flags), so the core imports none of them
// directly — see emit/targets/*.mjs. This keeps one linear core pipeline while
// letting a target flatten (md-twin) OR upgrade to components (unitycatalog).
import remarkLikeC4Blocks from "./plugins/remark-likec4-blocks.mjs";
import remarkTrestleMd from "./plugins/remark-trestle-md.mjs";
import remarkUnwrapProse from "./plugins/remark-unwrap-prose.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

// --- args -----------------------------------------------------------------

function parseArgs(argv) {
  const args = { targets: [] };
  const addTargets = (v) =>
    args.targets.push(
      ...String(v ?? "")
        .split(",")
        .filter(Boolean),
    );
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") args.slug = argv[++i];
    else if (a === "--target") addTargets(argv[++i]);
    else if (a.startsWith("--slug=")) args.slug = a.slice(7);
    else if (a.startsWith("--target=")) addTargets(a.slice(9));
  }
  return args;
}

async function loadTarget(name) {
  const path = join(HERE, "targets", `${name}.mjs`);
  if (!existsSync(path))
    throw new Error(`no emitter for target '${name}' (emit/targets/${name}.mjs)`);
  const mod = await import(path);
  return mod.default ?? mod;
}

/** A draft's `target:` as a list — one site, or the sites it is cross-posted to.
 *  The first entry is the primary, which holds the canonical URL. */
export function blogTargets(meta) {
  const t = meta?.target;
  if (t == null || t === "") return [];
  return (Array.isArray(t) ? t : [t]).map(String);
}

/**
 * The `canonical` URL a cross-post points at: the primary's delivered post.
 * Null for the primary itself (its site canonicalizes to itself), and when the
 * primary has no recorded delivery yet, since its post dir is only known then.
 */
export function crossPostCanonical(name, primary, sidecar) {
  if (!primary || name === primary.name) return null;
  const postDir = sidecar?.[primary.name]?.post_dir;
  return postDir && primary.postUrl ? primary.postUrl(postDir) : null;
}

// --- frontmatter + HTML-comment handling ----------------------------------

/**
 * A remark plugin: extract & strip the YAML frontmatter node, capture its parsed
 * value into `capture.frontmatter`, prepend the `title` as a top-level `#` heading,
 * and drop every HTML-comment node (drafting annotations that shouldn't ship).
 */
const COMMENT_RE = /^\s*<!--[\s\S]*-->\s*$/;

/** Drop HTML-comment nodes anywhere in the tree. mdast keeps a `<!-- … -->` as an
 * `html` node (top-level or inline inside a paragraph); both are drafting
 * annotations that must not ship. */
function stripComments(node) {
  if (!node.children) return;
  const hadComment = node.children.some((c) => c.type === "html" && COMMENT_RE.test(c.value));
  node.children = node.children.filter((c) => !(c.type === "html" && COMMENT_RE.test(c.value)));
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
 * @param opts     `{ titleAsH1, frontmatter, frontmatterContext }`:
 *                 - `titleAsH1` — when true, the frontmatter `title` is prepended as
 *                   a top-level `#` heading, for a target whose body has no title of
 *                   its own. Targets whose site renders the title from frontmatter
 *                   (e.g. UnityCatalog's `BlogPost.astro` renders `post.data.title`)
 *                   pass `titleAsH1: false` so it isn't duplicated.
 *                 - `frontmatter(draftFm) → object | string` — an OUTPUT-frontmatter
 *                   hook. A target may omit it (a plain body carries no YAML). A
 *                   content-collection target (unitycatalog) returns the target-shaped
 *                   frontmatter, which is prepended to the tree as a `yaml` node so
 *                   remark-frontmatter serializes it as a leading `--- … ---` block.
 *                 - `frontmatterContext` — passed to the hook as its second
 *                   argument: `{ canonical }` for a cross-post.
 */
function remarkPrelude(capture, opts = {}) {
  const titleAsH1 = opts.titleAsH1 ?? true;
  const frontmatterFn = opts.frontmatter ?? null;
  const frontmatterContext = opts.frontmatterContext ?? {};
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
          (n.children.length === 0 || n.children.every((c) => c.type === "text" && !c.value.trim()))
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
      const mapped = frontmatterFn(capture.frontmatter ?? {}, frontmatterContext);
      if (mapped != null) {
        const yaml = typeof mapped === "string" ? mapped : stringifyYaml(mapped).replace(/\n$/, "");
        tree.children.unshift({ type: "yaml", value: yaml });
      }
    }
  };
}

// --- LikeC4 Mermaid --------------------------------------------------------

/**
 * Write every view's `<viewId>.mmd` from the unified architecture LikeC4
 * workspace into `outDir` (throwaway, under dist/), for remark-likec4-blocks to
 * read by view id. Returns `outDir`, or null when the draft has no marker.
 */
function regenerateLikeC4(modelDir, outDir, hasLikeC4Refs) {
  if (!hasLikeC4Refs) return null;
  if (!existsSync(modelDir)) return null;
  try {
    return generateLikeC4Mermaid(modelDir, outDir);
  } catch (err) {
    throw new Error(`LikeC4 Mermaid generation failed for ${modelDir}: ${err.message}`);
  }
}

/**
 * Generate the framework-agnostic LikeC4 web-component bundle for a target that
 * renders diagrams interactively (e.g. UnityCatalog's Astro site, which has no
 * React). The bundle registers a `<likec4-view view-id="…">` custom element backed
 * by the unified architecture model.
 *
 * Returns `outFile` on success, else null (draft has no likec4 block).
 */
export function generateLikeC4WebComponent(modelDir, outFile, hasLikeC4Refs) {
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
// { post_dir, updated }. Self-contained in the post folder (so it travels with
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

/** Source workspace for `likec4` blocks' views. */
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
 * @param {string} [o.modelDir]    architecture model dir for the LikeC4 views
 *                                  (default: `defaultModelDir()`).
 * @param {string} o.likec4OutDir  throwaway dir where each view's <viewId>.mmd lands.
 * @param {string} [o.assetsDir]   dir the images plugin resolves local images
 *                                  against (default: dirname(inputPath)).
 * @param {string} [o.webComponentPath] where to write the LikeC4 web-component
 *                                  bundle (only for targets with `likec4WebComponent`).
 * @param {boolean} [o.likec4Exported] `likec4OutDir` already holds this run's
 *                                  export (a multi-page caller exports once).
 * @param {object} [o.frontmatterContext] passed to the target's `frontmatter`
 *                                  hook (`{ canonical }` for a cross-post).
 * @param {string} [o.envsDir]    where `trestle` markers' environments are
 *                                  (default: the repo's envs/).
 * @param {Array} [o.plugins]      extra `[plugin, options]` remark transforms, run
 *                                  right after snippet inlining and before the
 *                                  target's constructs (e.g. the docs-site emitter's
 *                                  link rewriting).
 * @returns {Promise<{output:string, frontmatter:object, manifest:Array, likec4:Array, trestle:Array, likec4Dir:(string|null), webComponentPath:(string|null)}>}
 *   `likec4` and `trestle` list the page's diagram markers (see
 *   plugins/remark-likec4-blocks.mjs, plugins/remark-trestle-md.mjs).
 */
export async function emitOne({
  inputPath,
  target,
  modelDir = defaultModelDir(),
  likec4OutDir,
  assetsDir,
  webComponentPath: webComponentOut,
  likec4Exported = false,
  frontmatterContext = {},
  envsDir = join(REPO_ROOT, "envs"),
  prePlugins = [],
  plugins = [],
}) {
  if (!existsSync(inputPath)) throw new Error(`source not found: ${inputPath}`);
  const input = readFileSync(inputPath, "utf8");
  const imageDir = assetsDir ?? dirname(inputPath);
  const hasLikeC4Refs = hasLikeC4Marker(input);
  const likec4Dir =
    likec4Exported && hasLikeC4Refs
      ? likec4OutDir
      : regenerateLikeC4(modelDir, likec4OutDir, hasLikeC4Refs);

  const capture = {};
  const manifest = [];
  const likec4 = [];
  const trestle = [];

  // The construct renderers are TARGET-PROVIDED. A flattening target (md-twin)
  // supplies the `-md` flatteners; unitycatalog supplies MDX-emitting variants (+ a
  // no-op for callouts, which its site styles from the raw `:::` directive). The
  // shared core (parse/gfm/directive/proseGuard/frontmatter/prelude/codeSnippets) is
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
    .use(remarkFrontmatter); // parse the YAML block into a `yaml` node
  // Before the prelude, which drops the HTML comments some embeds are marked by.
  for (const [plugin, options] of prePlugins) processor = processor.use(plugin, options);
  processor = processor
    .use(remarkPrelude, capture, {
      titleAsH1: target.titleAsH1,
      frontmatter: target.frontmatter,
      frontmatterContext,
    }) // strip draft fm + comments, opt. title → # H1, opt. emit target frontmatter
    .use(remarkCodeSnippets); // inline file=/start=/end= (real code from snippets/)
  for (const [plugin, options] of plugins) processor = processor.use(plugin, options);

  // Prerequisites, then TL;DR, then callouts, then tabs, then journey (so a callout/tldr/tab nested in a
  // step is already rendered), then code-caption, then diagrams and images —
  // mirroring the preview's plugin order. A target that doesn't declare a
  // construct simply skips it.
  if (constructs.prerequisites) processor = processor.use(constructs.prerequisites);
  if (constructs.tldr) processor = processor.use(constructs.tldr, { componentImportBase });
  if (constructs.callouts) processor = processor.use(constructs.callouts, { componentImportBase });
  if (constructs.tabs) processor = processor.use(constructs.tabs);
  if (constructs.journey) processor = processor.use(constructs.journey, { componentImportBase });
  if (constructs.codeCaption) processor = processor.use(constructs.codeCaption);
  // Every target resolves LikeC4 markers: by default to the view's Mermaid.
  processor = processor.use(remarkLikeC4Blocks, {
    entries: likec4,
    likec4Dir,
    renderLikeC4: target.renderLikeC4,
  });
  if (constructs.likec4) processor = processor.use(constructs.likec4, { componentImportBase });
  if (constructs.images)
    processor = processor.use(constructs.images, {
      manifest,
      assetsDir: imageDir,
      renderImage: target.renderImage,
    });
  // Every target resolves Trestle diagram markers: the twin and the blog targets
  // to Trestle's Mermaid, the docs-site target to a marker its canvas reads.
  processor = processor.use(remarkTrestleMd, {
    entries: trestle,
    envsDir,
    pageDir: dirname(inputPath),
    renderTrestle: target.renderTrestle,
  });

  // Prose-unwrap is only for flattening targets that reflow authoring hard-wraps
  // (md-twin); MDX must keep authored line breaks, so unitycatalog opts out.
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
  // source actually having a likec4 block.
  let webComponentPath = null;
  if (target.likec4WebComponent && webComponentOut) {
    webComponentPath = generateLikeC4WebComponent(modelDir, webComponentOut, hasLikeC4Refs);
  }

  return {
    output,
    frontmatter: capture.frontmatter ?? {},
    manifest,
    likec4,
    trestle,
    likec4Dir,
    webComponentPath,
  };
}

// --- main (blog CLI) -------------------------------------------------------

async function main() {
  const usage = "usage: bun emit.mjs --slug <slug> [--target <target>[,<target>…]]…";
  const { slug, targets: requested } = parseArgs(process.argv.slice(2));
  if (!slug) throw new Error(usage);

  const draftDir = join(REPO_ROOT, "blogs", slug);
  const draftPath = join(draftDir, "index.md");
  if (!existsSync(draftPath)) throw new Error(`draft not found: ${draftPath}`);
  const { meta } = splitFrontmatter(readFileSync(draftPath, "utf8"));
  if (meta.status === "private") throw new Error(`${slug} is private and never emitted`);
  // Re-emitting an unreleased draft to check a target's rendering is routine;
  // delivering one is the mistake this warns about.
  if (!isPublic(meta)) {
    console.warn(`warning: ${slug} is status: ${meta.status ?? "draft"}, not ready`);
  }

  const listed = blogTargets(meta);
  for (const name of requested) {
    if (!listed.includes(name)) console.warn(`warning: ${slug} does not list target '${name}'`);
  }
  const names = [...new Set(requested.length ? requested : listed)];
  if (!names.length) throw new Error(`${slug} has no target: set \`target:\` or pass --target`);
  // Primary first, so its render (and later its delivery) precedes the cross-posts'.
  const rank = (n) => (listed.includes(n) ? listed.indexOf(n) : listed.length);
  names.sort((a, b) => rank(a) - rank(b));
  // Load every emitter before writing anything, so a missing one fails cleanly.
  const loaded = new Map();
  for (const name of names) loaded.set(name, await loadTarget(name));

  const primaryName = listed[0] ?? names[0];
  let primary = loaded.get(primaryName) ?? null;
  if (!primary) {
    try {
      primary = await loadTarget(primaryName);
    } catch {
      console.warn(`warning: primary target '${primaryName}' has no emitter; no canonical URL`);
    }
  }

  const sidecar = readSidecar(draftDir);
  let likec4Exported = false;
  for (const [name, target] of loaded) {
    const { likec4Dir } = await emitTarget({
      slug,
      draftDir,
      draftPath,
      name,
      target,
      primaryName,
      canonical: crossPostCanonical(name, primary, sidecar),
      existing: sidecar[name] ?? null,
      likec4Exported,
    });
    likec4Exported ||= likec4Dir != null;
  }
}

async function emitTarget({
  slug,
  draftDir,
  draftPath,
  name,
  target,
  primaryName,
  canonical,
  existing,
  likec4Exported,
}) {
  // dist/ root holds the shared, target-agnostic LikeC4 Mermaid; each target's
  // RENDERED output lands under dist/<target>/ so cross-publishing to several
  // targets (unitycatalog → delta → …) is non-destructive: one target's index.mdx
  // never clobbers another's. dist/ is gitignored.
  const distDir = join(draftDir, "dist");
  const targetDistDir = join(distDir, name);
  mkdirSync(targetDistDir, { recursive: true });

  const { output, frontmatter, manifest, likec4Dir, webComponentPath } = await emitOne({
    inputPath: draftPath,
    target,
    likec4OutDir: join(distDir, ".likec4-export"),
    likec4Exported,
    // The images plugin resolves committed images against the draft folder.
    assetsDir: draftDir,
    webComponentPath: join(targetDistDir, "likec4-webcomponent.mjs"),
    frontmatterContext: { canonical },
  });

  const outName = target.outputFile ?? `${slug}.md`;
  const outPath = join(targetDistDir, outName);
  const assetsPath = join(targetDistDir, "assets.json");
  writeFileSync(outPath, output, "utf8");
  writeFileSync(
    assetsPath,
    JSON.stringify(
      {
        slug,
        target: name,
        primary: primaryName,
        canonical,
        title: frontmatter?.title ?? null,
        // The delivery agent reads this: null → CREATE (a new post dir) and
        // record it in the sidecar `.emitted.json`; set → UPDATE that target in
        // place. Shape is { post_dir, updated }.
        existing,
        images: manifest,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const rel = (p) => p.replace(REPO_ROOT + "/", "");
  console.log(`emitted (${name}${name === primaryName ? ", primary" : ""}):`);
  console.log(`  ${rel(outPath)}`);
  console.log(
    `  ${rel(assetsPath)}  (${manifest.length} image${manifest.length === 1 ? "" : "s"})`,
  );
  if (webComponentPath) console.log(`  ${rel(webComponentPath)}  (LikeC4 web component)`);
  console.log(
    existing
      ? `  delivery: UPDATE existing ${name} target (${existing.post_dir ?? "recorded"})`
      : `  delivery: CREATE new ${name} target (no "${name}" in ${slug}/.emitted.json)`,
  );
  if (name !== primaryName) {
    console.log(
      canonical
        ? `  canonical: ${canonical}`
        : `  canonical: pending — deliver ${primaryName} first, then re-emit ${name}`,
    );
  }
  return { likec4Dir };
}

// Run the blog CLI only when invoked directly (bun emit.mjs …), not when this
// module is imported for its exported core (emitOne) — e.g. by the site twin driver.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`emit: ${err.message}`);
    process.exitCode = 1;
  });
}
