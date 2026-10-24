import { expect, test } from "bun:test";
import remarkTrestleViews from "../remark-trestle-views.mjs";

const marker = (meta, value = "The stack") => ({ type: "code", lang: "trestle", meta, value });

function run(children) {
  const tree = { type: "root", children };
  remarkTrestleViews()(tree);
  return tree;
}

const attrs = (node) => Object.fromEntries(node.attributes.map((a) => [a.name, a.value]));

test("a trestle marker becomes <TrestleDiagram> with its snapshot and alt text", () => {
  const tree = run([marker("/assets/trestle/uc/diagram.trestle-graph.json", "The\nstack")]);
  const [imported, diagram] = tree.children;
  expect(imported.value).toBe('import { TrestleDiagram } from "@/components/TrestleDiagram";');
  expect(diagram.name).toBe("TrestleDiagram");
  const { snapshot, alt } = attrs(diagram);
  expect(snapshot).toBe("/assets/trestle/uc/diagram.trestle-graph.json");
  expect(alt.value).toBe('"The stack"');
});

test("other fences and a marker without a ref are left alone", () => {
  const tree = run([
    { type: "code", lang: "mermaid", meta: null, value: "flowchart LR" },
    marker(null),
    marker("  "),
  ]);
  expect(tree.children.map((n) => n.type)).toEqual(["code", "code", "code"]);
});

test("a mermaid fallback fence after the marker becomes its mermaid prop", () => {
  const tree = run([
    marker("/s.trestle-graph.json"),
    { type: "code", lang: "mermaid", meta: "fallback", value: "flowchart LR\n  a --> b" },
    { type: "code", lang: "mermaid", meta: null, value: "flowchart LR" },
  ]);
  const [, diagram, kept] = tree.children;
  expect(attrs(diagram).mermaid.value).toBe('"flowchart LR\\n  a --> b"');
  expect(kept.type).toBe("code");
  expect(tree.children).toHaveLength(3);
});
