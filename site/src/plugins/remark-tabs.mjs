/**
 * remark-tabs — turn `::::tabs` / `:::tab` container directives into
 * `<Tabs>` / `<Tab>` for engine-tabbed snippets and other grouped content.
 *
 *   ::::tabs{syncKey=engine}
 *   :::tab[Python (deltalake)]
 *   ```python file=../../../examples/python/read_delta_table.py …
 *   ```
 *   :::
 *   :::tab[Polars]
 *   …
 *   :::
 *   ::::
 *
 * Uses four colons on `tabs` so nested three-colon `:::tab` blocks close cleanly
 * (same pattern as `::::journey`). Tab labels come from the directive label
 * (`:::tab[Label]`) or the first text line inside the tab. Runs after
 * remark-code-snippets so fences inside tabs are already resolved.
 */

const IMPORT_SOURCE = "@/components/tabs";

function importNode() {
  const names = ["Tabs", "Tab"];
  return {
    type: "mdxjsEsm",
    value: `import { ${names.join(", ")} } from "${IMPORT_SOURCE}";`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: names.map((name) => ({
              type: "ImportSpecifier",
              imported: { type: "Identifier", name },
              local: { type: "Identifier", name },
            })),
            source: { type: "Literal", value: IMPORT_SOURCE, raw: `"${IMPORT_SOURCE}"` },
          },
        ],
      },
    },
  };
}

/** Extract optional `[label]` from a directive's first directiveLabel child. */
function takeLabel(node) {
  const first = node.children?.[0];
  if (first && first.data?.directiveLabel) {
    node.children.shift();
    return first.children?.map((c) => c.value ?? "").join("") || undefined;
  }
  return undefined;
}

/** Read a string attribute from a containerDirective node (remark-directive v4). */
function attr(node, name) {
  const attrs = node.attributes;
  if (!attrs || typeof attrs !== "object") return undefined;
  if (Array.isArray(attrs)) {
    const entry = attrs.find((a) => a.name === name);
    return entry?.value ?? undefined;
  }
  return attrs[name];
}

function tabNode(tabDirective) {
  const label = takeLabel(tabDirective) ?? "Tab";
  return {
    type: "mdxJsxFlowElement",
    name: "Tab",
    attributes: [{ type: "mdxJsxAttribute", name: "label", value: label }],
    children: tabDirective.children ?? [],
  };
}

export default function remarkTabs() {
  return (tree) => {
    let used = false;

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && child.name === "tabs") {
          const syncKey = attr(child, "syncKey");
          const tabs = [];
          const rest = [];
          for (const c of child.children ?? []) {
            if (c.type === "containerDirective" && c.name === "tab") {
              tabs.push(tabNode(c));
            } else {
              rest.push(c);
            }
          }
          node.children[i] = {
            type: "mdxJsxFlowElement",
            name: "Tabs",
            attributes: syncKey
              ? [{ type: "mdxJsxAttribute", name: "syncKey", value: syncKey }]
              : [],
            children: tabs.length ? tabs : rest,
          };
          used = true;
          continue;
        }
        walk(child);
      }
    };
    walk(tree);

    if (used) tree.children.unshift(importNode());
  };
}
