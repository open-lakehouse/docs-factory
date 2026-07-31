// blog/rss.xml orders posts by slug (mirroring content.ts:blogPosts), drops
// drafts, and formats pubDate as RFC-822 when a legacy frontmatter date remains.
// Exercises the pure rssItems() + rfc822().
import { expect, test } from "bun:test";
import { rssItems, rfc822 } from "../../../scripts/build-rss.mjs";

function post(slug, date, status = "ready") {
  return {
    absPath: `/blogs/${slug}/index.md`,
    meta: { status, title: slug, slug, ...(date ? { date } : {}) },
    body: "hello",
  };
}

const ORIGIN = "https://example.test";

test("rssItems orders posts by slug", () => {
  const items = rssItems([post("zebra", "2026-01-01"), post("alpha", "2026-03-01")], ORIGIN);
  expect(items.map((i) => i.title)).toEqual(["alpha", "zebra"]);
});

test("rssItems drops draft posts", () => {
  const items = rssItems([post("live", "2026-01-01"), post("wip", "2026-02-01", "draft")], ORIGIN);
  expect(items.map((i) => i.title)).toEqual(["live"]);
});

test("rssItems links to the canonical blog route", () => {
  const items = rssItems([post("my-post", "2026-01-01")], ORIGIN);
  expect(items[0].link).toBe(`${ORIGIN}/blog/my-post`);
});

test("rssItems omits pubDate when frontmatter has no date", () => {
  const items = rssItems([post("undated")], ORIGIN);
  expect(items[0].pubDate).toBe("");
});

test("rfc822 formats an ISO date as an RFC-822 pubDate", () => {
  expect(rfc822("2026-01-02")).toBe("Fri, 02 Jan 2026 00:00:00 GMT");
});

test("rfc822 returns empty string for a missing/invalid date", () => {
  expect(rfc822(undefined)).toBe("");
  expect(rfc822("not-a-date")).toBe("");
});
