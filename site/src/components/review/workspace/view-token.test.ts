// The tab-token codec carries BOTH a page ref and a view. These tests lock in
// round-tripping, back-compat (a bare ref token = the rendered view, so old
// shared /review URLs keep working), and that a script's fetchUrl survives the
// `#`/`,`/`.`/`/` that would otherwise collide with the token/param delimiters.
import { expect, test } from "bun:test";
import { ContentArea } from "../../../gen/docs_factory/review/v1/messages_pb";
import { blogRef, docRef } from "../../../lib/content-ref";
import { parseTabToken, refTokenOf, tabTokenFor, viewToParam } from "./view-token";

const doc = docRef("delta", "tutorials", "explore-table-history");
const blog = blogRef("my-post");

test("rendered view has no suffix (bare ref token)", () => {
  expect(viewToParam({ kind: "rendered" })).toBe("");
  expect(tabTokenFor(doc, { kind: "rendered" })).toBe("docs:explore-table-history:delta:tutorials");
});

test("a bare ref token parses back as the rendered view (back-compat)", () => {
  const parsed = parseTabToken("docs:explore-table-history:delta:tutorials");
  expect(parsed?.view).toEqual({ kind: "rendered" });
  expect(parsed?.ref.area).toBe(ContentArea.DOCS);
  expect(parsed?.ref.slug).toBe("explore-table-history");
});

test("md view round-trips", () => {
  const token = tabTokenFor(doc, { kind: "md" });
  expect(token).toBe("docs:explore-table-history:delta:tutorials#md");
  const parsed = parseTabToken(token);
  expect(parsed?.view).toEqual({ kind: "md" });
  expect(parsed?.ref.slug).toBe("explore-table-history");
});

test("script view round-trips with an encoded fetchUrl", () => {
  const fetchUrl = "/docs/delta/tutorials/explore-table-history/snippets/explore_delta_history.py";
  const token = tabTokenFor(doc, { kind: "script", fetchUrl });
  // The fetchUrl's slashes/dots are percent-encoded so they can't collide with
  // the `:` ref-field and `,` tab-list delimiters.
  expect(token.includes("#script:")).toBe(true);
  expect(token.includes("/")).toBe(false);
  const parsed = parseTabToken(token);
  expect(parsed?.view).toEqual({ kind: "script", fetchUrl });
});

test("blog refs round-trip through every view", () => {
  for (const view of [{ kind: "rendered" }, { kind: "md" }] as const) {
    const parsed = parseTabToken(tabTokenFor(blog, view));
    expect(parsed?.ref.area).toBe(ContentArea.BLOGS);
    expect(parsed?.view).toEqual(view);
  }
});

test("refTokenOf strips the view suffix to the group key", () => {
  const group = "docs:explore-table-history:delta:tutorials";
  expect(refTokenOf(group)).toBe(group);
  expect(refTokenOf(`${group}#md`)).toBe(group);
  expect(refTokenOf(`${group}#script:%2Ffoo.py`)).toBe(group);
});

test("a malformed ref half is rejected; an unknown view suffix falls back to rendered", () => {
  expect(parseTabToken("garbage")).toBeNull();
  const parsed = parseTabToken("docs:explore-table-history:delta:tutorials#bogus");
  expect(parsed?.view).toEqual({ kind: "rendered" });
});
