// Search records over a rendered page body: section anchors, and text clean
// enough to show as a result excerpt.
import { expect, test } from "bun:test";
import { extractHeadings } from "../../../site/src/content-core/slug.mjs";
import { searchRecords } from "../search.mjs";

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
