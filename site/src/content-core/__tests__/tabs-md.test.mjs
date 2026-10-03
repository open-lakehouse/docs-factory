// The `:::tab` flattening plugin (emit/plugins/remark-tabs-md.mjs) keeps every
// panel of a tab group in order, each led by its bold label. Hand-built mdast,
// like tldr-md.test.mjs; colocated here so CI's `bun test src/content-core` runs it.
import { expect, test } from "bun:test";
import remarkTabsMd from "../../../../emit/plugins/remark-tabs-md.mjs";

const text = (value) => ({ type: "paragraph", children: [{ type: "text", value }] });
const bold = (value) => ({
  type: "paragraph",
  children: [{ type: "strong", children: [{ type: "text", value }] }],
});
const tab = (label, ...children) => ({
  type: "containerDirective",
  name: "tab",
  children: [
    {
      type: "paragraph",
      data: { directiveLabel: true },
      children: [{ type: "text", value: label }],
    },
    ...children,
  ],
});

test("every tab panel survives in order, led by its bold label", () => {
  const tree = { type: "root", children: [tab("Python SDK", text("py")), tab("CLI", text("sh"))] };
  remarkTabsMd()(tree);
  expect(tree.children).toEqual([bold("Python SDK"), text("py"), bold("CLI"), text("sh")]);
});

test("tabs nested inside another container are flattened in place", () => {
  const step = { type: "containerDirective", name: "journey", children: [tab("A", text("a"))] };
  const tree = { type: "root", children: [step] };
  remarkTabsMd()(tree);
  expect(tree.children[0].children).toEqual([bold("A"), text("a")]);
});

test("the md-twin target registers the tabs construct", async () => {
  const { default: mdTwin } = await import("../../../../emit/targets/md-twin.mjs");
  expect(mdTwin.constructs.tabs).toBe(remarkTabsMd);
});
