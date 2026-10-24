import { expect, test } from "bun:test";
import { sequenceDiagram } from "../likec4-mermaid.mjs";

const node = (id, title) => ({ id, title });
const edge = (id, source, target, label, dir) => ({ id, source, target, label, dir });

test("steps become messages in order, a reply as a dashed arrow", () => {
  const view = {
    id: "v",
    title: "Flow",
    nodes: [node("app.client", "Client"), node("catalog", "Catalog")],
    edges: [
      edge("step-01", "app.client", "catalog", "GET /tables; list"),
      edge("step-02", "catalog", "app.client", "tables\n#1", "back"),
    ],
    flow: ["step-01", "step-02"],
  };
  expect(sequenceDiagram(view)).toBe(
    [
      "---",
      'title: "Flow"',
      "---",
      "sequenceDiagram",
      "  participant app_client as Client",
      "  participant catalog as Catalog",
      "  app_client->>catalog: GET /tables#59; list",
      "  catalog-->>app_client: tables<br/>#35;1",
      "",
    ].join("\n"),
  );
});

test("subflows become fragments, par branches joined by and", () => {
  const view = {
    id: "v",
    nodes: [node("a", "A"), node("b", "B")],
    edges: [
      edge("step-01", "a", "b", "one"),
      edge("step-02.01", "a", "b", "two"),
      edge("step-02.02", "b", "a", "three"),
      edge("step-03.01", "a", "b", "four"),
      edge("step-03.02", "a", "b", "five"),
    ],
    flow: [
      "step-01",
      { _type: "par", id: "step-02", flow: ["step-02.01", "step-02.02"] },
      {
        _type: "alt",
        id: "step-03",
        flow: [
          { _type: "alt-if", id: "step-03.a", title: "cached", flow: ["step-03.01"] },
          { _type: "alt-else", id: "step-03.b", flow: ["step-03.02"] },
        ],
      },
    ],
  };
  expect(sequenceDiagram(view).split("\n").slice(3, -1)).toEqual([
    "  a->>b: one",
    "  par",
    "    a->>b: two",
    "  and",
    "    b->>a: three",
    "  end",
    "  alt cached",
    "    a->>b: four",
    "  else",
    "    a->>b: five",
    "  end",
  ]);
});
