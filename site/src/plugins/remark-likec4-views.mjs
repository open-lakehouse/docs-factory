/**
 * remark-likec4-views — upgrade `likec4=<viewId>` image titles to <LikeC4View>.
 * The image's alt text rides along: it is the diagram's only text equivalent.
 */
import { expressionAttr, injectImport, jsxFlow, stringAttr, walkTree } from "./lib/mdx-helpers.mjs";

const LIKEC4_TITLE_RE = /^likec4=(\S+)$/;
const IMPORT_SOURCE = "@/components/LikeC4View";
const IMPORT_NAME = "LikeC4View";

function soleLikeC4Image(node) {
  if (node.type !== "paragraph" || !node.children || node.children.length !== 1) {
    return null;
  }
  const only = node.children[0];
  if (only.type === "image" && typeof only.title === "string") {
    const m = only.title.match(LIKEC4_TITLE_RE);
    if (m) return { viewId: m[1], alt: only.alt ?? "" };
  }
  return null;
}

function likec4ViewNode({ viewId, alt }) {
  const attributes = [stringAttr("viewId", viewId), stringAttr("dynamicViewVariant", "sequence")];
  if (alt) attributes.push(expressionAttr("alt", alt));
  return jsxFlow(IMPORT_NAME, { attributes });
}

export default function remarkLikeC4Views() {
  return (tree) => {
    let upgraded = false;

    walkTree(tree, (child, i, parent) => {
      const view = soleLikeC4Image(child);
      if (view) {
        parent.children[i] = likec4ViewNode(view);
        upgraded = true;
      }
    });

    injectImport(tree, { names: IMPORT_NAME, source: IMPORT_SOURCE, used: upgraded });
  };
}
