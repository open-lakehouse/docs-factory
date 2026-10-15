// docPageHead is the one place a content page's head is built, for the emitted
// site and the review app's Head tab alike.
import { expect, test } from "bun:test";
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
