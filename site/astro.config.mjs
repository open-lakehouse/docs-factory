// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mdx from "@astrojs/mdx";
import remarkCodeSnippets from "./src/plugins/remark-code-snippets.mjs";
import { buildSidebar } from "./src/sidebar.mjs";

// Local preview of the docs-factory content. The authoritative source is
// ../content (builder-agnostic); everything Astro/Starlight-specific lives here
// in site/ and never leaks into the content files.

// Choose the brand palette from DOCS_THEME (default: delta). The palette file
// is loaded before the structural theme so its --df-*/--sl-color-* tokens are
// in scope. Add a new theme by dropping in src/styles/themes/<name>.css.
const THEMES = { delta: "delta", unitycatalog: "unitycatalog" };
const themeName = THEMES[process.env.DOCS_THEME ?? "delta"] ?? "delta";

export default defineConfig({
  // There is no root index page (content starts at /delta, /unitycatalog), so
  // send / to the Delta overview — the most populated entry point.
  redirects: {
    "/": "/delta/explanation/what-is-delta-lake/",
  },
  // Resolve `file=/start=/end=` snippet fences against ../examples at build
  // time — the same contract docsnip validates in CI.
  markdown: {
    remarkPlugins: [remarkCodeSnippets],
  },
  integrations: [
    starlight({
      title: "docs-factory preview",
      description:
        "Local preview of the delta.io / unitycatalog.io content source.",
      customCss: [`./src/styles/themes/${themeName}.css`, "./src/styles/theme.css"],
      sidebar: buildSidebar(),
      // No edit links / social — this is a throwaway local harness.
      pagefind: true,
    }),
    // MDX so content pages can use Starlight components (e.g. <Tabs>) and still
    // get the snippet-fence resolution from markdown.remarkPlugins above.
    mdx(),
  ],
});
