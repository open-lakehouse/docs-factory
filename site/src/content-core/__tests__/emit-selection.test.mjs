// Which frontmatter statuses an emit ships: `ready` always, `draft` only in a
// `--drafts` preview, `private` and `idea` never.
import { expect, test } from "bun:test";
import { isEmitted, isPublic } from "../frontmatter.mjs";

test("a publish emit selects ready pages only", () => {
  expect(isEmitted({ status: "ready" })).toBe(true);
  for (const status of ["draft", "idea", "private"]) {
    expect(isEmitted({ status })).toBe(false);
  }
});

test("a drafts preview adds draft pages but never private or idea", () => {
  expect(isEmitted({ status: "ready" }, { drafts: true })).toBe(true);
  expect(isEmitted({ status: "draft" }, { drafts: true })).toBe(true);
  expect(isEmitted({ status: "private" }, { drafts: true })).toBe(false);
  expect(isEmitted({ status: "idea" }, { drafts: true })).toBe(false);
});

test("an unset status is a draft", () => {
  expect(isEmitted({})).toBe(false);
  expect(isEmitted({}, { drafts: true })).toBe(true);
  expect(isPublic({})).toBe(false);
});

test("private is never public", () => {
  expect(isPublic({ status: "private" })).toBe(false);
});
