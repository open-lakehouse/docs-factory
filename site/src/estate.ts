// The resolved journey catalog `docsnip compat --fix` writes to
// architecture/dist/journeys.json, bundled like compatibility.json so the bare
// Vercel build needs no uv. The joins live in lib/estate-graph.ts.
import catalogJson from "../../architecture/dist/journeys.json";
import type { EstateCatalog } from "./lib/estate-graph";

export const catalog = catalogJson as unknown as EstateCatalog;
