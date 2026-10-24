/**
 * remark-trestle-views — upgrade a ```` ```trestle <snapshot> ```` marker to
 * <TrestleDiagram>. By the time it runs the meta is the snapshot's URL: the
 * review app's remark-resolve-images and the docs-site emitter rewrite the
 * authored ref (see lib/trestle-ref.mjs). The body is the diagram's alt text, its
 * only text equivalent. A ```` ```mermaid fallback ```` fence right after it (from
 * the docs-site emitter) becomes the `mermaid` prop. Self-contained, as the
 * emitter vendors it to the sites.
 */
import {
  expressionAttr,
  injectImport,
  jsxFlow,
  stringAttr,
  takeMermaidFallback,
  walkTree,
} from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/TrestleDiagram";
const IMPORT_NAME = "TrestleDiagram";

function trestleNode(node, mermaid) {
  const attributes = [stringAttr("snapshot", node.meta.trim())];
  const alt = (node.value ?? "").replace(/\s+/g, " ").trim();
  if (alt) attributes.push(expressionAttr("alt", alt));
  if (mermaid) attributes.push(expressionAttr("mermaid", mermaid));
  return jsxFlow(IMPORT_NAME, { attributes });
}

export default function remarkTrestleViews() {
  return (tree) => {
    let upgraded = false;
    walkTree(tree, (child, i, parent) => {
      if (child.type === "code" && child.lang === "trestle" && child.meta?.trim()) {
        parent.children[i] = trestleNode(child, takeMermaidFallback(parent, i));
        upgraded = true;
      }
    });
    injectImport(tree, { names: IMPORT_NAME, source: IMPORT_SOURCE, used: upgraded });
  };
}
