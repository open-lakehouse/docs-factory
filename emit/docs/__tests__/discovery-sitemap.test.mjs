// sitemap.xml lists canonical HTML routes only — ready pages present, drafts and
// .md twins absent. Exercises the pure sitemapUrls() over synthetic page records.
import { expect, test } from "bun:test";
import { sitemapUrls } from "../discovery.mjs";

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

test("sitemap includes the site root by default", () => {
  const urls = sitemapUrls([], ORIGIN);
  expect(urls.map((u) => u.loc)).toEqual([ORIGIN]);
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

test("sitemap takes a site's hrefFor, index routes, and inclusion gate", () => {
  const urls = sitemapUrls([READY_DOC, DRAFT_DOC], ORIGIN, {
    hrefFor: (id) => `/${id.bucket}/${id.slug}`,
    indexRoutes: ["/"],
    isIncluded: () => true,
  });
  expect(urls.map((u) => u.loc)).toEqual([
    ORIGIN,
    `${ORIGIN}/how-to/read-a-delta-table`,
    `${ORIGIN}/how-to/wip`,
  ]);
});
