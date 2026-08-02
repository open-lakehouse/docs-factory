// sitemap.xml lists canonical HTML routes only — ready pages present, drafts and
// .md twins absent. Exercises the pure sitemapUrls() over synthetic page records.
import { expect, test } from "bun:test";
import { sitemapUrls } from "../../../scripts/build-sitemap.mjs";

const ORIGIN = "https://example.test";

const READY_DOC = {
  absPath: "/repo/content/delta/how-to/read-a-delta-table/index.md",
  meta: { status: "ready", title: "Read", date: "2026-01-02" },
};
const DRAFT_DOC = {
  absPath: "/repo/content/delta/how-to/wip/index.md",
  meta: { status: "draft", title: "WIP" },
};

test("sitemap includes ready pages at their canonical HTML route", () => {
  const urls = sitemapUrls([READY_DOC], ORIGIN);
  const locs = urls.map((u) => u.loc);
  expect(locs).toContain(`${ORIGIN}/docs/delta/how-to/read-a-delta-table`);
});

test("sitemap excludes draft pages", () => {
  const urls = sitemapUrls([DRAFT_DOC], ORIGIN);
  expect(urls.some((u) => u.loc.includes("/wip"))).toBe(false);
});

test("sitemap includes the synthetic index routes", () => {
  const urls = sitemapUrls([], ORIGIN);
  const locs = urls.map((u) => u.loc);
  expect(locs).toContain(ORIGIN); // "/"
  expect(locs).toContain(`${ORIGIN}/docs`);
  expect(locs).toContain(`${ORIGIN}/blog`);
});

test("sitemap never lists a .md twin URL", () => {
  const urls = sitemapUrls([READY_DOC], ORIGIN);
  expect(urls.some((u) => u.loc.endsWith(".md"))).toBe(false);
});

test("lastmod uses the frontmatter date when it is ISO", () => {
  const urls = sitemapUrls([READY_DOC], ORIGIN);
  const entry = urls.find((u) => u.loc.endsWith("read-a-delta-table"));
  expect(entry.lastmod).toBe("2026-01-02");
});
