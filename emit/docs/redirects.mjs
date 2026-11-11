/**
 * A site's permanent redirects. A standalone site keeps them in its
 * hand-maintained vercel.json, which the emitter only checks. A site mounted in
 * another app (`site.redirects`) keeps a source map in this repo instead, and
 * the emitter resolves it into the host's redirects.json. Either way a
 * destination must be something this emit serves, so a page that is renamed or
 * drops back to draft can't leave a legacy URL redirecting to a 404.
 */

/**
 * Every redirect in `config` whose destination this emit doesn't serve.
 * `anchors` maps each page route to its heading ids; `files` is the emit's
 * output map, for destinations that are files (`/env/<dir>.tar.gz`).
 */
export function redirectErrors(config, { anchors, files }) {
  const errors = [];
  for (const { source, destination } of config?.redirects ?? []) {
    // External destinations are the reader's problem to keep alive, not the emit's.
    if (/^https?:\/\//.test(destination)) continue;
    const [route, anchor] = destination.split("#");
    const ids = anchors.get(route);
    if (ids) {
      if (anchor && !ids.has(anchor)) {
        errors.push(`${source} → ${destination}: ${route} has no heading #${anchor}`);
      }
    } else if (!files.has(`public${route}`)) {
      errors.push(`${source} → ${destination}: not a route this emit serves`);
    }
  }
  return errors;
}

/**
 * Resolve a source map (`{ redirects: { <old path>: target }, patterns: [{ source,
 * to: target }] }`, old paths relative to the old site root) into the host's
 * redirects.json: exact `redirects` keyed by `<base><old path>`, and regex
 * `patterns` anchored on the same base. A target is `{ page: "<bucket>/<slug>",
 * anchor? }`, `{ api: "<slug>" }`, or `{ file: "<path under base>" }`.
 *
 * @param {{ redirects?: Record<string, object>, patterns?: { source: string, to: object }[] }} map
 * @param {{ base?: string, project: string, hrefFor: (identity: object) => string | null }} site
 * @param {{ anchors: Map<string, Set<string>>, files: Map<string, unknown> }} served
 */
export function resolveRedirects(map, site, served) {
  const base = site.base ?? "";
  const errors = [];
  const target = (from, to) => {
    let href = null;
    if (to.page) {
      const [bucket, slug] = to.page.split("/");
      href = site.hrefFor({ area: "docs", project: site.project, bucket, slug });
    } else if (to.api) {
      href = site.hrefFor({ area: "api", slug: to.api });
    } else if (to.file) {
      href = `${base}${to.file}`;
    }
    if (!href) {
      errors.push(`${from}: ${JSON.stringify(to)} has no route`);
      return null;
    }
    const destination = to.anchor ? `${href}#${to.anchor}` : href;
    errors.push(...redirectErrors({ redirects: [{ source: from, destination }] }, served));
    return destination;
  };
  const redirects = {};
  for (const [from, to] of Object.entries(map.redirects ?? {})) {
    const source = `${base}${from}`.toLowerCase();
    const destination = target(source, to);
    if (destination) redirects[source] = destination;
  }
  const patterns = [];
  for (const { source, to } of map.patterns ?? []) {
    // The map's regexes start at the old root: `^/ai/...` becomes `^/docs/ai/...`.
    const anchored = source.startsWith("^") ? `^${base}${source.slice(1)}` : source;
    const destination = target(anchored, to);
    if (destination) patterns.push({ source: anchored, destination });
  }
  return { redirects, patterns, errors };
}
