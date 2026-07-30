// Emit dist/scripts.json + copy the raw runnable .py scripts into dist/ (Phase 3
// of the agentic-docs plan).
//
// From a page's .md twin (and /llms.txt, and the future MCP), an agent gets a
// machine-readable pointer to each git-committed, CI-verified PEP 723 script plus
// its runtime contract, so it can fetch the exact source and `uv run` it. Scripts
// come from BOTH tutorial pages (content/) and blog posts (blogs/) — docsnip
// discovers both. There is ONE parser: this shells out to `docsnip scripts --json`
// (scriptmeta.py) rather than re-implementing PEP 723 in JS. The served .py is
// byte-identical to the committed source; gen-vercel-config serves it noindex +
// text/x-python.
//
// Run order (CI prebuild, where uv is available): before build-md-twins (which
// enriches tutorial twins' "Runnable examples" from dist/scripts.json) and before
// build-site-llmstxt (which lists scripts.json). First JS→docsnip shell-out in the
// build; a non-zero exit fails the build.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const distDir = resolve(siteRoot, "dist");

// The docsnip JSON contract version this script understands (asserted below).
const EXPECTED_VERSION = 1;

/** Run `docsnip scripts --json` and return the parsed, version-checked payload,
 *  or null if `uv` isn't available in this environment. The script index is an
 *  additive enrichment produced in the CI prebuild (which has `uv`); a build env
 *  without `uv` (e.g. the bare Vercel/preview build) simply skips it rather than
 *  failing the whole deploy. A non-zero exit from an AVAILABLE uv still throws. */
export function runDocsnipScripts(root = repoRoot) {
  let out;
  try {
    out = execFileSync("uv", ["run", "docsnip", "scripts", "--json"], {
      cwd: root,
      encoding: "utf8",
      // docsnip prints uv setup chatter to stderr; JSON goes to stdout.
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.warn("build-script-index: `uv` not found — skipping the script index (run in the CI prebuild).");
      return null;
    }
    throw err;
  }
  const payload = JSON.parse(out);
  if (payload.version !== EXPECTED_VERSION) {
    throw new Error(
      `build-script-index: docsnip scripts --json version ${payload.version} != expected ${EXPECTED_VERSION}; update the contract.`,
    );
  }
  return payload;
}

/**
 * Map one docsnip script entry to a served index entry (pure, for testing).
 * `entry.path` is repo-relative POSIX. Two layouts, matching the routes the site
 * serves (so `tutorialRoute` equals the owning page's refHref):
 *   - docs:  `content/<project>/<bucket>/<NNN-slug>/[snippets/]<file>.py`
 *            → `/docs/<project>/<bucket>/<slug>` (docsnip strips the `NNN-` prefix)
 *   - blogs: `blogs/<slug>/[snippets/]<file>.py`
 *            → `/blog/<slug>`
 * The fetch URL serves the file under that route, preserving any subpath + name.
 */
export function scriptEntry(entry) {
  const parts = entry.path.split("/");
  const slug = entry.tutorial_slug;
  let tutorialRoute = null;
  let rest = null;
  if (parts[0] === "blogs") {
    // blogs, <slug>, ...rest, file
    rest = parts.slice(2).join("/");
    tutorialRoute = slug ? `/blog/${slug}` : null;
  } else {
    // content, project, bucket, orderedSlug, ...rest, file
    const [, project, bucket] = parts;
    rest = parts.slice(4).join("/");
    tutorialRoute = project && bucket && slug ? `/docs/${project}/${bucket}/${slug}` : null;
  }
  const fetchUrl = tutorialRoute ? `${tutorialRoute}/${rest}` : null;
  return {
    gitPath: entry.path,
    fetchUrl,
    tutorialRoute,
    tutorialSlug: slug,
    requiresPython: entry.requires_python,
    dependencies: entry.dependencies,
    compose: entry.compose,
    services: entry.services,
    baseUrlEnv: entry.base_url_env,
  };
}

function main() {
  const payload = runDocsnipScripts();
  if (payload === null) return; // uv unavailable — skip (CI prebuild produces it)
  const scripts = payload.scripts.map(scriptEntry);

  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, "scripts.json"), `${JSON.stringify({ version: EXPECTED_VERSION, scripts }, null, 2)}\n`);

  // Copy each raw .py byte-identically to its served path under dist/.
  let copied = 0;
  for (const s of scripts) {
    if (!s.fetchUrl) continue;
    const dest = resolve(distDir, s.fetchUrl.replace(/^\//, ""));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(resolve(repoRoot, s.gitPath), dest);
    copied++;
  }
  console.log(`build-script-index: wrote scripts.json (${scripts.length}) + copied ${copied} .py into ${relative(siteRoot, distDir)}/.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
