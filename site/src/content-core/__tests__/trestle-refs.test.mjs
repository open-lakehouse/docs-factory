// nodeConcepts / buildTrestleRefs: a diagram node's model concepts, public-only on a site.
import { expect, test } from "bun:test";
import {
  buildTrestleRefs,
  nodeAssets,
  nodeConcepts,
  TRESTLE_REFS_FORMAT,
} from "../trestle-refs.mjs";

const context = {
  roles: {
    data_catalog: { target: "lakehouse.catalog", scope: "full" },
    policy: { target: "lakehouse.governance.authorization", scope: "partial" },
    gateway: { unmapped: "infrastructure" },
  },
  concepts: {
    "lakehouse.catalog": {},
    "lakehouse.governance.authorization": {},
    unityCatalogServer: { assets: ["lakehouse.table", "lakehouse.sqlView"] },
    "lakehouse.table": {},
    "lakehouse.sqlView": {},
  },
};

const node = (over) => ({
  id: "unity-catalog",
  model: "unityCatalogServer",
  role: "data_catalog",
  ...over,
});

test("a node maps to its implementation and its role's concept", () => {
  expect(nodeConcepts(node(), context.roles)).toEqual({
    name: "unityCatalogServer",
    role: { id: "lakehouse.catalog", scope: "full" },
  });
  expect(nodeConcepts(node({ role: "policy" }), context.roles).role).toEqual({
    id: "lakehouse.governance.authorization",
    scope: "partial",
  });
});

test("unmapped roles and the clients node have no concept", () => {
  expect(nodeConcepts(node({ role: "gateway" }), context.roles).role).toBeNull();
  expect(nodeConcepts({ id: "@clients", model: null, role: null }, context.roles)).toEqual({
    name: null,
    role: null,
  });
});

test("refs keep only public concepts, and drop roles pointing at the rest", () => {
  const elements = {
    "lakehouse.catalog": {
      title: "Catalog",
      kind: "capability",
      summary: "Names data.",
      public: true,
    },
    "lakehouse.governance.authorization": {
      title: "Authorization",
      kind: "concern",
      public: false,
    },
    "lakehouse.table": { title: "Table", kind: "asset", summary: null, public: true },
    "lakehouse.sqlView": { title: "View", kind: "asset", summary: null, public: false },
    unityCatalogServer: {
      title: "Unity Catalog (OSS)",
      kind: "implementation",
      summary: null,
      public: true,
    },
  };
  const refs = buildTrestleRefs({
    context,
    element: (id) => elements[id] ?? null,
    href: (id) => (id === "lakehouse.catalog" ? "/docs/explanation/catalog" : null),
  });
  expect(refs.format).toBe(TRESTLE_REFS_FORMAT);
  expect(Object.keys(refs.concepts)).toEqual([
    "lakehouse.catalog",
    "lakehouse.table",
    "unityCatalogServer",
  ]);
  expect(refs.concepts["lakehouse.catalog"]).toEqual({
    title: "Catalog",
    kind: "capability",
    kindLabel: "Capability",
    summary: "Names data.",
    href: "/docs/explanation/catalog",
  });
  expect(refs.concepts.unityCatalogServer.href).toBeNull();
  // a non-public asset drops out of the list, and an empty list is left out
  expect(refs.concepts.unityCatalogServer.assets).toEqual(["lakehouse.table"]);
  expect(refs.concepts["lakehouse.catalog"]).not.toHaveProperty("assets");
  expect(refs.concepts["lakehouse.table"].kindLabel).toBe("Asset kind");
  expect(refs.roles).toEqual({ data_catalog: { concept: "lakehouse.catalog", scope: "full" } });
  // refs.json's role map reads the same way as the context's.
  expect(nodeConcepts(node(), refs.roles).role).toEqual({ id: "lakehouse.catalog", scope: "full" });
});

test("a node lists the asset kinds its implementation manages", () => {
  expect(nodeAssets(node(), context.concepts)).toEqual(["lakehouse.table", "lakehouse.sqlView"]);
  expect(nodeAssets(node({ model: "lakehouse.catalog" }), context.concepts)).toEqual([]);
  expect(nodeAssets({ id: "@clients", model: null }, context.concepts)).toEqual([]);
});
