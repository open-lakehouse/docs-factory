/**
 * targets/gdocs.mjs — the Google Docs target.
 *
 * A target module is the per-target seam over the shared `resolve → flatten` core
 * (emit.mjs). It declares:
 *   - `name`            — the --target value.
 *   - `stringify`       — remark-stringify options for this target's Markdown flavor.
 *   - `imagePlaceholder`— how an image is represented in the flattened Markdown so
 *                         the delivery adapter can find and replace it. Google Docs'
 *                         Markdown import won't embed a local PNG, so instead of an
 *                         `![](file.png)` we emit a unique, self-locating placeholder
 *                         line the /blog-emit skill searches for, then swaps for a
 *                         real inline image via the Docs API (insertInlineImage).
 *   - `renderImage`     — given a manifest entry, return the mdast node the flatten
 *                         should leave in the tree for this target.
 *
 * A future target (Delta.io / UC.io MDX, etc.) is a sibling module exporting the
 * same shape; the core in emit.mjs stays untouched.
 */

/** The placeholder text the adapter locates in the created Doc, e.g.
 *  `[[IMAGE: managedTableFlow.png]]`. Kept in one place so emit.mjs and the skill
 *  agree on the exact token. */
export function imagePlaceholder(filename) {
  return `[[IMAGE: ${filename}]]`;
}

/** For Google Docs we replace each image with a placeholder PARAGRAPH (its own
 * block) rather than a Markdown image — the adapter deletes the placeholder and
 * inserts the uploaded PNG at that index. Alt text is preserved on the manifest,
 * not in the doc body. */
export function renderImage(entry) {
  return {
    type: "paragraph",
    children: [{ type: "text", value: imagePlaceholder(entry.filename) }],
  };
}

const gdocs = {
  name: "gdocs",
  // remark-stringify options: fenced code (not indented), `-` bullets to match the
  // repo's prose, and don't wrap prose (Google Docs reflows anyway; hard wraps
  // would import as hard line breaks).
  stringify: {
    bullet: "-",
    fences: true,
    fence: "`",
    rule: "-",
    listItemIndent: "one",
  },
  imagePlaceholder,
  renderImage,
};

export default gdocs;
