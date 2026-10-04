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
  // REST API references (emit/docs/api.mjs): the shell renders each spec in the
  // browser from this pinned ref. `summary` feeds llms.txt, page meta, and
  // search; `hint` is the few words the API switcher shows.
  api: {
    repo: "unitycatalog/unitycatalog",
    ref: "v0.6.0",
    default: "catalog",
    specs: [
      {
        slug: "catalog",
        title: "Unity Catalog REST API",
        summary:
          "Catalogs, schemas, tables, volumes, functions, registered models, temporary credentials, and permissions.",
        hint: "Catalogs, tables, volumes, and more",
        file: "api/all.yaml",
      },
      {
        slug: "control",
        title: "Unity Control API",
        summary: "SCIM user management, token exchange, and logout on the Unity Catalog server.",
        hint: "Users and tokens",
        file: "api/control.yaml",
      },
      {
        slug: "delta",
        title: "UC Delta API",
        summary:
          "The Delta-native REST catalog for Delta clients: configuration, tables and commits, and temporary credentials.",
        hint: "Delta-native REST catalog",
        file: "api/delta.yaml",
      },
      {
        slug: "iceberg",
        title: "Iceberg REST Catalog API",
        summary:
          "The Apache Iceberg REST Catalog spec, which Unity Catalog implements at /api/2.1/unity-catalog/iceberg.",
        hint: "Iceberg REST catalog",
        // UC 0.6.0 builds against Iceberg 1.11.0 (build.sbt `icebergVersion`).
        repo: "apache/iceberg",
        ref: "apache-iceberg-1.11.0",
        file: "open-api/rest-catalog-open-api.yaml",
        // The spec's own servers are a generic https://localhost/{basePath}.
        serverUrl: "http://localhost:8080/api/2.1/unity-catalog/iceberg",
      },
    ],
  },
  /**
   * identity → route: `/` for the home page, `/<bucket>/<slug>` for a page,
   * `/reference/api/<slug>` for a REST API reference, `/reference/api` for
   * the API section (which shows the default API).
   */
  hrefFor(identity) {
    if (identity?.area === "site") return "/";
    if (identity?.area === "api")
      return identity.slug ? `/reference/api/${identity.slug}` : "/reference/api";
    if (identity?.area !== "docs" || identity.project !== PROJECT) return null;
    const { bucket, slug } = identity;
    return bucket && slug ? `/${bucket}/${slug}` : null;
  },
};
