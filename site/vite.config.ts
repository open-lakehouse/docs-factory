import { createReadStream, readdirSync, statSync } from "node:fs";
import path from "node:path";
import mdx from "@mdx-js/rollup";
import rehypeShiki from "@shikijs/rehype";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { LikeC4VitePlugin } from "likec4/vite-plugin";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import type { ShikiTransformer } from "shiki";
import { defineConfig, type Plugin } from "vite";
import { docIdentity, hrefFromIdentity } from "./src/content-core/identity.mjs";
import remarkCallouts from "./src/plugins/remark-callouts.mjs";
import remarkCodeSnippets from "./src/plugins/remark-code-snippets.mjs";
import remarkDirectiveProseGuard from "./src/plugins/remark-directive-prose-guard.mjs";
import remarkFenceMeta from "./src/plugins/remark-fence-meta.mjs";
import remarkJourney from "./src/plugins/remark-journey.mjs";
import remarkLikeC4Views from "./src/plugins/remark-likec4-views.mjs";
import remarkModelLinks from "./src/plugins/remark-model-links.mjs";
import remarkResolveImages from "./src/plugins/remark-resolve-images.mjs";
import remarkSourceLinks from "./src/plugins/remark-source-links.mjs";
import remarkTldr from "./src/plugins/remark-tldr.mjs";

// Shiki rebuilds the <pre>/<code> subtree, so any data-* set upstream is lost.
// remark-fence-meta preserves the fence meta as <code metastring="…">, which
// Shiki re-exposes here as this.options.meta.__raw. Turn it into the chrome
// attributes the <Pre> MDX override reads: data-filename (from title="…") and
// data-lang (the resolved language), applied to Shiki's OUTPUT <pre>.
const TITLE_RE = /\btitle="([^"]*)"/;
const SRCPATH_RE = /\bsrcpath="([^"]*)"/;
const SRCREGION_RE = /\bsrcregion="([^"]*)"/;
const SRCSTART_RE = /\bsrcstart="([^"]*)"/;
// A bare `collapse` flag in the fence meta (```py title="x" collapse) makes the
// box render collapsed behind a click-to-expand header. Word-boundary matched so
// it doesn't fire on substrings like `title="collapse.py"`.
const COLLAPSE_RE = /(?:^|\s)collapse(?=\s|$)/;
const codeChromeTransformer: ShikiTransformer = {
  name: "docs-factory:code-chrome",
  pre(node) {
    const raw = (this.options.meta?.__raw as string | undefined) ?? "";
    const title = TITLE_RE.exec(raw)?.[1];
    if (title) node.properties["data-filename"] = title;
    if (this.options.lang) node.properties["data-lang"] = this.options.lang;
    if (COLLAPSE_RE.test(raw)) node.properties["data-collapse"] = "true";
    // Source anchoring for review: the repo-relative path, region, and the
    // 1-based source line the inlined snippet starts at (remark-code-snippets
    // emits these). The <Pre> override reads them to anchor code comments.
    const srcPath = SRCPATH_RE.exec(raw)?.[1];
    if (srcPath) node.properties["data-src-path"] = srcPath;
    const srcRegion = SRCREGION_RE.exec(raw)?.[1];
    if (srcRegion) node.properties["data-src-region"] = srcRegion;
    const srcStart = SRCSTART_RE.exec(raw)?.[1];
    if (srcStart) node.properties["data-src-start"] = srcStart;
  },
};

// The set of in-app hrefs the site actually serves, for remark-source-links to
// validate a resolved source-relative link against. Built from PATHS ONLY (no
// MDX import, no frontmatter) so it stays a cheap, cycle-free copy of what
// content.ts discovers: `blogs/<slug>/index.md` and
// `content/{delta,unitycatalog,open-lakehouse}/**/*.{md,mdx}`, minus README.md.
// content.ts remains the runtime authority; this is a build-time mirror keyed on
// the same docIdentity → hrefFromIdentity mapping. (A page's `slug:` frontmatter
// override is invisible here — see remark-source-links.mjs KNOWN LIMITATION.)
function collectFiles(dir: string, match: (p: string) => boolean): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // missing dir (e.g. an empty project) → contributes nothing
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, match));
    else if (entry.isFile() && match(full)) out.push(full);
  }
  return out;
}

function buildKnownHrefs(): Set<string> {
  const repoRoot = path.resolve(__dirname, "..");
  const hrefs = new Set<string>();

  const blogRoot = path.join(repoRoot, "blogs");
  for (const p of collectFiles(blogRoot, (f) => f.endsWith("/index.md"))) {
    const href = hrefFromIdentity(docIdentity(p));
    if (href) hrefs.add(href);
  }

  for (const project of ["delta", "unitycatalog", "open-lakehouse"]) {
    const root = path.join(repoRoot, "content", project);
    for (const p of collectFiles(
      root,
      (f) => (f.endsWith(".md") || f.endsWith(".mdx")) && !f.endsWith("/README.md"),
    )) {
      const href = hrefFromIdentity(docIdentity(p));
      if (href) hrefs.add(href);
    }
  }
  return hrefs;
}

const knownHrefs = buildKnownHrefs();

// Dev-only static serving for build-emitted companion files. `.md` twins,
// served `.py` scripts, and scripts.json are written to dist/ by build:artifacts
// (never to public/), so `vite dev` would 404 them and the review workspace's
// Markdown/script tabs couldn't load. In production Vercel serves these from the
// prebuilt dist/ directly (with the same content-types); this middleware mirrors
// that for local dev. It only fires for those extensions and falls through to
// Vite's normal SPA handling for everything else.
function devCompanionFiles(): Plugin {
  const distDir = path.resolve(__dirname, "dist");
  const TYPES: Record<string, string> = {
    ".md": "text/markdown; charset=utf-8",
    ".py": "text/x-python; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };
  return {
    name: "docs-factory:dev-companion-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const isCompanion = url.endsWith(".md") || url.endsWith(".py") || url === "/scripts.json";
        if (!isCompanion) return next();

        // Resolve within dist/ and guard against path traversal escaping it.
        const rel = decodeURIComponent(url.replace(/^\//, ""));
        const abs = path.resolve(distDir, rel);
        if (abs !== distDir && !abs.startsWith(distDir + path.sep)) return next();
        try {
          if (!statSync(abs).isFile()) return next();
        } catch {
          return next(); // not built yet → let the SPA/404 handling take over
        }
        res.setHeader("Content-Type", TYPES[path.extname(abs)] ?? "application/octet-stream");
        res.setHeader("X-Robots-Tag", "noindex");
        createReadStream(abs).pipe(res);
      });
    },
  };
}

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
    devCompanionFiles(),
    {
      enforce: "pre",
      ...mdx({
        include: ["**/*.md", "**/*.mdx"],
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [
          remarkGfm,
          remarkDirective,
          remarkDirectiveProseGuard,
          // Resolve source-relative cross-document links (./other.md, ../a/b.md)
          // to in-app routes. Runs BEFORE remarkModelLinks so `model:` links are
          // left for that plugin.
          [remarkSourceLinks, { knownHrefs }],
          remarkModelLinks,
          remarkFrontmatter,
          [remarkMdxFrontmatter, { name: "frontmatter" }],
          remarkCodeSnippets,
          remarkTldr,
          remarkCallouts,
          remarkJourney,
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
                light: "github-light",
                dark: "github-dark-dimmed",
              },
              transformers: [codeChromeTransformer],
            },
          ],
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
