/**
 * remark-tldr-md — the Markdown-flattening renderer for the `:::tldr` construct.
 *
 * A TL;DR / key-takeaways box is authored as a container directive holding 3–5
 * fact-rich bullets:
 *
 *   :::tldr
 *   - Unity Catalog is an open catalog for the lakehouse.
 *   - Delta tables are registered as external tables.
 *   :::
 *
 * On a flattening target (the .md twins) it becomes a plain
 * blockquote led by a bold **TL;DR** label — the portable form that survives any
 * plain-Markdown consumer and reads unambiguously for an agent:
 *
 *   > **TL;DR**
 *   >
 *   > - Unity Catalog is an open catalog for the lakehouse.
 *   > - Delta tables are registered as external tables.
 *
 * Modeled on remark-callouts-md.mjs. Runs BEFORE callouts/journey so a TL;DR
 * nested inside a step (rare) is already a blockquote by the time the journey
 * drops its wrapper. A custom label (`:::tldr[Key takeaways]`) overrides the
 * default, same as the callout plugin. Per the agentic-docs design, the TL;DR is
 * BODY content only — it never becomes the page's exposed description (that stays
 * frontmatter `summary`).
 */

const DEFAULT_LABEL = "TL;DR";

/** A directive's optional label (`:::tldr[Label]`) lives in a `directiveLabel`
 * paragraph as the node's first child; extract and remove it if present. Mirrors
 * takeLabel() in remark-callouts-md.mjs. */
function takeLabel(node) {
  const first = node.children?.[0];
  if (first && first.data?.directiveLabel) {
    node.children.shift();
    return first.children?.map((c) => c.value ?? "").join("") || undefined;
  }
  return undefined;
}

/** A bold-text paragraph, e.g. `**TL;DR**`, as the blockquote's lead line. */
function labelParagraph(text) {
  return {
    type: "paragraph",
    children: [{ type: "strong", children: [{ type: "text", value: text }] }],
  };
}

export default function remarkTldrMd() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && child.name === "tldr") {
          const title = takeLabel(child) ?? DEFAULT_LABEL;
          // Recurse first so any directive nested inside (rare) is flattened
          // before we wrap the body in a blockquote.
          walk(child);
          node.children[i] = {
            type: "blockquote",
            children: [labelParagraph(title), ...child.children],
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
