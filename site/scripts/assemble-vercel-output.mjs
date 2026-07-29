// Assemble the Vercel Build Output API tree from Vite's `dist/`.
//
// Vercel's Build Output API expects a `.vercel/output/` directory containing
//   - `static/`      the servable static assets (our built SPA)
//   - `config.json`  the routing config (written by gen-vercel-config.mjs)
// Vercel reads this AFTER the build, so the build-generated `/api` rewrite is
// applied to the same deployment (unlike a top-level vercel.json, which Vercel
// reads before the build). See gen-vercel-config.mjs + docs/deploy/runbook.md.
//
// Run order (see package.json `build`): vite build → this → gen-vercel-config.
// This step only moves the static assets; the routing config is written next so
// a missing NEON_FUNCTION_HOST fails the build with a clear error there.
import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const distDir = resolve(siteRoot, "dist");
const staticDir = resolve(siteRoot, ".vercel/output/static");

// Start clean so a stale prior build can't leak files into the output.
rmSync(staticDir, { recursive: true, force: true });
cpSync(distDir, staticDir, { recursive: true });
console.log("assemble-vercel-output: copied dist/ → .vercel/output/static/");
