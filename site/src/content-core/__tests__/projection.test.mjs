// publicProjection: #public elements and ready pages only, rebuilt from allow-listed fields.
import { expect, test } from "bun:test";
import { modelLinkIds, publicProjection } from "../projection.mjs";

const ORIGIN = "https://docs.example.io";
const hrefFor = (identity) => (identity.slug ? `/${identity.bucket}/${identity.slug}` : null);
const page = (bucket, slug, meta, body = "") => ({
  identity: { area: "docs", project: "p", bucket, slug },
  meta: { project: "p", ...meta },
  body,
});

const MODEL = {
  elements: {
    "lakehouse.catalog": {
      kind: "capability",
      title: "Catalog",
      tags: ["public"],
      summary: { txt: "The metadata authority." },
      metadata: { designDoc: "design/catalog.md" },
    },
    "lakehouse.table": { kind: "asset", title: "Table", tags: ["public"] },
    unityCatalogSpec: {
      kind: "openSpecification",
      title: "Unity Catalog",
      tags: ["public"],
      description: { txt: "Open catalog spec. More." },
      links: [{ url: "https://unitycatalog.io" }],
    },
    unityCatalogServer: {
      kind: "implementation",
      title: "Unity Catalog (OSS)",
      tags: ["service", "public"],
      links: [{ url: "https://github.com/unitycatalog/unitycatalog" }],
    },
    headwaters: { kind: "implementation", title: "Headwaters", tags: ["service"] },
  },
  relations: {
    a: {
      kind: "specifies",
      source: { model: "unityCatalogSpec" },
      target: { model: "lakehouse.catalog" },
    },
    b: {
      kind: "implements",
      source: { model: "unityCatalogServer" },
      target: { model: "unityCatalogSpec" },
    },
    d: {
      kind: "operatesOn",
      source: { model: "unityCatalogServer" },
      target: { model: "lakehouse.table" },
    },
    c: {
      kind: "realizes",
      tags: ["partial"],
      source: { model: "headwaters" },
      target: { model: "lakehouse.catalog" },
    },
  },
};

const PAGES = [
  page("explanation", "catalog", { status: "ready", explains: "lakehouse.catalog" }),
  page("explanation", "draft-spec", { status: "draft", explains: "unityCatalogSpec" }),
  page(
    "how-to",
    "list",
    { status: "ready", references: ["unityCatalogSpec", "lakehouse.table", "headwaters"] },
    "Use [UC](model:unityCatalogServer) and [hw](model:headwaters).",
  ),
];

const COMPAT = {
  interfaces: [{ key: "spark", model: "unityCatalogServer" }],
  journeys: [
    {
      id: "table.list",
      title: "List tables",
      asset: "lakehouse.table",
      cells: {
        spark: {
          proofs: [
            {
              script: "content/p/how-to/list/snippets/x.py",
              page: { project: "p", bucket: "how-to", slug: "list" },
              anchor: "go",
              ready: true,
              works: true,
            },
            {
              script: "content/p/explanation/draft-spec/snippets/y.py",
              page: { project: "p", bucket: "explanation", slug: "draft-spec" },
              ready: true,
              works: true,
            },
          ],
        },
        duckdb: {
          proofs: [{ page: { project: "p", bucket: "how-to", slug: "list" }, works: false }],
        },
      },
    },
  ],
  verifiedEdges: [
    {
      source: "unityCatalogServer",
      kind: "implements",
      target: "unityCatalogSpec",
      interfaces: ["spark"],
      journeys: ["table.list"],
    },
    {
      source: "unityCatalogServer",
      kind: "operatesOn",
      target: "lakehouse.table",
      interfaces: ["spark"],
      journeys: ["table.list"],
    },
  ],
};

const REGISTRY = {
  "uc/compose.yaml": {
    services: [
      {
        node: "unity-catalog",
        element: "unityCatalogServer",
        role: "data_catalog",
        url: "http://x",
      },
      { node: "hw", element: "headwaters", role: "lineage", url: null },
    ],
  },
};

const p = publicProjection({
  model: MODEL,
  pages: PAGES,
  hrefFor,
  origin: ORIGIN,
  registry: REGISTRY,
  compat: COMPAT,
});

test("only #public elements, with allow-listed fields", () => {
  expect(p.isPublic("headwaters")).toBe(false);
  expect(p.element("lakehouse.catalog")).toEqual({
    id: "lakehouse.catalog",
    kind: "capability",
    title: "Catalog",
    summary: "The metadata authority.",
    page: "/explanation/catalog",
    url: `${ORIGIN}/explanation/catalog`,
    sameAs: [],
  });
});

test("a draft explainer doesn't give an element a page", () => {
  expect(p.element("unityCatalogSpec")).toMatchObject({
    page: null,
    url: "https://unitycatalog.io",
    summary: "Open catalog spec.",
    sameAs: [],
  });
});

test("edges need both ends public", () => {
  expect(p.edges().map((e) => `${e.source} ${e.kind} ${e.target}`)).toEqual([
    "unityCatalogServer implements unityCatalogSpec",
    "unityCatalogServer operatesOn lakehouse.table",
    "unityCatalogSpec specifies lakehouse.catalog",
  ]);
});

test("journeys count only working proofs on this site's ready pages", () => {
  expect(p.journeys()).toEqual([
    {
      id: "table.list",
      title: "List tables",
      asset: "lakehouse.table",
      interface: "spark",
      element: "unityCatalogServer",
      pages: [`${ORIGIN}/how-to/list#go`],
    },
  ]);
  const edge = p.edges().find((e) => e.kind === "implements");
  expect(edge.verified).toBe(true);
  expect(edge.journeys).toEqual([
    { id: "table.list", interface: "spark", page: `${ORIGIN}/how-to/list#go` },
  ]);
  expect(p.edges().find((e) => e.kind === "operatesOn")).toMatchObject({
    verified: true,
    journeys: [{ id: "table.list", interface: "spark", page: `${ORIGIN}/how-to/list#go` }],
  });
  expect(p.edges().find((e) => e.kind === "specifies").verified).toBe(false);
});

test("environment services drop non-public elements", () => {
  expect(p.services("uc/compose.yaml").map((s) => [s.id, s.role, s.endpoint])).toEqual([
    ["unityCatalogServer", "data_catalog", "http://x"],
  ]);
  expect(p.services("missing/compose.yaml")).toEqual([]);
});

test("a page is about its concepts and assets, and mentions software and specs", () => {
  expect(p.pageConcepts(PAGES[2])).toEqual({
    about: ["lakehouse.table"],
    mentions: ["unityCatalogSpec", "unityCatalogServer"],
  });
  expect(p.pageConcepts(PAGES[0])).toEqual({ about: ["lakehouse.catalog"], mentions: [] });
  expect(p.pageConcepts(PAGES[1])).toEqual({ about: [], mentions: [] });
});

test("modelLinkIds finds body model: links", () => {
  expect(modelLinkIds("[a](model:x.y) and [b](model:z)")).toEqual(["x.y", "z"]);
});
