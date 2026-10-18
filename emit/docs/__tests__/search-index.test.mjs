// Search records over a rendered page body: section anchors, and text clean
// enough to show as a result excerpt.
import { expect, test } from "bun:test";
import { extractHeadings } from "../../../site/src/content-core/slug.mjs";
import { searchContext, searchRecords } from "../search.mjs";

const page = { route: "/how-to/demo", title: "Demo", section: ["Start here"] };
const body = `Read the **intro** first.

## Create a catalog

Run \`CREATE CATALOG\` from the CLI.

\`\`\`sql
SELECT secret_code_token;
\`\`\`

:::tip[Heads up]
Catalogs are *cheap*.
:::

### Options

| Flag | Meaning |
| --- | --- |
| \`--name\` | The catalog |

## Create a catalog

::::tab{label="CLI"}
Again.

## Inside a tab

Still tabbed.
::::
`;

test("one record per section, anchored to the rehype-slug ids", () => {
  const records = searchRecords(page, body);
  expect(records.map((r) => r.anchor)).toEqual([null, ...extractHeadings(body).map((h) => h.id)]);
  expect(records.map((r) => r.id)).toEqual([
    "/how-to/demo",
    "/how-to/demo#create-a-catalog",
    "/how-to/demo#options",
    "/how-to/demo#create-a-catalog-1",
    "/how-to/demo#inside-a-tab",
  ]);
  expect(records[0]).toMatchObject({ page: "Demo", heading: null, section: ["Start here"] });
  expect(records[0].text).toBe("Read the intro first.");
});

test("text keeps case and inline code, drops fences, directive markers, and the heading", () => {
  const [, create, options] = searchRecords(page, body);
  expect(create.heading).toBe("Create a catalog");
  expect(create.text).toBe("Run CREATE CATALOG from the CLI. Heads up Catalogs are cheap.");
  expect(create.text).not.toContain("secret_code_token");
  expect(options.text).toBe("Flag Meaning --name The catalog");
});

test("a directive cut by a heading leaves no stray fence", () => {
  const records = searchRecords(page, body);
  expect(records.at(-2).text).toBe("Again.");
  expect(records.at(-1).text).toBe("Still tabbed.");
});

const model = {
  elements: new Map([
    ["lakehouse.table", { title: "Table", public: true }],
    ["credentialVending", { title: "Credential vending", public: true }],
    ["apacheSpark", { title: "Apache Spark", public: true }],
    ["internalThing", { title: "Internal thing", public: false }],
  ]),
};
const identity = { project: "unitycatalog", bucket: "how-to", slug: "demo" };
const proof = (slug, works) => ({ page: { ...identity, slug }, works });
const compat = {
  interfaces: [
    { key: "spark", label: "Spark", model: "apacheSpark" },
    { key: "duckdb", label: "DuckDB", model: "duckdb" },
  ],
  journeys: [
    { title: "List tables", cells: { spark: { proofs: [proof("demo", true)] } } },
    { title: "Create a managed table", cells: { duckdb: { proofs: [proof("demo", false)] } } },
    { title: "Read a view", cells: { duckdb: { proofs: [proof("other", true)] } } },
  ],
};

test("context names public concepts and the journeys the page proves", () => {
  const context = searchContext(
    {
      identity,
      meta: {
        summary: "Make a demo.",
        explains: "credentialVending",
        references: ["lakehouse.table", "internalThing", "missing"],
      },
      body: "See [the table](model:lakehouse.table) and [it](model:internalThing).",
    },
    { model, compat },
  );
  expect(context).toEqual({
    summary: "Make a demo.",
    explains: "Credential vending",
    concepts: "Table List tables Spark Apache Spark",
  });
});

test("an internal explained element and absent compat leave empty context", () => {
  const context = searchContext(
    { identity, meta: { explains: "internalThing" }, body: "" },
    { model, compat: null },
  );
  expect(context).toEqual({ summary: null, explains: null, concepts: "" });
});

test("context lands on the page record only", () => {
  const context = { summary: "S", explains: "Table", concepts: "Spark" };
  const [first, ...rest] = searchRecords(page, body, context);
  expect(first).toMatchObject(context);
  for (const r of rest) expect(r).not.toHaveProperty("concepts");
});
