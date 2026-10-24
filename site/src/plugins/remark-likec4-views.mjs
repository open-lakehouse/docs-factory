/**
 * remark-likec4-views — upgrade a ```` ```likec4 <viewId> ```` marker to
 * <LikeC4View>. The body is the diagram's alt text, its only text equivalent;
 * the view's own `variant` picks diagram or sequence. A ```` ```mermaid fallback ````
 * fence right after it (from the docs-site emitter) becomes the `mermaid` prop.
 * Self-contained, as the emitter vendors it to the sites.
 */
import {
  expressionAttr,
  injectImport,
  jsxFlow,
  stringAttr,
  takeMermaidFallback,
  walkTree,
} from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/LikeC4View";
const IMPORT_NAME = "LikeC4View";

function likec4ViewNode(node, mermaid) {
  const attributes = [stringAttr("viewId", node.meta.trim())];
  const alt = (node.value ?? "").replace(/\s+/g, " ").trim();
  if (alt) attributes.push(expressionAttr("alt", alt));
  if (mermaid) attributes.push(expressionAttr("mermaid", mermaid));
  return jsxFlow(IMPORT_NAME, { attributes });
}

export default function remarkLikeC4Views() {
  return (tree) => {
    let upgraded = false;
    walkTree(tree, (child, i, parent) => {
      if (child.type === "code" && child.lang === "likec4" && child.meta?.trim()) {
        parent.children[i] = likec4ViewNode(child, takeMermaidFallback(parent, i));
        upgraded = true;
      }
    });
    injectImport(tree, { names: IMPORT_NAME, source: IMPORT_SOURCE, used: upgraded });
  };
}
