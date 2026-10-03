/**
 * remark-tabs — group adjacent `:::tab[Label]` containers into one tab set.
 *
 *   :::tab[Python SDK]
 *   …
 *   :::
 *
 *   :::tab[CLI]
 *   …
 *   :::
 *
 * becomes `<ContentTabs><ContentTab label="Python SDK">…</ContentTab>…</ContentTabs>`.
 * There is no wrapper directive: a run of sibling tabs is one group (MkDocs
 * Material's `=== "Label"` model), and any other node between two tabs ends
 * the run. Keeping the wrapper implicit means a callout inside a tab needs only
 * `::::tab` around `:::note`, not a third nesting level.
 */
import { injectImport, jsxFlow, stringAttr, takeDirectiveLabel } from "./lib/mdx-helpers.mjs";

const IMPORT_SOURCE = "@/components/content-tabs";

const isTab = (node) => node?.type === "containerDirective" && node.name === "tab";

export default function remarkTabs() {
  return (tree) => {
    let used = false;

    const walk = (node) => {
      if (!node.children) return;
      const out = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!isTab(child)) {
          walk(child);
          out.push(child);
          continue;
        }
        const panels = [];
        while (isTab(node.children[i])) {
          const tab = node.children[i];
          walk(tab);
          const label = takeDirectiveLabel(tab) ?? `Tab ${panels.length + 1}`;
          panels.push(
            jsxFlow("ContentTab", {
              attributes: [stringAttr("label", label)],
              children: tab.children,
            }),
          );
          i++;
        }
        i--;
        out.push(jsxFlow("ContentTabs", { children: panels }));
        used = true;
      }
      node.children = out;
    };
    walk(tree);

    injectImport(tree, { names: ["ContentTabs", "ContentTab"], source: IMPORT_SOURCE, used });
  };
}
