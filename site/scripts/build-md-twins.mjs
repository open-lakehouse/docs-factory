// Build the reader-optimized `.md` twin of every public page (Phase 1a of the
// agentic-docs plan).
//
// A twin is the RICH emitter rendering of a page — NOT its authoring-shaped
// source. Our on-disk content/**/*.md and blogs/*/index.md carry `file=` snippet
// fences, `:::callout`/`:::tldr`/`::::journey` directives, and `likec4=` view
// embeds; that raw form must never be served. This driver runs the shared emitter
// core (emit/emit.mjs `emitOne`) with the `md-twin` target over each public page,
// producing clean markdown with snippets inlined, constructs flattened, and LikeC4
// views resolved to site-served PNGs. The twin is written at the page's canonical
// route + `.md` (e.g. /docs/<project>/<bucket>/<slug>.md, /blog/<slug>.md), which
// is exactly what `twinUrl()` advertises and the gen-vercel-config `.md` rules
// serve.
//
// Run order: after `vite build`, before prerender-shells.mjs (whose <noscript>
// body now renders from these twins) and before assemble-vercel-output.mjs. Needs
// a headless Chromium for the LikeC4 PNG export (emitOne → regenerateLikeC4), so
// it runs in the CI prebuild stage. DB-free: gated on git-authoritative
// `isPublic()` (status: ready), the same gate prerender-shells + llms.txt use.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emitOne, defaultModelDir } from "../../emit/emit.mjs";
import mdTwin from "../../emit/targets/md-twin.mjs";
import { splitFrontmatter, isPublic } from "../src/content-core/frontmatter.mjs";
import { docIdentity, hrefFromIdentity } from "../src/content-core/identity.mjs";
import { walkBlogs, walkContent } from "../src/content-core/walk.mjs";
import { canonicalUrl, siteOrigin } from "../src/content-core/head.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const distDir = resolve(siteRoot, "dist");
// Throwaway dir the emitter exports LikeC4 <viewId>.png into; the driver copies the
// ones a twin references into dist/assets/likec4/ (served) below.
const likec4ExportDir = resolve(distDir, ".likec4-export");
const likec4AssetDir = resolve(distDir, "assets", "likec4");

const origin = siteOrigin();

/** The twin's on-disk path under dist/, from a page href: canonical route + `.md`.
 *  "/docs/a/b/c" → dist/docs/a/b/c.md; "/blog/slug" → dist/blog/slug.md. */
export function twinPathForHref(href) {
  return resolve(distDir, `${href.replace(/^\//, "")}.md`);
}

/**
 * Inject the `canonical:` line into the twin's leading frontmatter block. The
 * md-twin target emits `title`/`summary`/`diataxis`/`project` from the draft alone
 * (no site coupling); only the driver knows the site origin + identity, so it adds
 * the canonical URL here. If the twin has no frontmatter block (no title/summary),
 * prepend one carrying just the canonical.
 */
export function injectCanonical(output, canonical) {
  if (!canonical) return output;
  const line = `canonical: ${canonical}`;
  if (output.startsWith("---\n")) {
    const end = output.indexOf("\n---", 4);
    if (end !== -1) {
      const head = output.slice(0, end);
      const rest = output.slice(end);
      return `${head}\n${line}${rest}`;
    }
  }
  return `---\n${line}\n---\n\n${output}`;
}

/**
 * Render the "Runnable examples" section body for a tutorial from its scripts
 * (Phase 3, pure for testing). Each script → its same-origin fetch URL, PEP 723
 * runtime contract (deps `uv run` resolves, compose services needed), and the
 * "CI-verified; the script *is* the test" note. Empty string if no scripts.
 */
export function runnableExamplesSection(scripts) {
  if (!scripts || scripts.length === 0) return "";
  const lines = ["## Runnable examples", ""];
  lines.push(
    "These are git-committed, CI-verified PEP 723 scripts — the script *is* the test.",
    "Fetch the raw source same-origin and run it with `uv run <file>` (uv builds an",
    "ephemeral environment from the inline dependency metadata; no venv or pip).",
    "",
  );
  for (const s of scripts) {
    lines.push(`- [\`${s.fetchUrl.split("/").pop()}\`](${s.fetchUrl})`);
    if (s.requiresPython) lines.push(`  - requires Python \`${s.requiresPython}\``);
    if (s.dependencies?.length) lines.push(`  - dependencies: ${s.dependencies.map((d) => `\`${d}\``).join(", ")}`);
    if (s.compose) {
      const svc = s.services?.length ? ` (services: ${s.services.map((x) => `\`${x}\``).join(", ")})` : "";
      lines.push(`  - needs Docker Compose \`${s.compose}\`${svc}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Fill the scaffolded sections. Phase 2 (concepts) and Phase 3 (examples) replace
 *  the `_None yet._` placeholders; a placeholder stays when there's nothing to add,
 *  so the section is always present and easy to find. `examples` is the pre-built
 *  "Runnable examples" markdown (only for tutorial pages). */
export function scaffoldSections(output, { isTutorial, examples = "" } = {}) {
  let out = output.replace(/\s*$/, "\n");
  out += `\n## Related concepts\n\n_None yet._\n`;
  if (isTutorial) out += `\n${examples || "## Runnable examples\n\n_None yet._\n"}`;
  return out;
}

/** Copy the LikeC4 PNGs a twin references from the throwaway export dir into the
 *  served assets dir (dist/assets/likec4/<viewId>.png), matching the URL
 *  md-twin.renderImage emits. */
function copyLikeC4Pngs(manifest) {
  for (const entry of manifest) {
    if (!entry.likec4 || !entry.localPath) continue;
    const dest = resolve(likec4AssetDir, `${entry.likec4}.png`);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(entry.localPath, dest);
  }
}

/** Load dist/scripts.json (written by build-script-index) into a route → scripts
 *  map, so a tutorial twin's "Runnable examples" can be filled. Empty map if the
 *  index hasn't been built (then the placeholder stays). */
function loadScriptsByRoute() {
  const byRoute = new Map();
  const path = resolve(distDir, "scripts.json");
  if (!existsSync(path)) return byRoute;
  try {
    const { scripts } = JSON.parse(readFileSync(path, "utf8"));
    for (const s of scripts ?? []) {
      if (!s.tutorialRoute) continue;
      (byRoute.get(s.tutorialRoute) ?? byRoute.set(s.tutorialRoute, []).get(s.tutorialRoute)).push(s);
    }
  } catch {
    /* leave empty — placeholder stays */
  }
  return byRoute;
}

/** Emit one page's twin. Returns the written path (relative to dist/), or null if
 *  the page isn't public or has no route. */
async function buildTwin(absPath, scriptsByRoute) {
  const raw = readFileSync(absPath, "utf8");
  const { meta } = splitFrontmatter(raw);
  if (!isPublic(meta)) return null;
  const identity = docIdentity(absPath, meta);
  const href = hrefFromIdentity(identity);
  if (!href) return null;

  let output;
  let manifest;
  try {
    ({ output, manifest } = await emitOne({
      inputPath: absPath,
      target: mdTwin,
      modelDir: defaultModelDir(),
      likec4OutDir: likec4ExportDir,
      assetsDir: dirname(absPath),
    }));
  } catch (err) {
    // The only heavy dependency in emitOne is the LikeC4 PNG export (headless
    // Chromium). In a bare build env (no Chromium) it throws; twins are produced
    // in the CI prebuild that HAS Chromium, so here we skip the page with a
    // warning rather than crashing the deploy. Pages without a `likec4=` diagram
    // never invoke the export and are unaffected.
    console.warn(`build-md-twins: skipping ${href} — ${err.message.split("\n")[0]}`);
    return null;
  }

  copyLikeC4Pngs(manifest);

  const isTutorial = identity.bucket === "tutorials";
  const withCanonical = injectCanonical(output, canonicalUrl(identity, origin));
  const withSections = scaffoldSections(withCanonical, {
    isTutorial,
    examples: isTutorial ? runnableExamplesSection(scriptsByRoute.get(href)) : "",
  });

  const outPath = twinPathForHref(href);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, withSections, "utf8");
  return relative(distDir, outPath);
}

async function main() {
  // build-script-index runs before us (CI prebuild), so dist/scripts.json exists;
  // if it doesn't, tutorial twins keep the "_None yet._" placeholder.
  const scriptsByRoute = loadScriptsByRoute();
  const written = [];
  for (const absPath of [
    ...walkContent(resolve(repoRoot, "content")),
    ...walkBlogs(resolve(repoRoot, "blogs")),
  ]) {
    const out = await buildTwin(absPath, scriptsByRoute);
    if (out) written.push(out);
  }
  console.log(`build-md-twins: wrote ${written.length} .md twin(s) into dist/.`);
}

// Run only when invoked directly, so tests can import the pure helpers.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`build-md-twins: ${err.message}`);
    process.exitCode = 1;
  });
}
