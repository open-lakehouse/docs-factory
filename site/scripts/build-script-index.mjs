// Emit dist/scripts.json + copy the raw runnable scripts into dist/ (Phase 3 of
// the agentic-docs plan): PEP 723 .py scripts, plus the .sh a harness verifies.
//
// From a page's .md twin (and /llms.txt, and the future MCP), an agent gets a
// machine-readable pointer to each git-committed, CI-verified PEP 723 script plus
// its runtime contract, so it can fetch the exact source and `uv run` it. Scripts
// come from BOTH tutorial pages (content/) and blog posts (blogs/) — docsnip
// discovers both. There is ONE parser: this shells out to `docsnip scripts --json`
// (scriptmeta.py) rather than re-implementing PEP 723 in JS. The served .py is
// the committed source without the `--8<--` section markers or the factory-only
// PEP 723 tables (see publishScript): authoring scaffolding that is noise, or
// breaks `uv run`, for someone who fetches the whole script. The result is
// still a runnable PEP 723 script. gen-vercel-config serves it noindex +
// text/x-python.
//
// Run order (CI prebuild, where uv is available): before build-md-twins (which
// enriches tutorial twins' "Runnable examples" from dist/scripts.json) and before
// build-site-llmstxt (which lists scripts.json). First JS→docsnip shell-out in the
// build; a non-zero exit fails the build.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hrefFromIdentity } from "../src/content-core/identity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const distDir = resolve(siteRoot, "dist");

// The docsnip JSON contract version this script understands (asserted below).
const EXPECTED_VERSION = 2;

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
      console.warn(
        "build-script-index: `uv` not found — skipping the script index (run in the CI prebuild).",
      );
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

// A pymdownx/mkdocs snippet marker line, e.g. `# --8<-- [start:attach]` or
// `# --8<-- [end:attach]`. These are whole-line Python comments that delimit the
// regions `file=… start=… end=…` fences inline (see fences.mjs / snippetcheck.py).
// Anchored to a full line so we never clip a `--8<--` that appears inside a string.
const SECTION_MARKER_LINE_RE = /^\s*#\s*--8<--\s*\[(?:start|end):[^\]]*\]\s*$/;

/**
 * Strip `--8<--` section-marker comment lines from a served script (pure, for
 * testing), then tidy the whitespace those lines leave behind: runs of ≥2 blank
 * lines collapse to one, and leading/trailing blank lines are trimmed. The result
 * ends with exactly one trailing newline. The markers are authoring scaffolding
 * (they carve out `file=` snippet regions); a reader who fetches the whole script
 * should get clean, runnable source without them. The git source keeps its markers
 * — only this served copy drops them.
 */
export function stripSectionMarkers(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const line of lines) {
    if (SECTION_MARKER_LINE_RE.test(line)) continue;
    // Collapse consecutive blanks (also drops a leading blank left by a marker).
    if (line.trim() === "" && (out.length === 0 || out[out.length - 1].trim() === "")) {
      continue;
    }
    out.push(line);
  }
  // Trim a trailing blank line, then re-append exactly one newline.
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return `${out.join("\n")}\n`;
}

// PEP 723 tables only the factory reads: the test harness contract and local-path
// package sources. Neither resolves outside this repo; uv ignores the first and
// fails on the second.
const FACTORY_TABLE_RE = /^\[tool\.(?:docs-factory|uv\.sources)\]$/;

/**
 * The served copy of a script (pure, for testing): `stripSectionMarkers`, plus the
 * factory-only tables removed from its `# /// script` block. `requires-python` and
 * `dependencies` stay, so `uv run` still builds the environment.
 */
export function publishScript(text) {
  const lines = stripSectionMarkers(text).split("\n");
  const out = [];
  let inBlock = false;
  let dropping = false;
  for (const line of lines) {
    if (!inBlock) {
      inBlock = line === "# /// script";
      out.push(line);
      continue;
    }
    if (line === "# ///") {
      while (out.at(-1) === "#") out.pop();
      inBlock = false;
      dropping = false;
      out.push(line);
      continue;
    }
    const toml = line.replace(/^# ?/, "");
    if (toml.startsWith("[")) dropping = FACTORY_TABLE_RE.test(toml.trim());
    if (dropping || (line === "#" && out.at(-1) === "#")) continue;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * A script's one-line purpose (pure, for testing): the first line of a Python
 * module docstring, or the first comment paragraph after a shell shebang. Null
 * when the script has neither.
 */
export function scriptSummary(text, kind) {
  if (kind === "shell") {
    const para = [];
    for (const line of text.split("\n").slice(text.startsWith("#!") ? 1 : 0)) {
      const m = /^#(?: (.*))?$/.exec(line);
      if (!m || m[1] === undefined || line.includes("--8<--")) break;
      para.push(m[1].trim());
    }
    return para.join(" ") || null;
  }
  const doc = /^(?:#.*\n|\s*\n)*[rRuU]?("""|''')\s*([^\n]*)/.exec(text);
  return doc?.[2].replace(/("""|''').*$/, "").trim() || null;
}

/** The owning page route + served path for a repo-relative content/blog file. */
function servedPaths(path, slug, hrefFor) {
  const parts = path.split("/");
  let identity;
  let rest;
  if (parts[0] === "blogs") {
    // blogs, <slug>, ...rest, file
    identity = { area: "blogs", slug };
    rest = parts.slice(2).join("/");
  } else {
    // content, project, bucket, orderedSlug, ...rest, file
    const [, project, bucket] = parts;
    identity = { area: "docs", project, bucket, slug };
    rest = parts.slice(4).join("/");
  }
  const tutorialRoute = slug ? hrefFor(identity) : null;
  const fetchUrl = tutorialRoute ? `${tutorialRoute}/${rest}` : null;
  return { tutorialRoute, fetchUrl };
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
 *
 * A harness entry (`verifies` set, e.g. `foo_cli.py` driving `foo.sh`) publishes
 * the verified `.sh` the page quotes instead of itself. It keeps the harness's
 * compose contract (the stack the script talks to) but not its Python deps, which
 * are the harness's own.
 *
 * `hrefFor` maps an identity to its page route; an emitted target site passes
 * its own URL scheme.
 */
export function scriptEntry(entry, { hrefFor = hrefFromIdentity } = {}) {
  const slug = entry.tutorial_slug;
  const shell = Boolean(entry.verifies);
  const gitPath = shell ? entry.verifies : entry.path;
  return {
    kind: shell ? "shell" : "python",
    gitPath,
    ...servedPaths(gitPath, slug, hrefFor),
    tutorialSlug: slug,
    requiresPython: shell ? null : entry.requires_python,
    dependencies: shell ? [] : entry.dependencies,
    compose: entry.compose,
    services: entry.services,
    baseUrlEnv: entry.base_url_env,
    env: shell ? {} : (entry.env ?? {}),
  };
}

function main() {
  const payload = runDocsnipScripts();
  if (payload === null) return; // uv unavailable — skip (CI prebuild produces it)
  const scripts = payload.scripts.map((e) => {
    const s = scriptEntry(e);
    return {
      ...s,
      summary: scriptSummary(readFileSync(resolve(repoRoot, s.gitPath), "utf8"), s.kind),
    };
  });

  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    resolve(distDir, "scripts.json"),
    `${JSON.stringify({ version: EXPECTED_VERSION, scripts }, null, 2)}\n`,
  );

  // Copy each script to its served path under dist/ as publishScript() shapes it
  // (still runnable; the git source keeps its markers and factory tables).
  let copied = 0;
  for (const s of scripts) {
    if (!s.fetchUrl) continue;
    const dest = resolve(distDir, s.fetchUrl.replace(/^\//, ""));
    mkdirSync(dirname(dest), { recursive: true });
    const raw = readFileSync(resolve(repoRoot, s.gitPath), "utf8");
    writeFileSync(dest, publishScript(raw));
    copied++;
  }
  console.log(
    `build-script-index: wrote scripts.json (${scripts.length}) + copied ${copied} script(s) into ${relative(siteRoot, distDir)}/.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
