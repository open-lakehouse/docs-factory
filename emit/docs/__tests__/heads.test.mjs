// docPageHead is the one place a content page's head is built, for the emitted
// site and the review app's Head tab alike.
import { expect, test } from "bun:test";
import { publicProjection } from "../../../site/src/content-core/projection.mjs";
import { docPageHead } from "../heads.mjs";
import { DOCS_SITES } from "../sites/index.mjs";
import uc from "../sites/unitycatalog-docs.mjs";

const page = {
  identity: { area: "docs", project: "unitycatalog", bucket: "how-to", slug: "create-tables" },
  meta: { title: "Create tables", diataxis: "how-to" },
  body: "# Create tables\n\nCreate a managed or external table in Unity Catalog.\n",
};

test("docPageHead uses the site's origin, routes, and title", () => {
  const head = docPageHead(uc, page);
  expect(head.canonical).toBe(`${uc.origin}/how-to/create-tables`);
  expect(head.twin).toBe(`${uc.origin}/how-to/create-tables.md`);
  expect(head.title).toBe(`Create tables — ${uc.title}`);
  expect(head.jsonLd).toMatchObject({
    "@type": "TechArticle",
    headline: "Create tables",
    url: `${uc.origin}/how-to/create-tables`,
    description: "Create a managed or external table in Unity Catalog.",
    isPartOf: { "@type": "TechArticle", name: `${uc.title} documentation` },
  });
});

test("DOCS_SITES has one site per project", () => {
  const projects = DOCS_SITES.map((s) => s.project);
  expect(new Set(projects).size).toBe(projects.length);
  expect(projects).toContain("unitycatalog");
  expect(projects).toContain("delta");
});

const MODEL = {
  elements: {
    "lakehouse.table": {
      kind: "asset",
      title: "Table",
      tags: ["public"],
      summary: { txt: "Rows and columns." },
    },
    ucSpec: {
      kind: "openSpecification",
      title: "Unity Catalog",
      tags: ["public"],
      links: [{ url: "https://unitycatalog.io" }],
    },
    unityCatalogOSS: {
      kind: "implementation",
      title: "Unity Catalog (OSS)",
      tags: ["public"],
      links: [{ url: "https://github.com/unitycatalog/unitycatalog" }],
    },
    headwaters: { kind: "implementation", title: "Headwaters" },
  },
};
const ready = {
  ...page,
  meta: {
    ...page.meta,
    status: "ready",
    project: "unitycatalog",
    references: ["lakehouse.table", "ucSpec", "headwaters"],
  },
};
const projection = publicProjection({
  model: MODEL,
  pages: [ready],
  hrefFor: uc.hrefFor,
  origin: uc.origin,
  registry: {
    "unitycatalog/compose.yaml": {
      services: [
        { element: "unityCatalogOSS", role: "data_catalog", url: "http://localhost:8080" },
        { element: "headwaters", role: "lineage", url: null },
      ],
    },
  },
});
const ENV = {
  key: "unitycatalog/compose.yaml",
  title: "Unity Catalog 0.7.0",
  bundleUrl: `${uc.origin}/env/unitycatalog.tar.gz`,
};
const SET = `${uc.origin}/concepts.json`;

test("a how-to that runs an environment is a HowTo with its public tools", () => {
  const ld = docPageHead(uc, ready, { projection, environment: ENV }).jsonLd;
  expect(ld["@type"]).toEqual(["TechArticle", "HowTo"]);
  expect(ld.about).toEqual([
    {
      "@type": "DefinedTerm",
      "@id": `${SET}#lakehouse.table`,
      name: "Table",
      description: "Rows and columns.",
      inDefinedTermSet: { "@type": "DefinedTermSet", url: SET },
    },
  ]);
  expect(ld.mentions).toEqual([
    {
      "@type": "DefinedTerm",
      "@id": `${SET}#ucSpec`,
      name: "Unity Catalog",
      url: "https://unitycatalog.io",
      inDefinedTermSet: { "@type": "DefinedTermSet", url: SET },
    },
  ]);
  expect(ld.tool).toEqual([
    {
      "@type": ["HowToTool", "SoftwareApplication"],
      "@id": `${SET}#unityCatalogOSS`,
      name: "Unity Catalog (OSS)",
      url: "https://github.com/unitycatalog/unitycatalog",
    },
  ]);
  expect(ld.dependencies).toBe(`Unity Catalog 0.7.0: ${uc.origin}/env/unitycatalog.tar.gz`);
  expect(JSON.stringify(ld)).not.toContain("headwaters");
});

test("an explanation, or a page without an environment, stays a TechArticle", () => {
  const explanation = { ...ready, meta: { ...ready.meta, diataxis: "explanation" } };
  const ld = docPageHead(uc, explanation, { projection, environment: ENV }).jsonLd;
  expect(ld["@type"]).toBe("TechArticle");
  expect(ld.tool).toBeUndefined();
  expect(ld.about).toHaveLength(1);
  expect(docPageHead(uc, ready, { projection }).jsonLd["@type"]).toBe("TechArticle");
});

test("a draft page names no concepts, even with a projection", () => {
  const draft = { ...ready, meta: { ...ready.meta, status: "draft" } };
  const ld = docPageHead(uc, draft, { projection, environment: ENV }).jsonLd;
  expect(ld["@type"]).toBe("TechArticle");
  expect(ld.about).toBeUndefined();
  expect(ld.mentions).toBeUndefined();
  expect(ld.dependencies).toBeUndefined();
});
