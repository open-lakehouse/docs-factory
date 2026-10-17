// nodeConcepts / buildTrestleRefs: a diagram node's model concepts, public-only on a site.
import { expect, test } from "bun:test";
import { buildTrestleRefs, nodeConcepts, TRESTLE_REFS_FORMAT } from "../trestle-refs.mjs";

const context = {
  roles: {
    data_catalog: { target: "lakehouse.catalog", scope: "full" },
    policy: { target: "lakehouse.governance.authorization", scope: "partial" },
    gateway: { unmapped: "infrastructure" },
  },
  concepts: {
    "lakehouse.catalog": {},
    "lakehouse.governance.authorization": {},
    unityCatalogOSS: {},
  },
};

const node = (over) => ({
  id: "unity-catalog",
  model: "unityCatalogOSS",
  role: "data_catalog",
  ...over,
});

test("a node maps to its implementation and its role's concept", () => {
  expect(nodeConcepts(node(), context.roles)).toEqual({
    name: "unityCatalogOSS",
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
    unityCatalogOSS: {
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
  expect(Object.keys(refs.concepts)).toEqual(["lakehouse.catalog", "unityCatalogOSS"]);
  expect(refs.concepts["lakehouse.catalog"]).toEqual({
    title: "Catalog",
    kind: "capability",
    kindLabel: "Capability",
    summary: "Names data.",
    href: "/docs/explanation/catalog",
  });
  expect(refs.concepts.unityCatalogOSS.href).toBeNull();
  expect(refs.roles).toEqual({ data_catalog: { concept: "lakehouse.catalog", scope: "full" } });
  // refs.json's role map reads the same way as the context's.
  expect(nodeConcepts(node(), refs.roles).role).toEqual({ id: "lakehouse.catalog", scope: "full" });
});
