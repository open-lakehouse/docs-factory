// Head-metadata builders drive the per-route prerender shell (Phase 0). The
// tricky parts are the description heuristic (prefer summary; else the first
// SUBSTANTIAL prose paragraph, skipping label-only blocks like "**TL;DR**" and
// list continuation lines) and the schema.org type selection per content area.
import { test, expect } from "bun:test";
import { metaDescription, pageTitle, jsonLd, canonicalUrl, pageHead } from "../head.mjs";

const ORIGIN = "https://example.test";

test("metaDescription prefers frontmatter summary", () => {
  const d = metaDescription({ summary: "A crisp summary." }, "Body prose that is long enough.");
  expect(d).toBe("A crisp summary.");
});

test("metaDescription skips a bare **TL;DR** label and picks real prose", () => {
  const body = ["**TL;DR**", "", "- a bullet point that is long enough to look like prose", "", "This is the first real sentence of prose in the document."].join("\n");
  expect(metaDescription({}, body)).toBe("This is the first real sentence of prose in the document.");
});

test("metaDescription skips headings and list blocks entirely", () => {
  const body = ["## Heading", "", "- item one wraps", "  onto a second line here", "", "Actual prose paragraph follows the list."].join("\n");
  expect(metaDescription({}, body)).toBe("Actual prose paragraph follows the list.");
});

test("metaDescription truncates on a word boundary with an ellipsis", () => {
  const long = `${"word ".repeat(80)}`.trim();
  const d = metaDescription({ summary: long }, "", 50);
  expect(d.length).toBeLessThanOrEqual(51); // 50 + ellipsis
  expect(d.endsWith("…")).toBe(true);
  expect(d).not.toContain("  ");
});

test("pageTitle appends the site suffix; empty title is just the suffix", () => {
  expect(pageTitle({ title: "What is Delta Lake?" }, { area: "docs" })).toBe(
    "What is Delta Lake? — Open Lakehouse",
  );
  expect(pageTitle({}, { area: "site" })).toBe("Open Lakehouse");
});

test("canonicalUrl builds an absolute URL from the identity", () => {
  const id = { area: "docs", project: "delta", bucket: "how-to", slug: "read-a-delta-table" };
  expect(canonicalUrl(id, ORIGIN)).toBe(`${ORIGIN}/docs/delta/how-to/read-a-delta-table`);
});

test("jsonLd selects WebSite+Organization for the site root", () => {
  const ld = jsonLd({ identity: { area: "site" }, meta: {}, origin: ORIGIN });
  expect(ld["@graph"].map((n) => n["@type"])).toEqual(["WebSite", "Organization"]);
});

test("jsonLd is TechArticle for docs and BlogPosting for blogs", () => {
  const doc = jsonLd({
    identity: { area: "docs", project: "delta", bucket: "explanation", slug: "x" },
    meta: { title: "T", diataxis: "explanation" },
    origin: ORIGIN,
  });
  expect(doc["@type"]).toBe("TechArticle");
  expect(doc.articleSection).toBe("explanation");

  const blog = jsonLd({
    identity: { area: "blogs", slug: "x" },
    meta: { title: "T", date: "2026-07-03", author: "Robert Pack", tags: ["a", "b"] },
    origin: ORIGIN,
  });
  expect(blog["@type"]).toBe("BlogPosting");
  expect(blog.datePublished).toBe("2026-07-03");
  expect(blog.author).toEqual({ "@type": "Person", name: "Robert Pack" });
});

test("pageHead assembles a canonical, a .md twin alternate, and og/twitter tags", () => {
  const head = pageHead({
    identity: { area: "docs", project: "delta", bucket: "how-to", slug: "read" },
    meta: { title: "Read a table", summary: "How to read." },
    body: "",
    origin: ORIGIN,
  });
  expect(head.canonical).toBe(`${ORIGIN}/docs/delta/how-to/read`);
  expect(head.twin).toBe(`${ORIGIN}/docs/delta/how-to/read.md`);
  expect(head.og.find(([p]) => p === "og:url")[1]).toBe(head.canonical);
  expect(head.title).toBe("Read a table — Open Lakehouse");
});
