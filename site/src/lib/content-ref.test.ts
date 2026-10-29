import { expect, test } from "bun:test";
import { ContentArea } from "../gen/docs_factory/review/v1/messages_pb";
import {
  modelOf,
  modelRef,
  pickOccurrence,
  refFromParam,
  refHref,
  refToParam,
} from "./content-ref";

test("a model ref round-trips through the workspace tab token", () => {
  for (const target of [
    { kind: "element", id: "lakehouse.table" },
    { kind: "view", id: "referenceContext" },
    { kind: "estate" },
  ] as const) {
    const ref = modelRef(target);
    expect(ref.area).toBe(ContentArea.MODEL);
    const back = refFromParam(refToParam(ref));
    expect(back && modelOf(back)).toEqual(target);
  }
});

test("a model ref routes to the Model explorer", () => {
  expect(refHref(modelRef({ kind: "element", id: "lakehouse.table" }))).toBe(
    "/model?el=lakehouse.table",
  );
  expect(refHref(modelRef({ kind: "estate" }))).toBe("/model");
});

test("a malformed model token is rejected", () => {
  expect(refFromParam("model:elements/x::")).toBeNull();
});

test("a preamble anchor links to the page, not a heading", () => {
  const ref = { area: ContentArea.BLOGS, slug: "p" } as Parameters<typeof refHref>[0];
  expect(refHref(ref, "__preamble__")).toBe("/blog/p");
  expect(refHref(ref, "")).toBe("/blog/p");
  expect(refHref(ref, "intro")).toBe("/blog/p#intro");
});

// Two "volumes are" passages, as in the uc-volumes blog.
const page =
  "volumes are a building block. what makes a volume the first thing to note is that volumes are a first class data asset";
const quote = "volumes are";
const occurrences = [page.indexOf(quote), page.lastIndexOf(quote)];

test("a trimmed prefix frames the occurrence it was captured before", () => {
  const picked = pickOccurrence(page, quote.length, occurrences, {
    prefix: "the first thing to note is that",
  });
  expect(picked).toBe(occurrences[1]);
});

test("the suffix frames the occurrence when the prefix no longer does", () => {
  const picked = pickOccurrence(page, quote.length, occurrences, {
    prefix: "edited away",
    suffix: "a first class",
  });
  expect(picked).toBe(occurrences[1]);
});

test("without matching context, the occurrence under the heading wins", () => {
  const heading = page.indexOf("what makes a volume");
  const picked = pickOccurrence(
    page,
    quote.length,
    occurrences,
    { prefix: "gone" },
    {
      from: heading,
    },
  );
  expect(picked).toBe(occurrences[1]);
  expect(pickOccurrence(page, quote.length, occurrences, {})).toBe(occurrences[0]);
});

test("an occurrence inside the section beats a framed one outside it", () => {
  // An applied edit removed the framed original; the copy under the heading stays.
  const heading = page.indexOf("what makes a volume");
  const section = { from: 0, to: heading };
  const ctx = { prefix: "the first thing to note is that" };
  expect(pickOccurrence(page, quote.length, occurrences, ctx, section)).toBe(occurrences[0]);
});

test("outside a section without the quote, every occurrence counts", () => {
  const section = { from: page.indexOf("building"), to: page.indexOf("what makes") };
  const ctx = { prefix: "the first thing to note is that" };
  expect(pickOccurrence(page, quote.length, occurrences, ctx, section)).toBe(occurrences[1]);
});

test("a single occurrence is returned as is", () => {
  expect(pickOccurrence(page, quote.length, [7], { prefix: "nope" })).toBe(7);
});
