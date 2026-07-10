import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

/**
 * The docs collection is loaded straight from ../content — the authoritative,
 * builder-agnostic source. Nothing is copied; this is a read-only lens.
 *
 * Starlight's own `docsLoader` hardcodes its base to `site/src/content/docs/`,
 * so we use Astro's `glob` loader directly with `base: "../content"` to read
 * the external content dir, while still using Starlight's `docsSchema` so the
 * pages render as Starlight docs.
 *
 * `content/` carries a neutral, SSG-independent frontmatter vocabulary
 * (diataxis / project / engines / …). We extend Starlight's schema so those
 * fields validate here without the content files ever needing Starlight-specific
 * frontmatter. Everything stays optional: the content repo owns the contract,
 * this preview merely tolerates it.
 */
const neutralFrontmatter = z.object({
  summary: z.string().optional(),
  diataxis: z
    .enum(["tutorial", "how-to", "reference", "explanation"])
    .optional(),
  project: z.enum(["delta", "unitycatalog"]).optional(),
  engines: z
    .array(z.enum(["python", "polars", "duckdb", "rust", "spark"]))
    .optional(),
  delta_features: z.array(z.string()).optional(),
  status: z.enum(["draft", "published"]).optional(),
  prerequisites: z
    .object({
      packages: z.record(z.string(), z.array(z.string())).optional(),
      datasets: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
  snippets: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const collections = {
  docs: defineCollection({
    loader: glob({
      // Resolved relative to the project root (site/), reaching the repo's
      // content dir. Skip READMEs and _meta.yaml (handled by the sidebar).
      base: "../content",
      pattern: ["**/*.{md,mdx}", "!**/README.md"],
    }),
    schema: docsSchema({ extend: neutralFrontmatter }),
  }),
};
