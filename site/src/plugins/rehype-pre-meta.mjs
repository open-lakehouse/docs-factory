/**
 * rehype-pre-meta — copy data-filename / data-lang from <code> onto the
 * wrapping <pre> so the MDX <Pre> override can render console chrome.
 */
import { visit } from "unist-util-visit";

export default function rehypePreMeta() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "pre") return;
      const code = node.children?.find((c) => c.type === "element" && c.tagName === "code");
      if (!code?.properties) return;
      node.properties = node.properties ?? {};
      for (const key of ["data-filename", "data-lang"]) {
        if (code.properties[key] != null) {
          node.properties[key] = code.properties[key];
        }
      }
    });
  };
}
