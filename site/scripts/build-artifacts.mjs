// Orchestrate the agentic-docs build artifacts in dependency order (Phases 1 & 3).
//
// These generators write into dist/ after `vite build` and before
// assemble-vercel-output.mjs. Ordering is load-bearing:
//   1. build-script-index — shells out to `docsnip scripts --json`, writes
//      dist/scripts.json + copies raw .py (needs uv).
//   2. build-md-twins    — emits the rich .md twins (needs headless Chromium for
//      LikeC4 PNG export); reads dist/scripts.json to fill tutorials' "Runnable
//      examples".
//   3. prerender-shells  — per-route HTML shells; <noscript> body renders from the
//      twins written in step 2 (never raw source).
//   4. build-sitemap / build-rss / build-site-llmstxt — discovery files;
//      llms-full.txt reads the twins, so it runs after them.
//
// Because steps 1–2 need uv + Chromium, this whole pass runs in the CI prebuild
// (which has both); the Vercel build consumes the produced dist/ artifacts. Run it
// directly with `node scripts/build-artifacts.mjs` after `vite build`.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Ordered: each writes into dist/; a failure aborts the pass (inherit stdio so the
// underlying error surfaces).
const STEPS = [
  "build-script-index.mjs",
  "build-md-twins.mjs",
  "prerender-shells.mjs",
  "build-sitemap.mjs",
  "build-rss.mjs",
  "build-site-llmstxt.mjs",
];

for (const step of STEPS) {
  console.log(`build-artifacts: → ${step}`);
  execFileSync(process.execPath, [resolve(here, step)], { stdio: "inherit" });
}
console.log("build-artifacts: done.");
