import { existsSync } from "node:fs";
import path from "node:path";
import mdx from "@mdx-js/rollup";
import rehypeShiki from "@shikijs/rehype";
import react from "@vitejs/plugin-react-swc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import type { ShikiTransformer } from "shiki";
import { defineConfig } from "vite";

// src/vendor/plugins/ is written by the emitter: verbatim copies of the factory
// preview's remark plugins, so content renders exactly as it does there.
const vendor = path.resolve(import.meta.dirname, "src/vendor/plugins");
if (!existsSync(vendor)) {
  throw new Error(
    "src/vendor/plugins is missing: run the docs-factory emitter first (see README).",
  );
}
const plugin = async (name: string) => (await import(path.join(vendor, name))).default;

const [
  remarkDirectiveProseGuard,
  remarkTldr,
  remarkCallouts,
  remarkTabs,
  remarkJourney,
  remarkFenceMeta,
  remarkLikeC4Views,
] = await Promise.all(
  [
    "remark-directive-prose-guard.mjs",
    "remark-tldr.mjs",
    "remark-callouts.mjs",
    "remark-tabs.mjs",
    "remark-journey.mjs",
    "remark-fence-meta.mjs",
    "remark-likec4-views.mjs",
  ].map(plugin),
);

// Shiki rebuilds <pre>, dropping upstream data-*; remark-fence-meta stashes the
// fence meta so this transformer can restore the attributes <Pre> reads.
const TITLE_RE = /\btitle="([^"]*)"/;
const COLLAPSE_RE = /(?:^|\s)collapse(?=\s|$)/;
const SCRIPT_RE = /\bscript="([^"]*)"/;
const codeChromeTransformer: ShikiTransformer = {
  name: "unitycatalog-docs:code-chrome",
  pre(node) {
    const raw = (this.options.meta?.__raw as string | undefined) ?? "";
    const title = TITLE_RE.exec(raw)?.[1];
    if (title) node.properties["data-filename"] = title;
    if (this.options.lang) node.properties["data-lang"] = this.options.lang;
    if (COLLAPSE_RE.test(raw)) node.properties["data-collapse"] = "true";
    const script = SCRIPT_RE.exec(raw)?.[1];
    if (script) node.properties["data-script"] = script;
  },
};

export default defineConfig({
  // Every route is its own prerendered HTML file, so preview should serve them
  // like a static host does rather than falling back to one SPA shell.
  appType: "mpa",
  server: { port: 4322, strictPort: true },
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        include: ["**/*.md"],
        providerImportSource: "@mdx-js/react",
        // Order mirrors the factory preview (site/vite.config.ts).
        remarkPlugins: [
          remarkGfm,
          remarkDirective,
          remarkDirectiveProseGuard,
          remarkFrontmatter,
          remarkTldr,
          remarkCallouts,
          remarkTabs,
          remarkJourney,
          remarkFenceMeta,
          remarkLikeC4Views,
        ],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "wrap" }],
          [
            rehypeShiki,
            {
              themes: { light: "github-light", dark: "github-dark-dimmed" },
              transformers: [codeChromeTransformer],
            },
          ],
        ],
      }),
    },
    react(),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
