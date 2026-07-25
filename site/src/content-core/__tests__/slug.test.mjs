// Heading-slug drift test: content-core's extractHeadings() must produce the
// exact ids a real rehype-slug pass produces at render time, including the
// duplicate-heading collision suffixes (-1, -2, …). If they diverge, comment
// anchors registered against the manifest won't match the rendered DOM ids.
import { test, expect } from "bun:test";
import { extractHeadings } from "../slug.mjs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import { visit } from "unist-util-visit";

/** The ids a real remark→rehype→rehype-slug pipeline assigns, in document order. */
function rehypeSlugIds(md) {
  const tree = unified().use(remarkParse).use(remarkRehype).use(rehypeSlug).runSync(
    unified().use(remarkParse).parse(md),
  );
  const ids = [];
  visit(tree, "element", (node) => {
    if (/^h[1-6]$/.test(node.tagName) && node.properties?.id) ids.push(node.properties.id);
  });
  return ids;
}

const MD = [
  "# Read a Delta table",
  "",
  "intro",
  "",
  "## Setup",
  "",
  "body",
  "",
  "## Setup",
  "",
  "duplicate heading, collides to setup-1",
  "",
  "### Nested",
  "",
  "leaf",
].join("\n");

test("extractHeadings ids match a real rehype-slug pass", () => {
  const ours = extractHeadings(MD).map((h) => h.id);
  expect(ours).toEqual(rehypeSlugIds(MD));
  // sanity: the duplicate collides as rehype-slug does
  expect(ours).toContain("setup");
  expect(ours).toContain("setup-1");
});

test("fingerprint is the normalized heading text", () => {
  const h = extractHeadings("# Read a Delta Table\n\nx")[0];
  expect(h.fingerprint).toBe("read a delta table");
  expect(h.level).toBe(1);
  expect(h.order).toBe(0);
});
