/**
 * remark-tabs — turn `::::tabs` / `:::tab` container directives into
 * `<Tabs>` / `<Tab>` for engine-tabbed snippets.
 */
import {
  directiveAttr,
  injectImport,
  jsxFlow,
  stringAttr,
  takeDirectiveLabel,
  walkTree,
} from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/tabs";

function tabNode(tabDirective) {
  const label = takeDirectiveLabel(tabDirective) ?? "Tab";
  return jsxFlow("Tab", {
    attributes: [stringAttr("label", label)],
    children: tabDirective.children ?? [],
  });
}

export default function remarkTabs() {
  return (tree) => {
    let used = false;

    walkTree(tree, (child, i, parent) => {
      if (child.type === "containerDirective" && child.name === "tabs") {
        const syncKey = directiveAttr(child, "syncKey");
        const tabs = [];
        const rest = [];
        for (const c of child.children ?? []) {
          if (c.type === "containerDirective" && c.name === "tab") {
            tabs.push(tabNode(c));
          } else {
            rest.push(c);
          }
        }
        parent.children[i] = jsxFlow("Tabs", {
          attributes: syncKey ? [stringAttr("syncKey", syncKey)] : [],
          children: tabs.length ? tabs : rest,
        });
        used = true;
      }
    });

    injectImport(tree, { names: ["Tabs", "Tab"], source: IMPORT_SOURCE, used });
  };
}
