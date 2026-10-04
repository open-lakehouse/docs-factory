import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { QualityDimension, RatingSummarySchema } from "../gen/docs_factory/review/v1/messages_pb";
import { marksFrom, nextMark, ratingLabel, splitMarks } from "./rating";

describe("dimension marks", () => {
  test("cycle neutral → strength → weakness → neutral", () => {
    expect(nextMark("neutral")).toBe("strength");
    expect(nextMark("strength")).toBe("weakness");
    expect(nextMark("weakness")).toBe("neutral");
  });

  test("round-trip strengths/weaknesses, dropping neutral", () => {
    const m = marksFrom([QualityDimension.CLARITY], [QualityDimension.TONE]);
    m.set(QualityDimension.ACCURACY, "neutral");
    expect(splitMarks(m)).toEqual({
      strengths: [QualityDimension.CLARITY],
      weaknesses: [QualityDimension.TONE],
    });
  });
});

describe("ratingLabel", () => {
  test("null when unrated", () => {
    expect(ratingLabel(undefined)).toBeNull();
    expect(ratingLabel(create(RatingSummarySchema, { count: 0 }))).toBeNull();
  });

  test("one decimal average with count", () => {
    expect(ratingLabel(create(RatingSummarySchema, { count: 3, average: 4.1666 }))).toBe(
      "★ 4.2 (3)",
    );
  });
});
