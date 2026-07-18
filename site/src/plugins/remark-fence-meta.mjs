/**
 * remark-fence-meta — attach filename + language metadata to fenced code nodes
 * so the rehype pipeline and the <Pre> MDX override can render console chrome.
 *
 * Runs AFTER remark-code-snippets (which may set `title="…"` in meta) and
 * BEFORE rehype Shiki highlighting. Does NOT convert fences to JSX — highlighting
 * stays build-time via @shikijs/rehype.
 */
import { visit } from "unist-util-visit";

const TITLE_RE = /\btitle="([^"]*)"/;

export default function remarkFenceMeta() {
  return (tree) => {
    visit(tree, "code", (node) => {
      const meta = node.meta ?? "";
      const titleM = meta.match(TITLE_RE);
      const filename = titleM?.[1] ?? "";
      const lang = node.lang ?? "text";

      node.data = node.data ?? {};
      node.data.hProperties = {
        ...node.data.hProperties,
        "data-filename": filename,
        "data-lang": lang,
      };
    });
  };
}
