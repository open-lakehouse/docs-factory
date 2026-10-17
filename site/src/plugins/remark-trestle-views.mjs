/**
 * remark-trestle-views — upgrade `trestle=<ref>` image titles to <TrestleDiagram>.
 * The image is always its snapshot's sibling PNG (docsnip checks it), so the
 * snapshot URL is the image URL with `.png` → `.trestle-graph.json`, wherever the
 * host serves the two. The alt text is the diagram's only text equivalent.
 */
import { expressionAttr, injectImport, jsxFlow, stringAttr, walkTree } from "./lib/mdx-helpers.mjs";

const TRESTLE_TITLE_RE = /^trestle=\S+$/;
const SNAPSHOT_SUFFIX = ".trestle-graph.json";
const IMPORT_SOURCE = "@/components/TrestleDiagram";
const IMPORT_NAME = "TrestleDiagram";

function soleTrestleImage(node) {
  if (node.type !== "paragraph" || node.children?.length !== 1) return null;
  const only = node.children[0];
  if (
    only.type === "image" &&
    typeof only.title === "string" &&
    TRESTLE_TITLE_RE.test(only.title) &&
    only.url.endsWith(".png")
  ) {
    return { image: only.url, alt: only.alt ?? "" };
  }
  return null;
}

function trestleNode({ image, alt }) {
  const attributes = [
    stringAttr("image", image),
    stringAttr("snapshot", image.replace(/\.png$/, SNAPSHOT_SUFFIX)),
  ];
  if (alt) attributes.push(expressionAttr("alt", alt));
  return jsxFlow(IMPORT_NAME, { attributes });
}

export default function remarkTrestleViews() {
  return (tree) => {
    let upgraded = false;
    walkTree(tree, (child, i, parent) => {
      const found = soleTrestleImage(child);
      if (found) {
        parent.children[i] = trestleNode(found);
        upgraded = true;
      }
    });
    injectImport(tree, { names: IMPORT_NAME, source: IMPORT_SOURCE, used: upgraded });
  };
}
