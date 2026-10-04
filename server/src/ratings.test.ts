// Unit tests for rating validation and row mapping. Run with `bun test`.
import { describe, expect, test } from "bun:test";
import { Exemplar, QualityDimension } from "./gen/docs_factory/review/v1/messages_pb.js";
import {
  type ContentRatingRow,
  dimensionsFromDb,
  MAX_RATING_TEXT,
  ratingFromRow,
  ratingSummaryFromRow,
  validateRating,
} from "./ratings.js";

const base = {
  score: 4,
  strengths: [] as QualityDimension[],
  weaknesses: [] as QualityDimension[],
  exemplar: Exemplar.UNSPECIFIED,
};

describe("validateRating", () => {
  test("accepts a full rating and maps enums to slugs", () => {
    const r = validateRating({
      ...base,
      prosMd: "  clear steps ",
      consMd: "",
      strengths: [
        QualityDimension.CLARITY,
        QualityDimension.RUNNABLE_CODE,
        QualityDimension.CLARITY,
      ],
      weaknesses: [QualityDimension.COMPLETENESS],
      exemplar: Exemplar.GOOD,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        score: 4,
        pros_md: "clear steps",
        cons_md: null,
        strengths: ["clarity", "runnable-code"],
        weaknesses: ["completeness"],
        exemplar: "good",
      },
    });
  });

  test.each([0, 6, 2.5])("rejects score %p", (score) => {
    expect(validateRating({ ...base, score }).ok).toBe(false);
  });

  test("rejects a dimension that is both strength and weakness", () => {
    const r = validateRating({
      ...base,
      strengths: [QualityDimension.TONE],
      weaknesses: [QualityDimension.TONE],
    });
    expect(r.ok).toBe(false);
  });

  test("rejects the unspecified dimension", () => {
    expect(validateRating({ ...base, strengths: [QualityDimension.UNSPECIFIED] }).ok).toBe(false);
  });

  test("rejects overlong text", () => {
    expect(validateRating({ ...base, consMd: "x".repeat(MAX_RATING_TEXT + 1) }).ok).toBe(false);
  });
});

describe("row mapping", () => {
  test("ratingFromRow round-trips enums and jsonb string timestamps", () => {
    const row: ContentRatingRow = {
      id: "r1",
      area: "docs",
      slug: "unitycatalog/how-to/x",
      version_id: "v1",
      git_sha: "abc",
      rater_user_id: "u1",
      rater_login: "alice",
      score: 2,
      pros_md: null,
      cons_md: "outdated",
      strengths: ["structure"],
      weaknesses: ["accuracy", "not-a-dimension"],
      exemplar: "bad",
      superseded_at: "2026-10-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: new Date("2026-09-02T00:00:00Z"),
    };
    const r = ratingFromRow(row);
    expect(r.score).toBe(2);
    expect(r.strengths).toEqual([QualityDimension.STRUCTURE]);
    expect(r.weaknesses).toEqual([QualityDimension.ACCURACY]);
    expect(r.exemplar).toBe(Exemplar.BAD);
    expect(r.superseded).toBe(true);
    expect(r.prosMd).toBeUndefined();
    expect(r.gitSha).toBe("abc");
  });

  test("dimensionsFromDb tolerates null", () => {
    expect(dimensionsFromDb(null)).toEqual([]);
  });

  test("ratingSummaryFromRow parses numeric avg and defaults empties", () => {
    expect(
      ratingSummaryFromRow({
        rating_count: 2,
        rating_avg: "3.5000",
        rating_good: 1,
        rating_bad: 0,
      }),
    ).toMatchObject({ count: 2, average: 3.5, goodCount: 1, badCount: 0 });
    expect(
      ratingSummaryFromRow({
        rating_count: null,
        rating_avg: null,
        rating_good: null,
        rating_bad: null,
      }),
    ).toMatchObject({ count: 0, average: 0 });
  });
});
