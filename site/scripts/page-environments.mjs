// Page → derived prerequisites for the review app, so a reviewer sees the same
// Docker bullet and "Start the environment" commands the docs emitter adds
// (emit/docs/emit-docs.mjs). The commands name the published docs site's env
// bundle: they're what a reader will run, not something the app serves.
//
// Runs once at vite config load. Without a script index (no uv, or docsnip
// fails) boxes render as authored, the same as scripts.json degrades.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import delta from "../../emit/docs/sites/delta-docs.mjs";
import unitycatalog from "../../emit/docs/sites/unitycatalog-docs.mjs";
import { declaredEnvironment, pageEnvironment } from "../src/content-core/environment.mjs";
import { splitFrontmatter } from "../src/content-core/frontmatter.mjs";
import { docIdentity, hrefFromIdentity } from "../src/content-core/identity.mjs";
import { loadRegistry } from "../src/content-core/registry.mjs";
import { walkContent } from "../src/content-core/walk.mjs";
import { runDocsnipScripts, scriptEntry } from "./build-script-index.mjs";

const SITES = [delta, unitycatalog];

/**
 * `(path, source) => { environment, guide } | null` over docsnip's raw script
 * entries. Scripts are keyed by the docs site's routes, so a page's `runUrl`
 * is the published one; the guide link is the in-app route, for the reviewer.
 * `readPage` returns a page's source (the guide's title comes from it).
 */
export function environmentResolver({ entries, registry, sites = SITES, readPage }) {
  const bySite = sites
    .filter((site) => site.env)
    .map((site) => {
      const guideIdentity = {
        area: "docs",
        project: site.project,
        bucket: site.env.guide.bucket,
        slug: site.env.guide.slug,
      };
      const guideSource = readPage(guideIdentity);
      return {
        site,
        scripts: entries.map((e) => scriptEntry(e, { hrefFor: site.hrefFor })),
        bundleUrl: `${site.origin}/env/${site.env.bundle}.tar.gz`,
        guideRoute: hrefFromIdentity(guideIdentity),
        guide: guideSource && {
          href: hrefFromIdentity(guideIdentity),
          title: splitFrontmatter(guideSource).meta.title ?? site.env.guide.slug,
        },
      };
    });

  return (path, source) => {
    const { meta, body } = splitFrontmatter(source);
    const identity = docIdentity(path, meta);
    const entry = bySite.find((s) => s.site.project === identity.project);
    if (!entry) return null;
    const route = entry.site.hrefFor(identity);
    const owned = entry.scripts.filter((s) => s.tutorialRoute === route);
    const environment = pageEnvironment(owned, {
      registry,
      bundle: entry.site.env.bundle,
      bundleUrl: entry.bundleUrl,
      origin: entry.site.origin,
      declared: declaredEnvironment(body),
    });
    if (!environment) return null;
    const guide = entry.guideRoute === hrefFromIdentity(identity) ? null : entry.guide;
    return { environment, guide };
  };
}

/** The resolver for this checkout, or null when the script index can't be built. */
export function loadEnvironmentResolver(repoRoot) {
  let payload = null;
  try {
    payload = runDocsnipScripts(repoRoot);
  } catch (err) {
    // The emitter fails on this; the review app still renders the authored boxes.
    console.warn(
      `page-environments: no script index, so no derived prerequisites (${err.message})`,
    );
  }
  if (!payload) return null;
  return environmentResolver({
    entries: payload.scripts,
    registry: loadRegistry(repoRoot),
    readPage: (identity) => {
      const path = walkContent(join(repoRoot, "content", identity.project)).find(
        (p) => hrefFromIdentity(docIdentity(p)) === hrefFromIdentity(identity),
      );
      return path ? readFileSync(path, "utf8") : null;
    },
  });
}
