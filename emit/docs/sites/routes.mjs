/**
 * The route scheme the docs sites share, under the site's `base` (`""` for a
 * site at its host's root, `"/docs"` for one mounted under another site):
 * `<base>/` for the home page, `<base>/<bucket>/<slug>` for a page of
 * `project`, `<base><apiPath>/<slug>` for a REST API reference, and
 * `<base><apiPath>` for the API section (which shows the default API).
 * Anything else, including another project's page, has no route unless the
 * site cross-publishes it (`withGuests`). With `trailingSlash`, every route but
 * a file ends in `/`, as the host site's canonical URLs do.
 *
 * @param {string} project
 * @param {{ base?: string, apiPath?: string, trailingSlash?: boolean }} [options]
 * @returns {(identity: object | null | undefined) => string | null}
 */
export function projectRoutes(
  project,
  { base = "", apiPath = "/reference/api", trailingSlash = false } = {},
) {
  const route = routeShape({ base, trailingSlash });
  return (identity) => {
    if (identity?.area === "site") return `${base}/`;
    if (identity?.area === "api")
      return route(identity.slug ? `${apiPath}/${identity.slug}` : apiPath);
    if (identity?.area !== "docs" || identity.project !== project) return null;
    const { bucket, slug } = identity;
    return bucket && slug ? route(`/${bucket}/${slug}`) : null;
  };
}

/**
 * A site's routes plus the other projects' pages its nav.yml cross-publishes,
 * each at `<base>/<project>/<bucket>/<slug>` so it can't collide with the
 * site's own.
 *
 * @param {(identity: object | null | undefined) => string | null} hrefFor
 * @param {Set<string>} guests  `<project>/<bucket>/<slug>` keys
 * @param {{ base?: string, trailingSlash?: boolean }} [options]
 */
export function withGuests(hrefFor, guests, { base = "", trailingSlash = false } = {}) {
  const route = routeShape({ base, trailingSlash });
  return (identity) => {
    if (identity?.area === "docs" && guests.has(guestKey(identity))) {
      return route(`/${identity.project}/${identity.bucket}/${identity.slug}`);
    }
    return hrefFor(identity);
  };
}

/** @param {{ project: string, bucket: string, slug: string }} identity */
export function guestKey({ project, bucket, slug }) {
  return `${project}/${bucket}/${slug}`;
}

/** Where a route's `.md` twin is served (content-core `twinOf`). */
export { twinOf as twinPath } from "../../../site/src/content-core/head.mjs";

function routeShape({ base, trailingSlash }) {
  return (path) => `${base}${path}${trailingSlash ? "/" : ""}`;
}
