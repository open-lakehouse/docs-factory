// Quality ratings: validation of RecordRating input plus DB row <-> proto
// mapping. Pure, so the handler logic in review.ts stays SQL + orchestration.
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { areaFromDb } from "./db-map.js";
import {
  ContentRefSchema,
  Exemplar,
  QualityDimension,
  type Rating,
  RatingSchema,
  type RatingSummary,
  RatingSummarySchema,
} from "./gen/docs_factory/review/v1/messages_pb.js";

export const MAX_RATING_TEXT = 8000;

const DIMENSION_TO_DB: Record<number, string> = {
  [QualityDimension.ACCURACY]: "accuracy",
  [QualityDimension.CLARITY]: "clarity",
  [QualityDimension.STRUCTURE]: "structure",
  [QualityDimension.COMPLETENESS]: "completeness",
  [QualityDimension.RUNNABLE_CODE]: "runnable-code",
  [QualityDimension.TONE]: "tone",
};
const DIMENSION_FROM_DB = new Map(
  Object.entries(DIMENSION_TO_DB).map(([k, v]) => [v, Number(k) as QualityDimension]),
);

export function dimensionToDb(d: QualityDimension): string {
  const slug = DIMENSION_TO_DB[d];
  if (!slug) throw new Error(`unsupported quality dimension: ${d}`);
  return slug;
}

/** Unknown slugs (from a newer server writing the same table) are dropped. */
export function dimensionsFromDb(slugs: string[] | null): QualityDimension[] {
  return (slugs ?? []).flatMap((s) => {
    const d = DIMENSION_FROM_DB.get(s);
    return d === undefined ? [] : [d];
  });
}

export function exemplarToDb(e: Exemplar): "good" | "bad" | null {
  if (e === Exemplar.GOOD) return "good";
  if (e === Exemplar.BAD) return "bad";
  return null;
}

export function exemplarFromDb(e: string | null): Exemplar {
  if (e === "good") return Exemplar.GOOD;
  if (e === "bad") return Exemplar.BAD;
  return Exemplar.UNSPECIFIED;
}

export interface RatingInput {
  score: number;
  prosMd?: string;
  consMd?: string;
  strengths: QualityDimension[];
  weaknesses: QualityDimension[];
  exemplar: Exemplar;
}

export interface ValidRating {
  score: number;
  pros_md: string | null;
  cons_md: string | null;
  strengths: string[];
  weaknesses: string[];
  exemplar: "good" | "bad" | null;
}

export type ValidationResult = { ok: true; value: ValidRating } | { ok: false; error: string };

function cleanText(s: string | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

export function validateRating(input: RatingInput): ValidationResult {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    return { ok: false, error: "score must be an integer from 1 to 5" };
  }
  const pros = cleanText(input.prosMd);
  const cons = cleanText(input.consMd);
  if ((pros?.length ?? 0) > MAX_RATING_TEXT || (cons?.length ?? 0) > MAX_RATING_TEXT) {
    return { ok: false, error: `pros/cons are limited to ${MAX_RATING_TEXT} characters` };
  }
  let strengths: string[];
  let weaknesses: string[];
  try {
    strengths = [...new Set(input.strengths.map(dimensionToDb))];
    weaknesses = [...new Set(input.weaknesses.map(dimensionToDb))];
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const overlap = strengths.filter((s) => weaknesses.includes(s));
  if (overlap.length) {
    return {
      ok: false,
      error: `dimension marked as both strength and weakness: ${overlap.join(", ")}`,
    };
  }
  return {
    ok: true,
    value: {
      score: input.score,
      pros_md: pros,
      cons_md: cons,
      strengths,
      weaknesses,
      exemplar: exemplarToDb(input.exemplar),
    },
  };
}

/** A content_rating row joined with the rater's login and the version's git sha. */
export interface ContentRatingRow {
  id: string; // uuid
  area: string;
  slug: string;
  version_id: string | null;
  git_sha: string | null;
  rater_user_id: string;
  rater_login: string | null;
  score: number;
  pros_md: string | null;
  cons_md: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  exemplar: string | null;
  superseded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

// Rows embedded via jsonb_build_object carry timestamps as strings.
const asDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

export function ratingFromRow(r: ContentRatingRow): Rating {
  return create(RatingSchema, {
    id: r.id,
    ref: create(ContentRefSchema, { area: areaFromDb(r.area), slug: r.slug }),
    raterUserId: r.rater_user_id,
    raterLogin: r.rater_login ?? undefined,
    versionId: r.version_id ?? undefined,
    gitSha: r.git_sha ?? undefined,
    score: r.score,
    prosMd: r.pros_md ?? undefined,
    consMd: r.cons_md ?? undefined,
    strengths: dimensionsFromDb(r.strengths),
    weaknesses: dimensionsFromDb(r.weaknesses),
    exemplar: exemplarFromDb(r.exemplar),
    createdAt: timestampFromDate(asDate(r.created_at)),
    updatedAt: timestampFromDate(asDate(r.updated_at)),
    superseded: r.superseded_at != null,
  });
}

export interface RatingAggregateRow {
  rating_count: number | null;
  // numeric avg comes back from postgres.js as a string.
  rating_avg: number | string | null;
  rating_good: number | null;
  rating_bad: number | null;
}

export function ratingSummaryFromRow(r: RatingAggregateRow): RatingSummary {
  return create(RatingSummarySchema, {
    count: r.rating_count ?? 0,
    average: r.rating_avg == null ? 0 : Number(r.rating_avg),
    goodCount: r.rating_good ?? 0,
    badCount: r.rating_bad ?? 0,
  });
}
