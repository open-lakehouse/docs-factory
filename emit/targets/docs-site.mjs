/**
 * targets/docs-site.mjs — a page of an emitted static docs site (emit/docs).
 *
 * Unlike the blog targets, this keeps the page in its AUTHORED shape: `:::`
 * callouts/tabs/tldr and `::::journey` stay as directives, because the target
 * site renders them with verbatim copies of the preview's own remark plugins
 * (vendored by the emitter). What changes is only what the target can't
 * resolve on its own: `file=` snippets are inlined (core), and images point at
 * the URLs the emitter serves them from. A `likec4=` image keeps its title, so
 * the vendored remark-likec4-views still upgrades it to an interactive view,
 * with the PNG as its fallback; a ```` ```trestle ```` diagram marker stays a
 * marker, its ref rewritten to the served snapshot remark-trestle-views draws.
 *
 * The result is portable Markdown, so a PR into the target repo reads like a
 * docs change rather than a JSX diff.
 */
import { basename } from "node:path";
import { markerNode } from "../../site/src/plugins/lib/trestle-ref.mjs";
import remarkLikeC4Md from "../plugins/remark-likec4-md.mjs";
import { LIKEC4_ASSET_BASE, trestleEnvSnapshot } from "./md-twin.mjs";

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
 * served under (e.g. `/assets/how-to/duckdb`); LikeC4 PNGs are shared site-wide.
 * `altText(entry)` may supply alt text the author left out (e.g. from the model).
 */
export function docsSiteTarget({ assetBase, altText = (entry) => entry.altText }) {
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
    constructs: { likec4: remarkLikeC4Md },
    renderImage(entry) {
      const image = entry.likec4
        ? {
            type: "image",
            url: `${LIKEC4_ASSET_BASE}/${entry.likec4}.png`,
            alt: altText(entry),
            title: `likec4=${entry.likec4}`,
          }
        : {
            type: "image",
            url: `${assetBase}/${entry.filename}`,
            alt: altText(entry),
            title: null,
          };
      return { type: "paragraph", children: [image] };
    },
    renderTrestle: (entry) => markerNode(trestleSnapshotUrl(entry, assetBase), entry.alt),
  };
}
