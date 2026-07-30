// 308 redirect routes for renamed pages (Phase 1g of the agentic-docs plan).
//
// Source of truth is the committed site/redirects.json map: `{ "/old/path":
// "/new/path" }`. frontmatter `slug:` already preserves identity across a rename;
// this map covers the case where the ROUTE itself changed (a moved/renamed page)
// and old links/bookmarks must keep resolving. gen-vercel-config.mjs imports
// redirectRoutes() and splices the result into config.json (between the /api proxy
// and the filesystem handler, so a 308 beats the SPA catch-all).
//
// Each `dest` is validated against the set of known canonical routes at build time
// so a typo fails the build rather than shipping a redirect to a 404.
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitFrontmatter, isPublic } from "../src/content-core/frontmatter.mjs";
import { docIdentity, hrefFromIdentity } from "../src/content-core/identity.mjs";
import { walkBlogs, walkContent } from "../src/content-core/walk.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const repoRoot = resolve(siteRoot, "..");
const mapPath = resolve(siteRoot, "redirects.json");

/** The set of known canonical routes (public pages' hrefs + the index routes). */
export function knownRoutes(contentRoot = resolve(repoRoot, "content"), blogsRoot = resolve(repoRoot, "blogs")) {
  const routes = new Set(["/", "/docs", "/blog"]);
  for (const absPath of [...walkContent(contentRoot), ...walkBlogs(blogsRoot)]) {
    const { meta } = splitFrontmatter(readFileSync(absPath, "utf8"));
    if (!isPublic(meta)) continue;
    const href = hrefFromIdentity(docIdentity(absPath, meta));
    if (href) routes.add(href);
  }
  return routes;
}

/**
 * Build the 308 redirect routes (pure, for testing) from a `{ src: dest }` map.
 * Validates each `dest` is in `routes` (else throws — a typo shouldn't ship). Each
 * result is a Build Output API route `{ src, dest, status: 308 }`.
 */
export function redirectRoutes(map = {}, routes = new Set()) {
  const out = [];
  for (const [src, dest] of Object.entries(map)) {
    if (!src.startsWith("/") || !dest.startsWith("/")) {
      throw new Error(`build-redirects: src and dest must be absolute paths: ${src} → ${dest}`);
    }
    if (!routes.has(dest)) {
      throw new Error(`build-redirects: redirect dest is not a known route: ${dest} (from ${src})`);
    }
    out.push({ src, dest, status: 308 });
  }
  return out;
}

/** Read the committed redirect map, or {} if none exists yet. */
export function loadRedirectMap() {
  if (!existsSync(mapPath)) return {};
  try {
    return JSON.parse(readFileSync(mapPath, "utf8"));
  } catch (err) {
    throw new Error(`build-redirects: ${relative(repoRoot, mapPath)} is not valid JSON: ${err.message}`);
  }
}

/** The redirect routes for the current repo (map ⨯ known routes). */
export function buildRedirectRoutes() {
  return redirectRoutes(loadRedirectMap(), knownRoutes());
}
