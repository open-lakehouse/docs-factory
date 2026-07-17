/**
 * targets/gdocs.mjs — the Google Docs target.
 *
 * A target module is the per-target seam over the shared `resolve → render` core
 * (emit.mjs). It declares:
 *   - `name`            — the --target value.
 *   - `outputFile`      — the dist/<target>/ filename (defaults to `<slug>.md`).
 *   - `stringify`       — remark-stringify options for this target's Markdown flavor.
 *   - `stringifyExtension` — an optional plugin applied just before remark-stringify
 *                         to augment its compiler. A target emitting JSX
 *                         (unitycatalog) sets this to remark-mdx.
 *   - `titleAsH1`       — whether the frontmatter title is prepended as a `#` H1
 *                         (Google Docs has no title field; a site that renders the
 *                         title itself sets false).
 *   - `unwrapProse`     — whether to unwrap hard-wrapped prose (Docs reflow needs it;
 *                         MDX must not have it).
 *   - `constructs`      — the plugins used per construct: `{ callouts, journey,
 *                         codeCaption, likec4 }`. gdocs supplies the `-md` flatteners;
 *                         unitycatalog supplies MDX variants (+ a callout no-op).
 *   - `componentImportBase` — (component targets only) where the journey/likec4
 *                         plugins import their components from.
 *   - `likec4WebComponent`  — (component targets only) generate the LikeC4 web-
 *                         component bundle into dist/<target>/.
 *   - `imagePlaceholder`— how an image is represented in the flattened Markdown so
 *                         the delivery adapter can find and replace it. Google Docs'
 *                         Markdown import won't embed a local PNG, so instead of an
 *                         `![](file.png)` we emit a unique, self-locating placeholder
 *                         line the /blog-emit skill searches for, then swaps for a
 *                         real inline image via the Docs API (insertInlineImage).
 *   - `renderImage`     — given a manifest entry, return the mdast node the flatten
 *                         should leave in the tree for this target.
 *
 * A future target (Delta.io, etc.) is a sibling module exporting the same shape;
 * the core in emit.mjs stays untouched.
 */
import remarkCalloutsMd from "../plugins/remark-callouts-md.mjs";
import remarkJourneyMd from "../plugins/remark-journey-md.mjs";
import remarkCodeCaption from "../plugins/remark-code-caption.mjs";
import remarkLikeC4Md from "../plugins/remark-likec4-md.mjs";

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
  outputFile: undefined, // → defaults to `<slug>.md`
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
  // Google Docs is a FLATTENING target: title becomes a body H1 (no title field),
  // prose is unwrapped so the Docs importer reflows cleanly, and every rich
  // construct degrades to portable Markdown.
  titleAsH1: true,
  unwrapProse: true,
  constructs: {
    callouts: remarkCalloutsMd, // :::tip/:::warning/… → bold-led blockquote
    journey: remarkJourneyMd, // ::::journey → numbered ### Step N — … headings
    codeCaption: remarkCodeCaption, // title="x.py" → bold caption line, clean fence
    likec4: remarkLikeC4Md, // likec4= image → plain filename image + manifest
  },
  imagePlaceholder,
  renderImage,
};

export default gdocs;
