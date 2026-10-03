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
 * with the PNG as its fallback.
 *
 * The result is portable Markdown, so a PR into the target repo reads like a
 * docs change rather than a JSX diff.
 */
import remarkLikeC4Md from "../plugins/remark-likec4-md.mjs";
import { LIKEC4_ASSET_BASE } from "./md-twin.mjs";

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
    constructs: { likec4: remarkLikeC4Md },
    renderImage(entry) {
      const image = entry.likec4
        ? {
            type: "image",
            url: `${LIKEC4_ASSET_BASE}/${entry.likec4}.png`,
            alt: entry.altText,
            title: `likec4=${entry.likec4}`,
          }
        : { type: "image", url: `${assetBase}/${entry.filename}`, alt: entry.altText, title: null };
      return { type: "paragraph", children: [image] };
    },
  };
}
