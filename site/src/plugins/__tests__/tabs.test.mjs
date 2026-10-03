// remark-tabs grouping. Trees are hand-built in the shape remark-directive
// produces (a `[label]` becomes a leading paragraph flagged `directiveLabel`).
import { expect, test } from "bun:test";
import remarkTabs from "../remark-tabs.mjs";

const text = (value) => ({ type: "paragraph", children: [{ type: "text", value }] });

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

function run(children) {
  const tree = { type: "root", children };
  remarkTabs()(tree);
  return tree;
}

const groups = (tree) => tree.children.filter((n) => n.name === "ContentTabs");
const labels = (group) => group.children.map((p) => p.attributes[0].value);

test("adjacent tabs form one group with their labels", () => {
  const tree = run([tab("Python SDK", text("py")), tab("CLI", text("sh"))]);
  expect(groups(tree)).toHaveLength(1);
  expect(labels(groups(tree)[0])).toEqual(["Python SDK", "CLI"]);
  // The label paragraph is consumed; only the body remains in the panel.
  expect(groups(tree)[0].children[0].children).toEqual([text("py")]);
});

test("a node between tabs starts a new group", () => {
  const tree = run([tab("A"), text("between"), tab("B"), tab("C")]);
  expect(groups(tree).map(labels)).toEqual([["A"], ["B", "C"]]);
  // children[0] is the injected import.
  expect(tree.children[2]).toEqual(text("between"));
});

test("tabs nested in other containers are grouped, and the import is injected once", () => {
  const callout = { type: "containerDirective", name: "note", children: [tab("A"), tab("B")] };
  const tree = run([callout]);
  expect(tree.children[0].type).toBe("mdxjsEsm");
  expect(tree.children.filter((n) => n.type === "mdxjsEsm")).toHaveLength(1);
  expect(labels(tree.children[1].children[0])).toEqual(["A", "B"]);
});

test("a tab without a label gets a positional name", () => {
  const tree = run([{ type: "containerDirective", name: "tab", children: [text("x")] }]);
  expect(labels(groups(tree)[0])).toEqual(["Tab 1"]);
});

test("no tabs means no import", () => {
  const tree = run([text("plain")]);
  expect(tree.children).toEqual([text("plain")]);
});
