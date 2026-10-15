/**
 * remark-prerequisites — turn a `:::prerequisites` container into a
 * `<Prerequisites>` box. The flattening counterpart for the .md twins is
 * emit/plugins/remark-prerequisites-md.mjs. Mirrors remark-tldr.mjs.
 */
import { injectImport, jsxFlow, stringAttr, takeDirectiveLabel } from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/prerequisites";

export default function remarkPrerequisites() {
  return (tree) => {
    let used = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        walk(child);
        if (child.type !== "containerDirective" || child.name !== "prerequisites") continue;
        const title = takeDirectiveLabel(child);
        node.children[i] = jsxFlow("Prerequisites", {
          attributes: title ? [stringAttr("title", title)] : [],
          children: child.children,
        });
        used = true;
      }
    };
    walk(tree);

    injectImport(tree, { names: ["Prerequisites"], source: IMPORT_SOURCE, used });
  };
}
