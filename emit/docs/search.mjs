/**
 * Full-text search records for the site's command palette: one per section of
 * a RENDERED page body, plus one for any text before the first heading.
 *
 * Sections split exactly as in sections.mjs, so anchors are the rehype-slug ids
 * the page's headings carry. The text keeps its case (it is shown as the
 * result excerpt) and drops fenced code and raw HTML, which read as noise in an
 * excerpt; inline code stays so identifiers remain findable.
 */
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { extractHeadings } from "../../site/src/content-core/slug.mjs";

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkFrontmatter);

const SKIP = new Set(["code", "html", "yaml", "heading"]);
// Nodes whose children are separate blocks of text rather than one inline run.
const BLOCKS = new Set([
  "root",
  "blockquote",
  "list",
  "listItem",
  "table",
  "tableRow",
  "containerDirective",
  "footnoteDefinition",
]);

function plainText(node) {
  if (SKIP.has(node.type)) return "";
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(plainText).join(BLOCKS.has(node.type) ? " " : "");
}

// A container directive spanning headings (a `::::tab` group) is cut by the
// section split, leaving its closing fence in a later slice as literal text.
const BARE_FENCE = /^[ \t]*:{3,}[ \t]*$/gm;

function textOf(markdown) {
  return plainText(parser.parse(markdown.replace(BARE_FENCE, "")))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {{ route: string, title: string, section: string[] }} page
 * @param {string} body  the rendered page body (no frontmatter)
 */
export function searchRecords({ route, title, section }, body) {
  const headings = extractHeadings(body);
  const record = (anchor, heading, text) => ({
    id: anchor ? `${route}#${anchor}` : route,
    route,
    anchor,
    page: title,
    heading,
    section,
    text,
  });
  // The page record always exists so a title-only match still finds the page.
  const out = [record(null, null, textOf(body.slice(0, headings[0]?.offset ?? body.length)))];
  headings.forEach((h, i) => {
    const slice = body.slice(h.offset, headings[i + 1]?.offset ?? body.length);
    out.push(record(h.id, h.text, textOf(slice)));
  });
  return out;
}
