/**
 * The static Delta Lake docs site (sites/delta-docs/). Like the UC site, every
 * URL goes through `hrefFor` (routes.mjs). There is no `env`: Delta's scripts
 * run against local files, and each page's own :::prerequisites says what it
 * needs. There is no `api` either, since Delta Lake has no REST API.
 */
import { projectRoutes } from "./routes.mjs";

const PROJECT = "delta";

export default {
  name: "delta-docs",
  project: PROJECT,
  title: "Delta Lake",
  tagline:
    "Documentation for Delta Lake: ACID tables on object storage, read and written from Spark, Python, DuckDB, and more.",
  // Placeholder until the site has a home; canonical URLs and the sitemap use it.
  origin: (process.env.DELTA_DOCS_ORIGIN || "https://docs.delta.io").replace(/\/+$/, ""),
  hrefFor: projectRoutes(PROJECT),
};
