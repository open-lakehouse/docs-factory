/** Every docs site `just emit-docs` can target, one per project. */
import delta from "./delta-docs.mjs";
import unitycatalog from "./unitycatalog-docs.mjs";

export const DOCS_SITES = [unitycatalog, delta];
