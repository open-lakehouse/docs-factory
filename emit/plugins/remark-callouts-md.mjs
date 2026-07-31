/**
 * remark-callouts-md — the Markdown-flattening counterpart of the preview's
 * remark-callouts.mjs. Where the preview turns a `:::tip` / `:::warning` / …
 * container directive into a `<Callout>` React box, this turns it into a plain
 * **blockquote led by a bold type label** — the portable, no-admonition form that
 * survives any plain-Markdown (flattening) target, e.g. the md-twins:
 *
 *   :::warning
 *   A managed CREATE must set delta.feature.catalogManaged = 'supported'.
 *   :::
 *
 * becomes
 *
 *   > **Warning**
 *   >
 *   > A managed CREATE must set delta.feature.catalogManaged = 'supported'.
 *
 * The type→label map mirrors preview/src/components/callout.tsx's META so the two
 * renderers agree on the words. A custom label (`:::warning[Heading]` or the text
 * right after the name) overrides the default, same as the preview.
 *
 * Runs AFTER remark-directive + the prose guard (needs the parsed
 * containerDirective) and BEFORE remark-journey-md, so a callout nested inside a
 * journey step is already a blockquote when the journey drops its wrapper. Unknown
 * directive names are left untouched for other plugins (journey owns `journey`).
 */

const TYPES = new Set(["tip", "note", "info", "warning", "caution", "danger"]);

// Mirror the labels in preview/src/components/callout.tsx (caution/danger keep
// their own word here rather than sharing warning's, since a flattened blockquote
// has no icon to disambiguate).
const LABELS = {
  tip: "Tip",
  note: "Note",
  info: "Info",
  warning: "Warning",
  caution: "Caution",
  danger: "Danger",
};

/** A directive's optional label (`:::tip[Label]`) lives in a `directiveLabel`
 * paragraph as the node's first child; extract and remove it if present. Mirrors
 * takeLabel() in the preview's remark-callouts.mjs. */
function takeLabel(node) {
  const first = node.children?.[0];
  if (first && first.data?.directiveLabel) {
    node.children.shift();
    return first.children?.map((c) => c.value ?? "").join("") || undefined;
  }
  return undefined;
}

/** A bold-text paragraph, e.g. `**Warning**`, as the blockquote's lead line. */
function labelParagraph(text) {
  return {
    type: "paragraph",
    children: [{ type: "strong", children: [{ type: "text", value: text }] }],
  };
}

export default function remarkCalloutsMd() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "containerDirective" && TYPES.has(child.name)) {
          const title = takeLabel(child) ?? LABELS[child.name];
          // Recurse first so any directive nested inside the callout (rare) is
          // flattened before we wrap the body in a blockquote.
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
