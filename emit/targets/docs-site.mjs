/**
 * targets/docs-site.mjs — a page of an emitted static docs site (emit/docs).
 *
 * Unlike the blog targets, this keeps the page in its AUTHORED shape: `:::`
 * callouts/tabs/tldr and `::::journey` stay as directives, because the target
 * site renders them with verbatim copies of the preview's own remark plugins
 * (vendored by the emitter). What changes is only what the target can't
 * resolve on its own: `file=` snippets are inlined (core), and images point at
 * the URLs the emitter serves them from. A ```` ```likec4 ```` or
 * ```` ```trestle ```` diagram marker stays a marker (a trestle ref rewritten to
 * the served snapshot), followed by a ```` ```mermaid fallback ```` fence: the
 * vendored remark-likec4-views / remark-trestle-views upgrade the marker to the
 * interactive diagram and hand it the Mermaid, which no-JS readers get.
 *
 * The result is portable Markdown, so a PR into the target repo reads like a
 * docs change rather than a JSX diff.
 */
import { basename } from "node:path";
import { markerNode as likec4MarkerNode } from "../../site/src/plugins/lib/likec4-ref.mjs";
import { markerNode, trestleMermaid } from "../../site/src/plugins/lib/trestle-ref.mjs";
import remarkImagesMd from "../plugins/remark-images-md.mjs";
import { mermaidFallback } from "../plugins/remark-trestle-md.mjs";
import { trestleEnvSnapshot } from "./md-twin.mjs";

/** Where the site serves a diagram marker's snapshot: an environment's
 * site-wide, a page's own under its `assetBase`. */
export function trestleSnapshotUrl(entry, assetBase) {
  return entry.env ? trestleEnvSnapshot(entry.env) : `${assetBase}/${basename(entry.snapshot)}`;
}

/** Keep only what the site renders; drafting fields (status, id, refs…) stay home. */
function frontmatter(draft) {
  const fm = {};
  if (draft.title) fm.title = String(draft.title);
  if (draft.summary) fm.summary = String(draft.summary);
  if (draft.diataxis) fm.diataxis = draft.diataxis;
  return Object.keys(fm).length ? fm : null;
}

/**
 * The target for one page. `assetBase` is the URL the page's own images are
 * served under (e.g. `/assets/how-to/duckdb`).
 */
export function docsSiteTarget({ assetBase }) {
  return {
    name: "docs-site",
    stringify: {
      bullet: "-",
      fences: true,
      fence: "`",
      rule: "-",
      listItemIndent: "one",
    },
    titleAsH1: false, // the site renders the title from site.json
    unwrapProse: false, // keep authored line breaks: smaller, reviewable diffs
    frontmatter,
    constructs: { images: remarkImagesMd },
    renderImage(entry) {
      const image = {
        type: "image",
        url: `${assetBase}/${entry.filename}`,
        alt: entry.altText,
        title: null,
      };
      return { type: "paragraph", children: [image] };
    },
    renderLikeC4: (entry) => [
      likec4MarkerNode(entry.viewId, entry.alt),
      mermaidFallback(entry.mermaid),
    ],
    renderTrestle: (entry) => [
      markerNode(trestleSnapshotUrl(entry, assetBase), entry.alt),
      mermaidFallback(trestleMermaid(entry)),
    ],
  };
}
