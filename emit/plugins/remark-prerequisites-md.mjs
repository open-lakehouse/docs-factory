/**
 * remark-prerequisites-md — the .md-twin flattening of `:::prerequisites`: a
 * blockquote led by **Prerequisites**.
 * Mirrors remark-tldr-md.mjs; runs before it so the result is plain Markdown
 * by the time the other constructs walk the tree.
 */
import { takeDirectiveLabel } from "../../site/src/plugins/lib/mdx-helpers.mjs";

const strong = (value) => ({
  type: "paragraph",
  children: [{ type: "strong", children: [{ type: "text", value }] }],
});

function flatten(node) {
  if (!node.children) return;
  const out = [];
  for (const child of node.children) {
    if (child.type === "containerDirective" && child.name === "prerequisites") {
      const title = takeDirectiveLabel(child) ?? "Prerequisites";
      flatten(child);
      out.push({ type: "blockquote", children: [strong(title), ...child.children] });
    } else {
      flatten(child);
      out.push(child);
    }
  }
  node.children = out;
}

export default function remarkPrerequisitesMd() {
  return flatten;
}
