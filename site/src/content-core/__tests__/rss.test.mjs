// blog/rss.xml orders posts by date DESC (mirroring content.ts:blogPosts), drops
// drafts, and formats pubDate as RFC-822. Exercises the pure rssItems() + rfc822().
import { test, expect } from "bun:test";
import { rssItems, rfc822 } from "../../../scripts/build-rss.mjs";

const ORIGIN = "https://example.test";

function post(slug, date, status = "ready") {
  return {
    absPath: `/repo/blogs/${slug}/index.md`,
    meta: { status, title: slug, slug, date },
    body: "Body prose long enough to be a real description here.",
  };
}

test("rssItems orders posts by date DESC", () => {
  const items = rssItems([post("old", "2026-01-01"), post("new", "2026-03-01")], ORIGIN);
  expect(items.map((i) => i.title)).toEqual(["new", "old"]);
});

test("rssItems drops draft posts", () => {
  const items = rssItems([post("live", "2026-01-01"), post("wip", "2026-02-01", "draft")], ORIGIN);
  expect(items.map((i) => i.title)).toEqual(["live"]);
});

test("rssItems links to the canonical blog route", () => {
  const items = rssItems([post("my-post", "2026-01-01")], ORIGIN);
  expect(items[0].link).toBe(`${ORIGIN}/blog/my-post`);
});

test("rfc822 formats an ISO date as an RFC-822 pubDate", () => {
  // 2026-01-02 is a Friday.
  expect(rfc822("2026-01-02")).toMatch(/^Fri, 02 Jan 2026 00:00:00 GMT$/);
});

test("rfc822 returns empty string for a missing/invalid date", () => {
  expect(rfc822(undefined)).toBe("");
  expect(rfc822("not-a-date")).toBe("");
});
