/**
 * The route scheme the docs sites share: `/` for the home page,
 * `/<bucket>/<slug>` for a page of `project`, `/reference/api/<slug>` for a REST
 * API reference, and `/reference/api` for the API section (which shows the
 * default API). Anything else, including another project's page, has no route.
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
