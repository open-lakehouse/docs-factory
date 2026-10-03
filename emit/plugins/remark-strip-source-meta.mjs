/**
 * remark-strip-source-meta — drop the `srcpath=` / `srcstart=` / `srcregion=`
 * keys remark-code-snippets adds to an inlined fence. They anchor review
 * comments to factory source files; in an emitted page they are repo paths the
 * target can't resolve. `title=` and every other key stay.
 */
const SOURCE_META_RE = /\s*\bsrc(?:path|start|region)="[^"]*"/g;

export default function remarkStripSourceMeta() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === "code" && typeof node.meta === "string") {
        node.meta = node.meta.replace(SOURCE_META_RE, "").trim() || null;
      }
      if (node.children) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}
