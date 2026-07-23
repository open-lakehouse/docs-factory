#!/usr/bin/env bun
/**
 * Strips registry proxy URLs out of every committed bun.lock.
 *
 * Local installs route through the internal Databricks npm proxy, which bakes a
 * host-specific tarball URL into the resolution (second) field of each package
 * entry. That URL is unreachable from GitHub runners and must never land in a
 * PR, so this resets it to "" — the value Bun uses for the default registry.
 *
 * Host-agnostic: matches any http(s) registry tarball URL (".../-/<name>-<version>.tgz")
 * sitting in the resolution slot. Git, GitHub, file, and already-empty
 * resolutions are left untouched. Names, versions, dependency maps, and
 * integrity hashes are never modified.
 *
 * This replaces the old .github/actions/npm-public rewrite-at-CI step: the
 * lockfiles now ship clean and CI just runs `--check` before a frozen install.
 * Adapted from mangrove's scripts/strip-bun-lock-proxy.ts (extended to the four
 * docs-factory workspaces).
 *
 * Usage:
 *   bun run scripts/strip-bun-lock-proxy.ts            # rewrite all bun.lock in place
 *   bun run scripts/strip-bun-lock-proxy.ts --check    # exit 1 if any proxy URLs exist (no write)
 *   bun run scripts/strip-bun-lock-proxy.ts <path...>   # operate on the given bun.lock(s)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// The workspaces that carry a bun.lock. Kept in sync with the workspaces that
// have a package.json; pre-commit also passes staged paths as argv (below).
const DEFAULT_LOCKS = [
  "site/bun.lock",
  "server/bun.lock",
  "architecture/bun.lock",
  "emit/bun.lock",
];

// Group 1 is the entry head: ["<name>@<version>", . Group 2 is the proxied
// resolution URL, which we drop (replace the whole match with group 1 + "").
const PROXY_RESOLUTION = /(\["[^"]+@[^"]+", )"https?:\/\/[^"]*\/-\/[^"]*\.tgz"/g;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const paths = args.filter((a) => !a.startsWith("--"));
const repoRoot = resolve(import.meta.dirname, "..");
const locks = (paths.length ? paths : DEFAULT_LOCKS)
  .map((p) => resolve(repoRoot, p))
  .filter((p) => existsSync(p));

let dirty = 0;
let totalMatches = 0;

for (const lock of locks) {
  const original = readFileSync(lock, "utf8");
  const matches = original.match(PROXY_RESOLUTION)?.length ?? 0;
  if (matches === 0) continue;
  totalMatches += matches;
  dirty += 1;
  const rel = lock.slice(repoRoot.length + 1);
  if (checkOnly) {
    console.error(`${rel}: ${matches} proxied resolution URL(s).`);
    continue;
  }
  writeFileSync(lock, original.replace(PROXY_RESOLUTION, '$1""'));
  console.log(`Stripped ${matches} proxy URL(s) from ${rel}.`);
}

if (checkOnly) {
  if (dirty > 0) {
    console.error(
      `\n${totalMatches} proxy URL(s) across ${dirty} lockfile(s). Run: just strip-lock-proxy`,
    );
    process.exit(1);
  }
  console.log("All bun.lock files are clean — no proxy URLs found.");
  process.exit(0);
}

if (dirty === 0) console.log("All bun.lock files are already clean — no proxy URLs found.");
