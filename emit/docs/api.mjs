/**
 * The REST API references a site declares (`site.api`): one route per OpenAPI
 * spec, which the browser renders from the spec's raw GitHub URL. The emitter
 * reads the same spec from its vendored copy (api-specs.mjs) for the static
 * operation list and `.md` twin. Pure.
 */

/**
 * A spec may override the block's `repo`/`ref` (an upstream spec such as
 * Iceberg's) and set `serverUrl` when its own `servers` don't point at UC.
 * Exactly one entry is `default`: the block's `default` slug, else the first.
 * `hint` falls back to `summary`.
 *
 * @param {{ api?: { repo: string, ref: string, default?: string, specs: object[] },
 *           hrefFor: (identity: object) => string | null }} site
 * @returns {{ route: string, slug: string, title: string, summary: string,
 *             hint: string, ref: string, specUrl: string, sourceUrl: string,
 *             serverUrl: string | null, default: boolean }[]}
 */
export function apiEntries(site) {
  if (!site.api) return [];
  const { specs } = site.api;
  const defaultSlug = site.api.default ?? specs[0]?.slug;
  if (!specs.some((s) => s.slug === defaultSlug)) {
    throw new Error(`site ${site.name}: default API "${defaultSlug}" is not declared`);
  }
  return specs.map((spec) => {
    const { slug, title, summary, file } = spec;
    const repo = spec.repo ?? site.api.repo;
    const ref = spec.ref ?? site.api.ref;
    const route = site.hrefFor({ area: "api", slug });
    if (!route) throw new Error(`site ${site.name}: no route for API "${slug}"`);
    return {
      route,
      slug,
      title,
      summary,
      hint: spec.hint ?? summary,
      ref,
      // raw.githubusercontent.com serves `access-control-allow-origin: *`, so
      // the browser can fetch it directly.
      specUrl: `https://raw.githubusercontent.com/${repo}/${ref}/${file}`,
      sourceUrl: `https://github.com/${repo}/blob/${ref}/${file}`,
      serverUrl: spec.serverUrl ?? null,
      default: slug === defaultSlug,
    };
  });
}

/** The API section's own route (it shows the default API), or null. */
export function apiIndexRoute(site) {
  return site.api ? site.hrefFor({ area: "api" }) : null;
}

/**
 * Where each declared spec is vendored, relative to emit/docs/: keyed by repo
 * and ref, so a pin that moves without `just api-specs` has no file to read.
 */
export function vendoredSpecs(site) {
  return (site.api?.specs ?? []).map((spec) => {
    const repo = spec.repo ?? site.api.repo;
    const ref = spec.ref ?? site.api.ref;
    return {
      slug: spec.slug,
      path: `specs/${repo}/${ref}/${spec.file}`,
      url: `https://raw.githubusercontent.com/${repo}/${ref}/${spec.file}`,
    };
  });
}
