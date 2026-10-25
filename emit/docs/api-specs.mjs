#!/usr/bin/env bun
/**
 * Vendor every OpenAPI spec the docs sites declare into emit/docs/specs/, at its
 * pinned repo and ref, and delete copies no site pins any more. The emitter
 * reads only these copies, so an emit never fetches anything.
 *
 *   bun docs/api-specs.mjs [--check]
 *
 * --check fetches nothing: it exits non-zero when a pinned spec is missing.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { vendoredSpecs } from "./api.mjs";
import { DOCS_SITES } from "./sites/index.mjs";

const DOCS_DIR = import.meta.dir;
const SPECS_DIR = join(DOCS_DIR, "specs");

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const pinned = DOCS_SITES.flatMap(vendoredSpecs);
const missing = pinned.filter((s) => !existsSync(join(DOCS_DIR, s.path)));

if (process.argv.includes("--check")) {
  for (const s of missing) console.error(`api-specs: ${s.path} is not vendored`);
  if (missing.length) {
    console.error("api-specs: run `just api-specs`");
    process.exit(1);
  }
  process.exit(0);
}

for (const s of missing) {
  const res = await fetch(s.url);
  if (!res.ok) throw new Error(`api-specs: ${s.url}: HTTP ${res.status}`);
  const out = join(DOCS_DIR, s.path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await res.text());
  console.log(`api-specs: vendored ${s.path}`);
}

const keep = new Set(pinned.map((s) => join(DOCS_DIR, s.path)));
for (const file of filesUnder(SPECS_DIR)) {
  if (keep.has(file)) continue;
  rmSync(file);
  console.log(`api-specs: removed ${relative(DOCS_DIR, file)}`);
}
