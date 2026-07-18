import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { LikeC4VitePlugin } from "likec4/vite-plugin";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeShiki from "@shikijs/rehype";
import remarkResolveImages from "./src/plugins/remark-resolve-images.mjs";
import remarkLikeC4Views from "./src/plugins/remark-likec4-views.mjs";
import remarkCodeSnippets from "./src/plugins/remark-code-snippets.mjs";
import remarkJourney from "./src/plugins/remark-journey.mjs";
import remarkDirectiveProseGuard from "./src/plugins/remark-directive-prose-guard.mjs";
import remarkCallouts from "./src/plugins/remark-callouts.mjs";
import remarkFenceMeta from "./src/plugins/remark-fence-meta.mjs";
import remarkTabs from "./src/plugins/remark-tabs.mjs";
import remarkModelLinks from "./src/plugins/remark-model-links.mjs";
import rehypePreMeta from "./src/plugins/rehype-pre-meta.mjs";

export default defineConfig({
  server: {
    host: "::",
    port: 4321,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        include: ["**/*.md", "**/*.mdx"],
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [
          remarkGfm,
          remarkDirective,
          remarkDirectiveProseGuard,
          remarkModelLinks,
          remarkFrontmatter,
          [remarkMdxFrontmatter, { name: "frontmatter" }],
          remarkCodeSnippets,
          remarkCallouts,
          remarkJourney,
          remarkTabs,
          remarkFenceMeta,
          remarkResolveImages,
          remarkLikeC4Views,
        ],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "wrap" }],
          [
            rehypeShiki,
            {
              themes: {
                light: "github-dark-dimmed",
                dark: "github-dark-dimmed",
              },
            },
          ],
          rehypePreMeta,
        ],
      }),
    },
    react(),
    tailwindcss(),
    // Single LikeC4 runtime for the site. Blog-specific diagrams live as
    // dedicated views in ../architecture/model/views/blog-views.likec4 so markdown
    // `likec4=<viewId>` embeds and /explain share the same virtual modules.
    LikeC4VitePlugin({
      workspace: path.resolve(__dirname, "../architecture/model"),
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "node_modules/react/jsx-dev-runtime.js"),
      "@mdx-js/react": path.resolve(__dirname, "node_modules/@mdx-js/react/index.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // Pre-bundle React AND the LikeC4 diagram stack up front. LikeC4's React
    // components reach the app through virtual modules (likec4:react, likec4:*)
    // whose sibling internals (likec4/vite-plugin/internal, @likec4/core) are
    // discovered late. If Vite re-optimizes them mid-session it prints
    // "optimized dependencies changed. reloading" and, in the transient window,
    // <LikeC4ModelProvider> renders against a half-invalidated React ("Invalid
    // hook call"). Pre-including them here makes the first load complete and
    // keeps one React across the whole stack. Pre-bundling also applies the
    // CJS->ESM interop that zustand's use-sync-external-store shim needs.
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@mdx-js/react",
      "likec4/react",
      "likec4/vite-plugin/internal",
      "@likec4/core/model",
      "@likec4/diagram",
    ],
  },
});
