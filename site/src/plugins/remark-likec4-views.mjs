/**
 * remark-likec4-views — upgrade `likec4=<viewId>` image titles to <LikeC4View>.
 */
import {
  injectImport,
  jsxFlow,
  stringAttr,
  walkTree,
} from "./lib/mdx-helpers.mjs";

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
    if (m) return m[1];
  }
  return null;
}

function likec4ViewNode(viewId) {
  return jsxFlow(IMPORT_NAME, {
    attributes: [
      stringAttr("viewId", viewId),
      stringAttr("dynamicViewVariant", "sequence"),
    ],
  });
}

export default function remarkLikeC4Views() {
  return (tree) => {
    let upgraded = false;

    walkTree(tree, (child, i, parent) => {
      const viewId = soleLikeC4Image(child);
      if (viewId) {
        parent.children[i] = likec4ViewNode(viewId);
        upgraded = true;
      }
    });

    injectImport(tree, { names: IMPORT_NAME, source: IMPORT_SOURCE, used: upgraded });
  };
}
