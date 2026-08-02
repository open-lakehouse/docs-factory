/**
 * Minimal markdown → semantic HTML, for the `<noscript>` fallback the prerender
 * shell injects (Phase 0).
 *
 * This is deliberately NOT the site's render pipeline (which has 13 app-specific
 * remark/rehype plugins, JSX, LikeC4 components, snippet resolution). Crawlers
 * and non-JS agents only need readable semantic HTML — headings, paragraphs,
 * lists, code, links — so we run the low-level mdast→hast→html chain (the same
 * families content-core's pipeline.mjs already depends on) with GFM support and
 * nothing else.
 *
 * The canonical source body is annotation-heavy (`file=` fences, `:::callout`,
 * `::::journey`, `likec4=` embeds). Those unknown directives degrade gracefully:
 * a `file=` fence renders as an (empty) code block, a `:::callout` container
 * renders as its inner text. The plan's intent is to feed this the RICH emitter
 * output once Phase 1 twins exist; until then the raw body still produces a
 * usable fallback.
 */

import { toHtml } from "hast-util-to-html";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toHast } from "mdast-util-to-hast";
import { gfm } from "micromark-extension-gfm";

/** Render a markdown body to a semantic HTML fragment string. */
export function renderMarkdownToHtml(body) {
  if (!body || !body.trim()) return "";
  const mdast = fromMarkdown(body, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const hast = toHast(mdast, { allowDangerousHtml: false });
  return toHtml(hast);
}
