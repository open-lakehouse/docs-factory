/**
 * remark-model-links — upgrade `[label](model:<id>)` links into <ModelRef>.
 */
import {
  injectImport,
  jsxText,
  stringAttr,
  walkTree,
} from "./lib/mdx-helpers.mjs";

const MODEL_URL_RE = /^model:(.+)$/;
const IMPORT_SOURCE = "@/components/ModelRef";
const IMPORT_NAME = "ModelRef";

export default function remarkModelLinks() {
  return (tree) => {
    let used = false;

    walkTree(tree, (child, i, parent) => {
      if (child.type === "link" && typeof child.url === "string") {
        const m = child.url.match(MODEL_URL_RE);
        if (m) {
          parent.children[i] = jsxText(IMPORT_NAME, {
            attributes: [stringAttr("id", m[1])],
            children: child.children ?? [],
          });
          used = true;
        }
      }
    });

    injectImport(tree, { names: IMPORT_NAME, source: IMPORT_SOURCE, used });
  };
}
