/**
 * The Unity Catalog docs, served at unitycatalog.io/docs by the uc-website app
 * (open-lakehouse/uc-website). The emitter writes only content and data into
 * the directories in `paths`; uc-website owns the pages that render them. This
 * file is the only place their URLs are defined: every route, canonical, twin,
 * sitemap entry, and rewritten link goes through `hrefFor` (routes.mjs).
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoutes } from "./routes.mjs";

const PROJECT = "unitycatalog";
const BASE = "/docs";

/**
 * The uc-website checkout to emit into: `UC_WEBSITE_DIR`, else `uc-website`
 * beside the main docs-factory checkout. Resolved through git's common dir so a
 * worktree finds the same sibling as the main checkout.
 */
function outDir() {
  if (process.env.UC_WEBSITE_DIR) return resolve(process.env.UC_WEBSITE_DIR);
  const here = dirname(fileURLToPath(import.meta.url));
  let common;
  try {
    common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: here,
      encoding: "utf8",
    }).trim();
  } catch {
    common = resolve(here, "../../../.git");
  }
  return resolve(dirname(common), "..", "uc-website");
}

export default {
  name: "unitycatalog-docs",
  project: PROJECT,
  title: "Unity Catalog",
  tagline:
    "Documentation for Unity Catalog OSS: the open catalog for tables, volumes, functions, and models across engines.",
  // The host site. Canonical URLs, the sitemap, and blog links to its pages use
  // it with BASE; files the reader downloads live under `${origin}${BASE}` too.
  origin: (process.env.UC_DOCS_ORIGIN || "https://unitycatalog.io").replace(/\/+$/, ""),
  base: BASE,
  trailingSlash: true,
  outDir,
  // Where each output goes in uc-website. The sync never writes or deletes
  // anything outside `owned`, so uc-website's own files are safe.
  paths: {
    content: "src/content/docs/",
    generated: "src/generated/docs/",
    vendor: "src/vendor/docs-plugins/",
    // uc-website folds these into its site-wide ⌘K index at build time.
    searchIndex: "src/generated/docs/search.json",
  },
  owned: ["src/content/docs/", "src/generated/docs/", "src/vendor/docs-plugins/", "public/docs/"],
  manifest: "src/generated/docs/.docs-emit.json",
  // uc-website serves its own robots.txt and lists public/docs/sitemap.xml in
  // its sitemap index.
  robots: false,
  // Legacy URLs (docs.unitycatalog.io paths, under BASE) → their pages. The host
  // redirects docs.unitycatalog.io/* to unitycatalog.io/docs/*; these finish the
  // job for pages that moved. Emitted to `${paths.generated}redirects.json`.
  redirects: "emit/docs/sites/unitycatalog-redirects.json",
  // The envs/ folders a reader downloads, each as <base>/env/<dir>.tar.gz
  // extracting into <bundle>/<dir>/, and the page that explains them.
  env: {
    bundle: "uc-docs-env",
    dirs: ["unitycatalog", "uc-aws", "uc-local", "uc-hybrid"],
    guide: { bucket: "how-to", slug: "run-local-server" },
  },
  // REST API references (emit/docs/api.mjs): uc-website renders each spec in the
  // browser from this pinned ref. `summary` feeds llms.txt, page meta, and
  // search; `hint` is the few words the API switcher shows.
  api: {
    repo: "unitycatalog/unitycatalog",
    ref: "v0.7.0",
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
        // The `iceberg` pin in release.yml: build.sbt `icebergVersion` at the release tag.
        repo: "apache/iceberg",
        ref: "apache-iceberg-1.11.0",
        file: "open-api/rest-catalog-open-api.yaml",
        // The spec's own servers are a generic https://localhost/{basePath}.
        serverUrl: "http://localhost:8080/api/2.1/unity-catalog/iceberg",
      },
    ],
  },
  hrefFor: projectRoutes(PROJECT, { base: BASE, apiPath: "/api", trailingSlash: true }),
};
