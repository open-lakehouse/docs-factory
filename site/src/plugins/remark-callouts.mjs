/**
 * remark-callouts — turn `:::tip` / `:::warning` / … container directives into
 * `<Callout type="…">` boxes.
 */
import { injectImport, jsxFlow, stringAttr, takeDirectiveLabel } from "./lib/mdx-helpers.mjs";

const TYPES = new Set(["tip", "warning", "note", "info", "caution", "danger"]);
const IMPORT_SOURCE = "@/components/callout";
const IMPORT_NAME = "Callout";

export default function remarkCallouts() {
  return (tree) => {
    let used = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && TYPES.has(child.name)) {
          walk(child);
          const title = takeDirectiveLabel(child);
          node.children[i] = jsxFlow(IMPORT_NAME, {
            attributes: [
              stringAttr("type", child.name),
              ...(title ? [stringAttr("title", title)] : []),
            ],
            children: child.children,
          });
          used = true;
        } else {
          walk(child);
        }
      }
    };
    walk(tree);

    injectImport(tree, { names: IMPORT_NAME, source: IMPORT_SOURCE, used });
  };
}
