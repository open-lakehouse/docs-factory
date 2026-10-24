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
 * `::::journey`, `likec4` blocks). Those unknown directives degrade gracefully:
 * a `file=` fence renders as an (empty) code block, a `:::callout` container
 * renders as its inner text. The plan's intent is to feed this the RICH emitter
 * output once Phase 1 twins exist; until then the raw body still produces a
 * usable fallback.
 */

import { toHtml } from "hast-util-to-html";
import yaml from "js-yaml";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toHast } from "mdast-util-to-hast";
import { gfm } from "micromark-extension-gfm";

// Not content-core/frontmatter.mjs: that imports node:crypto, and this runs in
// the browser too.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const el = (tagName, children, properties = {}) => ({
  type: "element",
  tagName,
  properties,
  children,
});
const text = (value) => ({ type: "text", value });

/** A YAML value as a table cell's content: an object or list nests a table. */
function valueNodes(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return [
      el("table", [
        el(
          "tbody",
          value.map((v) => el("tr", [el("td", valueNodes(v))])),
        ),
      ]),
    ];
  }
  if (typeof value === "object") return [mappingTable(value)];
  return [text(String(value))];
}

/** A mapping as a key/value table, a row per key. */
function mappingTable(meta, properties) {
  const rows = Object.entries(meta).map(([k, v]) =>
    el("tr", [el("th", [text(k)], { scope: "row" }), el("td", valueNodes(v))]),
  );
  return el("table", [el("tbody", rows)], properties);
}

/** The frontmatter block as a hast node, or null for YAML that isn't a mapping. */
function frontmatterNode(source) {
  try {
    // JSON_SCHEMA keeps dates as written rather than as Date objects.
    const meta = yaml.load(source, { schema: yaml.JSON_SCHEMA });
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      return mappingTable(meta, { className: ["frontmatter"] });
    }
  } catch {
    // Unparseable YAML still shows, as its source.
  }
  return el("pre", [el("code", [text(source)], { className: ["language-yaml"] })]);
}

/**
 * Render markdown to a semantic HTML fragment string. A leading YAML
 * frontmatter block renders as a key/value table (`table.frontmatter`) rather
 * than as a rule and a heading.
 */
export function renderMarkdownToHtml(markdown) {
  if (!markdown?.trim()) return "";
  const match = FRONTMATTER_RE.exec(markdown);
  const body = match ? markdown.slice(match[0].length) : markdown;
  const mdast = fromMarkdown(body, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const hast = toHast(mdast, { allowDangerousHtml: false });
  if (match) hast.children.unshift(frontmatterNode(match[1]), text("\n"));
  return toHtml(hast);
}
