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
import remarkResolveImages from "./src/plugins/remark-resolve-images.mjs";
import remarkLikeC4Views from "./src/plugins/remark-likec4-views.mjs";
import remarkCodeSnippets from "./src/plugins/remark-code-snippets.mjs";
import remarkJourney from "./src/plugins/remark-journey.mjs";
import remarkDirectiveProseGuard from "./src/plugins/remark-directive-prose-guard.mjs";
import remarkCallouts from "./src/plugins/remark-callouts.mjs";
import remarkCodeBlock from "./src/plugins/remark-code-block.mjs";
import remarkTabs from "./src/plugins/remark-tabs.mjs";

// Throwaway local preview of docs-factory content. Vite + React + @mdx-js/rollup
// reads ../content (Diátaxis docs) and ../blogs (narrative drafts) in place;
// this harness never edits them.
export default defineConfig({
  server: {
    host: "::",
    // 4321 (the estate's Astro-preview convention), deliberately NOT 8080 —
    // that collides with the local Unity Catalog server the UC Delta post's
    // compose snippet runs, and this harness previews exactly that post.
    // strictPort so a conflict fails loudly instead of silently drifting.
    port: 4321,
    strictPort: true,
    fs: {
      // Content, blogs, examples, and assets live outside site/. Allow the repo root.
      allow: [path.resolve(__dirname, "..")],
    },
  },
  plugins: [
    // MDX runs `pre`, before the React plugin, and is configured to process
    // plain .md too (drafts are Markdown, not MDX) so the same pipeline handles
    // both. remarkLikeC4Views must see the image node before it becomes HTML.
    {
      enforce: "pre",
      ...mdx({
        include: ["**/*.md", "**/*.mdx"],
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [
          remarkGfm,
          remarkDirective, // parse `:::journey`, `:::tip`, … container directives
          remarkDirectiveProseGuard, // undo false-positive `:x` text directives in prose (e.g. **1:1**, port maps)
          remarkFrontmatter,
          [remarkMdxFrontmatter, { name: "frontmatter" }],
          remarkCodeSnippets, // resolve file=/start=/end= (descends into directives)
          remarkCallouts, // `:::tip`/`:::warning`/… -> <Callout> (before journey wraps them)
          remarkJourney, // split a `::::journey` into heading-delimited <JourneyStep>s
          remarkTabs, // `::::tabs` / `:::tab` -> <Tabs>/<Tab>
          remarkCodeBlock, // turn every ```fence into <CodeBlock/> (client-side Shiki)
          remarkResolveImages,
          remarkLikeC4Views,
        ],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "wrap" }],
          // Code highlighting is now CLIENT-side (Shiki via the Kibo <CodeBlock>,
          // see src/components/code-block.tsx + remark-code-block) so multi-file
          // tabs work; there is no build-time highlighter here anymore.
        ],
      }),
    },
    react(),
    tailwindcss(),
    // Serve the estate architecture model as virtual modules (likec4:react,
    // likec4:single-project, …). This replaces a second `codegen react` pass:
    // one bundled likec4/react instance backs both <ReactLikeC4> and the
    // custom-node primitives, so there is no dual-context mismatch. Blog
    // diagrams keep using their own generated module (src/likec4.generated.jsx).
    LikeC4VitePlugin({
      workspace: path.resolve(__dirname, "../architecture/model"),
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Drafts live *outside* this project root, so the bare specifiers the MDX
      // output emits (the JSX runtime, the MDX provider) can't resolve against
      // this project's node_modules from the draft's location. Alias them to
      // absolute paths so they resolve regardless of the importer.
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "node_modules/react/jsx-dev-runtime.js"),
      "@mdx-js/react": path.resolve(__dirname, "node_modules/@mdx-js/react/index.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "@mdx-js/react"],
  },
});
