// /concepts.json: the site's public projection as one static artifact.
import { expect, test } from "bun:test";
import { publicProjection } from "../../../site/src/content-core/projection.mjs";
import { renderConcepts } from "../discovery.mjs";

const ORIGIN = "https://x.test";
const hrefFor = (id) => `/${id.bucket}/${id.slug}`;
const ready = (bucket, slug, meta = {}) => ({
  identity: { area: "docs", project: "p", bucket, slug },
  meta: { status: "ready", ...meta },
  body: "",
});

const projection = publicProjection({
  model: {
    elements: {
      "lakehouse.table": { kind: "asset", title: "Table", tags: ["public"] },
      ucSpec: { kind: "openSpecification", title: "UC", tags: ["public"] },
      unityCatalogOSS: {
        kind: "implementation",
        title: "UC OSS",
        tags: ["public"],
        links: [{ url: "https://uc.io" }],
      },
      rustfs: { kind: "implementation", title: "RustFS", tags: ["public"] },
    },
    relations: {
      a: { kind: "implements", source: { model: "unityCatalogOSS" }, target: { model: "ucSpec" } },
      b: {
        kind: "operatesOn",
        source: { model: "unityCatalogOSS" },
        target: { model: "lakehouse.table" },
      },
    },
  },
  pages: [ready("how-to", "run-local-server"), ready("how-to", "list")],
  hrefFor,
  origin: ORIGIN,
  registry: {
    "uc/compose.yaml": {
      services: [
        { element: "unityCatalogOSS", role: "data_catalog", url: "http://localhost:8080" },
        { element: "rustfs", role: "object_store", url: null },
      ],
    },
  },
  compat: {
    interfaces: [{ key: "spark", model: "unityCatalogOSS" }],
    journeys: [
      {
        id: "table.list",
        title: "List tables",
        asset: "lakehouse.table",
        cells: {
          spark: {
            proofs: [
              { page: { bucket: "how-to", slug: "list" }, anchor: "a", ready: true, works: true },
            ],
          },
        },
      },
    ],
    verifiedEdges: [
      {
        source: "unityCatalogOSS",
        kind: "implements",
        target: "ucSpec",
        interfaces: ["spark"],
        journeys: ["table.list"],
      },
      {
        source: "unityCatalogOSS",
        kind: "operatesOn",
        target: "lakehouse.table",
        interfaces: ["spark"],
        journeys: ["table.list"],
      },
    ],
  },
});

const out = JSON.parse(
  renderConcepts(projection, {
    title: "Test",
    origin: ORIGIN,
    bundle: `${ORIGIN}/env/b.tar.gz`,
    environments: [
      { key: "uc/compose.yaml", title: "UC", guide: "/how-to/run-local-server#s3" },
      { key: "other/compose.yaml", title: "Other", guide: "/how-to/unpublished" },
    ],
  }),
);

test("concepts, edges, environments, and journeys", () => {
  expect(out.version).toBe(1);
  expect(out.site).toEqual({ title: "Test", origin: ORIGIN });
  expect(out.concepts.map((c) => c.id)).toEqual([
    "lakehouse.table",
    "rustfs",
    "ucSpec",
    "unityCatalogOSS",
  ]);
  expect(out.concepts[3]).toEqual({
    id: "unityCatalogOSS",
    kind: "implementation",
    title: "UC OSS",
    summary: null,
    url: "https://uc.io",
    sameAs: [],
  });
  expect(out.edges).toEqual([
    {
      source: "unityCatalogOSS",
      kind: "implements",
      title: null,
      target: "ucSpec",
      partial: false,
      verified: true,
      journeys: [{ id: "table.list", interface: "spark", page: `${ORIGIN}/how-to/list#a` }],
    },
    {
      source: "unityCatalogOSS",
      kind: "operatesOn",
      title: null,
      target: "lakehouse.table",
      partial: false,
      verified: true,
      journeys: [{ id: "table.list", interface: "spark", page: `${ORIGIN}/how-to/list#a` }],
    },
  ]);
  expect(out.environments[0]).toEqual({
    key: "uc/compose.yaml",
    title: "UC",
    bundle: `${ORIGIN}/env/b.tar.gz`,
    guide: `${ORIGIN}/how-to/run-local-server#s3`,
    services: [
      { element: "unityCatalogOSS", role: "data_catalog", url: "http://localhost:8080" },
      { element: "rustfs", role: "object_store", url: null },
    ],
  });
  // A guide that isn't a ready page of this site isn't linked.
  expect(out.environments[1].guide).toBeNull();
  expect(out.journeys).toHaveLength(1);
});
