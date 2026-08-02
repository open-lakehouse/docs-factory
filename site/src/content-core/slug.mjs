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

import GithubSlugger from "github-slugger";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString as mdastToString } from "mdast-util-to-string";
import { normalizeText } from "./normalize.mjs";

/**
 * Extract headings from a markdown body.
 *
 * Each heading carries: `id` (rehype-slug id), `text`, `level`, `order`,
 * `fingerprint` (normalized text), `bodyText` (normalized plain text of the
 * section body up to the next same-or-shallower heading — INCLUDES descendant
 * subsections' prose), `directBodyText` (the prose directly under this heading,
 * BEFORE its first child heading — the heading's own content), and `charLen`.
 *
 * `bodyText` is the comment re-anchoring corpus (a quote can live anywhere under
 * a heading); `directBodyText` is the Merkle "SectionProse" leaf (a heading's own
 * content, so a parent's own hash doesn't change when only a descendant does).
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
    // Direct body ends at the FIRST following heading of any depth (the first
    // child subsection), so it captures only this heading's own prose.
    let directEnd = end;
    for (let j = h + 1; j < headingIdx.length; j++) {
      if (headingIdx[j] < end) {
        directEnd = headingIdx[j];
        break;
      }
    }
    const bodyNodes = children.slice(start, end).filter((n) => n.type !== "heading");
    const directNodes = children.slice(start, directEnd).filter((n) => n.type !== "heading");
    const bodyText = normalizeText(bodyNodes.map((n) => mdastToString(n)).join(" "));
    const directBodyText = normalizeText(directNodes.map((n) => mdastToString(n)).join(" "));
    headings.push({
      id: slugger.slug(text),
      text,
      level: node.depth,
      order: ordinal++,
      fingerprint: normalizeText(text),
      bodyText,
      directBodyText,
      charLen: bodyText.length,
    });
  }
  return headings;
}
