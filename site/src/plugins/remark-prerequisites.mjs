/**
 * remark-prerequisites — turn a `:::prerequisites` container into a
 * `<Prerequisites>` box, and the `:::environment[Title]` the docs emitter nests
 * inside it (emit/plugins/remark-prerequisites-env.mjs) into a
 * `<PrerequisitesEnvironment>` section. The flattening counterpart for the .md
 * twins is emit/plugins/remark-prerequisites-md.mjs. Mirrors remark-tldr.mjs.
 */
import { injectImport, jsxFlow, stringAttr, takeDirectiveLabel } from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/prerequisites";
const NAMES = { prerequisites: "Prerequisites", environment: "PrerequisitesEnvironment" };

export default function remarkPrerequisites() {
  return (tree) => {
    const used = new Set();

    const walk = (node, inside) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const name =
          child.type === "containerDirective" &&
          (child.name === "prerequisites" || (inside && child.name === "environment"))
            ? NAMES[child.name]
            : null;
        if (!name) {
          walk(child, inside);
          continue;
        }
        walk(child, true);
        const title = takeDirectiveLabel(child);
        node.children[i] = jsxFlow(name, {
          attributes: title ? [stringAttr("title", title)] : [],
          children: child.children,
        });
        used.add(name);
      }
    };
    walk(tree, false);

    injectImport(tree, { names: [...used].sort(), source: IMPORT_SOURCE, used: used.size > 0 });
  };
}
