/**
 * remark-tabs-md — the Markdown-flattening counterpart of the preview's
 * remark-tabs.mjs. The preview groups adjacent `:::tab[Label]` containers into a
 * tab set; a plain Markdown target has no tabs, so every panel is kept, in
 * order, each led by its label in bold:
 *
 *   :::tab[Python SDK]
 *   …body…
 *   :::
 *
 * becomes
 *
 *   **Python SDK**
 *
 *   …body…
 *
 * All panels survive because an agent reading the twin should see every
 * interface, not only the default tab.
 *
 * Runs AFTER remark-callouts-md (a callout inside a tab is already a blockquote)
 * and BEFORE remark-journey-md (so a tab nested in a journey step is plain
 * content by the time the journey drops its wrapper).
 */

function takeLabel(node) {
  const first = node.children?.[0];
  if (first?.data?.directiveLabel) {
    node.children.shift();
    return first.children?.map((c) => c.value ?? "").join("") || undefined;
  }
  return undefined;
}

export default function remarkTabsMd() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      const out = [];
      for (const child of node.children) {
        walk(child);
        if (child.type === "containerDirective" && child.name === "tab") {
          const label = takeLabel(child);
          if (label) {
            out.push({
              type: "paragraph",
              children: [{ type: "strong", children: [{ type: "text", value: label }] }],
            });
          }
          out.push(...child.children);
        } else {
          out.push(child);
        }
      }
      node.children = out;
    };
    walk(tree);
  };
}
