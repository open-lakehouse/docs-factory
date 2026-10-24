import { expect, test } from "bun:test";
import remarkLikeC4Views from "../remark-likec4-views.mjs";

const marker = (meta, value = "A client asks the catalog") => ({
  type: "code",
  lang: "likec4",
  meta,
  value,
});

function run(children) {
  const tree = { type: "root", children };
  remarkLikeC4Views()(tree);
  return tree;
}

const attrs = (node) => Object.fromEntries(node.attributes.map((a) => [a.name, a.value]));

test("a likec4 marker becomes <LikeC4View> with its view id and alt text", () => {
  const tree = run([marker("flow", "A client\nasks")]);
  const [imported, view] = tree.children;
  expect(imported.value).toBe('import { LikeC4View } from "@/components/LikeC4View";');
  expect(view.name).toBe("LikeC4View");
  const { viewId, alt, mermaid } = attrs(view);
  expect(viewId).toBe("flow");
  expect(alt.value).toBe('"A client asks"');
  expect(mermaid).toBeUndefined();
});

test("a mermaid fallback fence after the marker becomes its mermaid prop", () => {
  const tree = run([
    marker("flow"),
    { type: "code", lang: "mermaid", meta: "fallback", value: "sequenceDiagram" },
  ]);
  expect(tree.children).toHaveLength(2);
  expect(attrs(tree.children[1]).mermaid.value).toBe('"sequenceDiagram"');
});

test("plain mermaid fences and a marker without a view id are left alone", () => {
  const tree = run([
    { type: "code", lang: "mermaid", meta: null, value: "flowchart LR" },
    marker(null),
    marker("  "),
  ]);
  expect(tree.children.map((n) => n.type)).toEqual(["code", "code", "code"]);
});
