// The `:::tldr` flattening plugin (emit/plugins/remark-tldr-md.mjs) turns a
// key-takeaways container directive into a **TL;DR**-led blockquote — the portable
// form served in the .md twins. Colocated here so CI's `bun test src/content-core`
// picks it up (the emit/ package has no test runner of its own). Driven against a
// hand-built mdast tree so it needs no remark parser (site/ doesn't depend on
// unified); the end-to-end parse→flatten path is covered by emit-one.test.mjs.
import { test, expect } from "bun:test";
import remarkTldrMd from "../../../../emit/plugins/remark-tldr-md.mjs";

/** A minimal containerDirective mdast node for `:::tldr[label?]` with bullet text. */
function tldrTree({ label, bullets }) {
  const children = [];
  if (label) {
    children.push({
      type: "paragraph",
      data: { directiveLabel: true },
      children: [{ type: "text", value: label }],
    });
  }
  children.push({
    type: "list",
    ordered: false,
    children: bullets.map((b) => ({
      type: "listItem",
      children: [{ type: "paragraph", children: [{ type: "text", value: b }] }],
    })),
  });
  return {
    type: "root",
    children: [{ type: "containerDirective", name: "tldr", children }],
  };
}

test(":::tldr becomes a **TL;DR**-led blockquote wrapping the bullets", () => {
  const tree = tldrTree({ bullets: ["first fact", "second fact"] });
  remarkTldrMd()(tree);
  const node = tree.children[0];
  expect(node.type).toBe("blockquote");
  // Lead line is a bold **TL;DR** paragraph.
  const lead = node.children[0];
  expect(lead.type).toBe("paragraph");
  expect(lead.children[0].type).toBe("strong");
  expect(lead.children[0].children[0].value).toBe("TL;DR");
  // The bullet list is preserved after the label.
  expect(node.children[1].type).toBe("list");
});

test(":::tldr[Key takeaways] uses the custom label", () => {
  const tree = tldrTree({ label: "Key takeaways", bullets: ["a fact"] });
  remarkTldrMd()(tree);
  expect(tree.children[0].children[0].children[0].children[0].value).toBe("Key takeaways");
});

test("a non-tldr directive is left untouched", () => {
  const tree = {
    type: "root",
    children: [{ type: "containerDirective", name: "note", children: [] }],
  };
  remarkTldrMd()(tree);
  expect(tree.children[0].type).toBe("containerDirective");
  expect(tree.children[0].name).toBe("note");
});
