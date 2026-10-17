import { expect, test } from "bun:test";
import remarkTrestleViews from "../remark-trestle-views.mjs";

const image = (url, title, alt = "The stack") => ({
  type: "paragraph",
  children: [{ type: "image", url, title, alt }],
});

function run(children) {
  const tree = { type: "root", children };
  remarkTrestleViews()(tree);
  return tree;
}

const attrs = (node) => Object.fromEntries(node.attributes.map((a) => [a.name, a.value]));

test("a sole trestle= image becomes <TrestleDiagram> with its sibling snapshot", () => {
  const tree = run([image("/assets/trestle/uc.png", "trestle=unitycatalog")]);
  const [imported, diagram] = tree.children;
  expect(imported.value).toBe('import { TrestleDiagram } from "@/components/TrestleDiagram";');
  expect(diagram.name).toBe("TrestleDiagram");
  const { image: src, snapshot, alt } = attrs(diagram);
  expect(src).toBe("/assets/trestle/uc.png");
  expect(snapshot).toBe("/assets/trestle/uc.trestle-graph.json");
  expect(alt.value).toBe('"The stack"');
});

test("other images, inline ones, and non-PNGs are left alone", () => {
  const inline = {
    type: "paragraph",
    children: [{ type: "text", value: "see " }, image("a.png", "trestle=x").children[0]],
  };
  const tree = run([image("a.png", "likec4=v"), image("a.svg", "trestle=x"), inline]);
  expect(tree.children.map((n) => n.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
});
