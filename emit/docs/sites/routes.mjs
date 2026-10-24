/**
 * The route scheme the docs sites share: `/` for the home page,
 * `/<bucket>/<slug>` for a page of `project`, `/reference/api/<slug>` for a REST
 * API reference, and `/reference/api` for the API section (which shows the
 * default API). Anything else, including another project's page, has no route
 * unless the site cross-publishes it (`withGuests`).
 *
 * @param {string} project
 * @returns {(identity: object | null | undefined) => string | null}
 */
export function projectRoutes(project) {
  return (identity) => {
    if (identity?.area === "site") return "/";
    if (identity?.area === "api")
      return identity.slug ? `/reference/api/${identity.slug}` : "/reference/api";
    if (identity?.area !== "docs" || identity.project !== project) return null;
    const { bucket, slug } = identity;
    return bucket && slug ? `/${bucket}/${slug}` : null;
  };
}

/**
 * A site's routes plus the other projects' pages its nav.yml cross-publishes,
 * each at `/<project>/<bucket>/<slug>` so it can't collide with the site's own.
 *
 * @param {(identity: object | null | undefined) => string | null} hrefFor
 * @param {Set<string>} guests  `<project>/<bucket>/<slug>` keys
 */
export function withGuests(hrefFor, guests) {
  return (identity) => {
    if (identity?.area === "docs" && guests.has(guestKey(identity))) {
      return `/${identity.project}/${identity.bucket}/${identity.slug}`;
    }
    return hrefFor(identity);
  };
}

/** @param {{ project: string, bucket: string, slug: string }} identity */
export function guestKey({ project, bucket, slug }) {
  return `${project}/${bucket}/${slug}`;
}
