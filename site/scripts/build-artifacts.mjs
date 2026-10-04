// Build the companion files the review workspace's script and `.md` twin tabs
// fetch. They write into dist/ after `vite build` and before
// assemble-vercel-output.mjs. Ordering is load-bearing:
//   1. build-script-index — shells out to `docsnip scripts --json`, writes
//      dist/scripts.json + copies raw .py (needs uv).
//   2. build-md-twins    — emits the rich .md twins (needs headless Chromium for
//      LikeC4 PNG export); reads dist/scripts.json to fill tutorials' "Runnable
//      examples".
//
// Because both need uv + Chromium, this whole pass runs in the CI prebuild
// (which has both); the Vercel build consumes the produced dist/ artifacts. Run it
// directly with `node scripts/build-artifacts.mjs` after `vite build`.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Ordered: each writes into dist/; a failure aborts the pass (inherit stdio so the
// underlying error surfaces).
const STEPS = ["build-script-index.mjs", "build-md-twins.mjs"];

for (const step of STEPS) {
  console.log(`build-artifacts: → ${step}`);
  execFileSync(process.execPath, [resolve(here, step)], { stdio: "inherit" });
}
console.log("build-artifacts: done.");
