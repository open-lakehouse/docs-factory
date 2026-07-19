/**
 * remark-fence-meta — carry a fenced code block's meta string through to Shiki
 * so the console chrome (filename header + language tag) survives highlighting.
 *
 * @shikijs/rehype REBUILDS the <pre>/<code> subtree, so any `data-*` we set on
 * those nodes here would be thrown away before the <Pre> MDX override ever sees
 * them. Instead we stash the raw meta (e.g. `title="server.properties"`) as a
 * `metastring` property on <code>: Shiki's PreHandler reads
 * `head.properties.metastring` and re-exposes it to transformers as
 * `this.options.meta.__raw`. The `pre` transformer in vite.config then turns
 * that into `data-filename` / `data-lang` on Shiki's OUTPUT <pre>.
 *
 * Runs AFTER remark-code-snippets (which may set `title="…"` in meta) and BEFORE
 * rehype Shiki highlighting. Does NOT convert fences to JSX — highlighting stays
 * build-time via @shikijs/rehype.
 */
import { visit } from "unist-util-visit";

export default function remarkFenceMeta() {
  return (tree) => {
    visit(tree, "code", (node) => {
      const meta = node.meta ?? "";
      if (!meta) return;
      node.data = node.data ?? {};
      node.data.hProperties = {
        ...node.data.hProperties,
        metastring: meta,
      };
    });
  };
}
