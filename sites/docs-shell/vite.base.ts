import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ShikiTransformer } from "shiki";
import type { UserConfig } from "vite";

// Shiki rebuilds <pre>, dropping upstream data-*; remark-fence-meta stashes the
// fence meta so this transformer can restore the attributes <Pre> reads.
const TITLE_RE = /\btitle="([^"]*)"/;
const COLLAPSE_RE = /(?:^|\s)collapse(?=\s|$)/;
const SCRIPT_RE = /\bscript="([^"]*)"/;
const codeChromeTransformer: ShikiTransformer = {
  name: "docs-shell:code-chrome",
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

/**
 * The Vite config every docs site shares. `root` is the site directory: it holds
 * the emitted src/{content,generated,vendor}/ and src/brand/, and reaches this
 * shell through its `shell` symlink.
 */
export async function docsSiteConfig({
  root,
  port,
}: {
  root: string;
  port: number;
}): Promise<UserConfig> {
  // src/vendor/plugins/ is written by the emitter: verbatim copies of the factory
  // preview's remark plugins, so content renders exactly as it does there.
  const vendor = path.resolve(root, "src/vendor/plugins");
  if (!existsSync(vendor)) {
    throw new Error(
      "src/vendor/plugins is missing: run the docs-factory emitter first (see README).",
    );
  }
  const plugin = async (name: string) => (await import(path.join(vendor, name))).default;

  // Vite bundles this file from its real path (sites/docs-shell/), which has no
  // node_modules, so load the pipeline from the site's own explicitly.
  const requireFromSite = createRequire(path.join(root, "package.json"));
  const dep = async <M>(id: string): Promise<M> =>
    (await import(pathToFileURL(requireFromSite.resolve(id)).href)).default;
  const [
    mdx,
    rehypeShiki,
    react,
    rehypeAutolinkHeadings,
    rehypeSlug,
    remarkDirective,
    remarkFrontmatter,
    remarkGfm,
  ] = await Promise.all([
    dep<typeof import("@mdx-js/rollup").default>("@mdx-js/rollup"),
    dep<typeof import("@shikijs/rehype").default>("@shikijs/rehype"),
    dep<typeof import("@vitejs/plugin-react-swc").default>("@vitejs/plugin-react-swc"),
    dep<typeof import("rehype-autolink-headings").default>("rehype-autolink-headings"),
    dep<typeof import("rehype-slug").default>("rehype-slug"),
    dep<typeof import("remark-directive").default>("remark-directive"),
    dep<typeof import("remark-frontmatter").default>("remark-frontmatter"),
    dep<typeof import("remark-gfm").default>("remark-gfm"),
  ]);

  const [
    remarkDirectiveProseGuard,
    remarkPrerequisites,
    remarkTldr,
    remarkCallouts,
    remarkTabs,
    remarkJourney,
    remarkFenceMeta,
    remarkLikeC4Views,
  ] = await Promise.all(
    [
      "remark-directive-prose-guard.mjs",
      "remark-prerequisites.mjs",
      "remark-tldr.mjs",
      "remark-callouts.mjs",
      "remark-tabs.mjs",
      "remark-journey.mjs",
      "remark-fence-meta.mjs",
      "remark-likec4-views.mjs",
    ].map(plugin),
  );

  return {
    // Every route is its own prerendered HTML file, so preview should serve them
    // like a static host does rather than falling back to one SPA shell.
    appType: "mpa",
    server: { port, strictPort: true },
    preview: { port, strictPort: true },
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
            remarkPrerequisites,
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
                themes: { light: "github-light", dark: "github-dark-default" },
                transformers: [codeChromeTransformer],
              },
            ],
          ],
        }),
      },
      react(),
    ],
    resolve: {
      // Keep `shell/…` paths as written, so the shell's own imports resolve
      // against the site's node_modules (one React) instead of the symlink target.
      preserveSymlinks: true,
      alias: {
        // The vendored plugins import `@/components/…`, so `@` is the shell.
        "@brand": path.resolve(root, "src/brand"),
        "@": path.resolve(root, "shell/src"),
      },
    },
  };
}
