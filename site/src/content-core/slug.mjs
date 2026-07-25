/**
 * Canonical heading extraction — rehype-slug-identical ids plus each section's
 * normalized body text, for the version manifest's section anchors.
 *
 * rehype-slug uses github-slugger with a single shared instance per document and
 * slugs headings in document order, so duplicate headings collide into `-1`,
 * `-2`, etc. We replicate that exactly; a drift test asserts the ids match a
 * real rehype-slug pass. The fingerprint is the normalized heading text — a
 * stable re-anchor key when the id changes.
 */
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString as mdastToString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import { normalizeText } from "./normalize.mjs";

/**
 * Extract headings from a markdown body.
 *
 * Each heading carries: `id` (rehype-slug id), `text`, `level`, `order`,
 * `fingerprint` (normalized text), `bodyText` (normalized plain text of the
 * section body up to the next same-or-shallower heading), and `charLen`.
 */
export function extractHeadings(body) {
  const tree = fromMarkdown(body);
  const slugger = new GithubSlugger();
  const children = tree.children ?? [];
  const headingIdx = [];
  children.forEach((node, i) => {
    if (node.type === "heading") headingIdx.push(i);
  });

  const headings = [];
  let ordinal = 0;
  for (let h = 0; h < headingIdx.length; h++) {
    const node = children[headingIdx[h]];
    const text = mdastToString(node).trim();
    if (!text) continue;
    // Section body = top-level nodes between this heading and the next heading
    // whose depth is <= this one (a subheading's body belongs to it).
    const start = headingIdx[h] + 1;
    let end = children.length;
    for (let j = h + 1; j < headingIdx.length; j++) {
      if ((children[headingIdx[j]].depth ?? 6) <= node.depth) {
        end = headingIdx[j];
        break;
      }
    }
    const bodyNodes = children.slice(start, end).filter((n) => n.type !== "heading");
    const bodyText = normalizeText(bodyNodes.map((n) => mdastToString(n)).join(" "));
    headings.push({
      id: slugger.slug(text),
      text,
      level: node.depth,
      order: ordinal++,
      fingerprint: normalizeText(text),
      bodyText,
      charLen: bodyText.length,
    });
  }
  return headings;
}
