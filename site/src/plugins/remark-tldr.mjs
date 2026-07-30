/**
 * remark-tldr — turn a `:::tldr` container directive into a `<Tldr>` box in the
 * in-app MDX render. The flattening counterpart (emit/plugins/remark-tldr-md.mjs)
 * renders the same construct to a **TL;DR** blockquote for the .md twins; this is
 * the styled in-app version. Mirrors remark-callouts.mjs. A `:::tldr[Label]`
 * overrides the default heading.
 */
import { injectImport, jsxFlow, stringAttr, takeDirectiveLabel } from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/tldr";
const IMPORT_NAME = "Tldr";

export default function remarkTldr() {
  return (tree) => {
    let used = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && child.name === "tldr") {
          walk(child);
          const title = takeDirectiveLabel(child);
          node.children[i] = jsxFlow(IMPORT_NAME, {
            attributes: title ? [stringAttr("title", title)] : [],
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
