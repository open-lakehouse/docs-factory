/**
 * The static Unity Catalog docs site (sites/unitycatalog-docs/). This file is
 * the only place its URLs are defined: every route, canonical, twin, sitemap
 * entry, and rewritten link goes through `hrefFor`.
 */
const PROJECT = "unitycatalog";

export default {
  name: "unitycatalog-docs",
  project: PROJECT,
  title: "Unity Catalog",
  tagline:
    "Documentation for Unity Catalog OSS: the open catalog for tables, volumes, functions, and models across engines.",
  // Placeholder until the site has a home; canonical URLs and the sitemap use it.
  origin: (process.env.UC_DOCS_ORIGIN || "https://docs.unitycatalog.io").replace(/\/+$/, ""),
  /** identity → route: `/` for the home page, `/<bucket>/<slug>` for a page. */
  hrefFor(identity) {
    if (identity?.area === "site") return "/";
    if (identity?.area !== "docs" || identity.project !== PROJECT) return null;
    const { bucket, slug } = identity;
    return bucket && slug ? `/${bucket}/${slug}` : null;
  },
};
