// Pure helpers for the content-rating UI: dimension labels, the chip tri-state
// cycle, and the compact average label.

import { QualityDimension, type RatingSummary } from "../gen/docs_factory/review/v1/messages_pb";

export const DIMENSIONS: { value: QualityDimension; label: string }[] = [
  { value: QualityDimension.ACCURACY, label: "Accuracy" },
  { value: QualityDimension.CLARITY, label: "Clarity" },
  { value: QualityDimension.STRUCTURE, label: "Structure" },
  { value: QualityDimension.COMPLETENESS, label: "Completeness" },
  { value: QualityDimension.RUNNABLE_CODE, label: "Runnable code" },
  { value: QualityDimension.TONE, label: "Tone" },
];

export function dimensionLabel(d: QualityDimension): string {
  return DIMENSIONS.find((x) => x.value === d)?.label ?? "Unknown";
}

export type DimensionMark = "neutral" | "strength" | "weakness";

export function nextMark(m: DimensionMark): DimensionMark {
  return m === "neutral" ? "strength" : m === "strength" ? "weakness" : "neutral";
}

export type DimensionMarks = Map<QualityDimension, DimensionMark>;

export function marksFrom(
  strengths: QualityDimension[],
  weaknesses: QualityDimension[],
): DimensionMarks {
  const m: DimensionMarks = new Map();
  for (const d of strengths) m.set(d, "strength");
  for (const d of weaknesses) m.set(d, "weakness");
  return m;
}

export function splitMarks(m: DimensionMarks): {
  strengths: QualityDimension[];
  weaknesses: QualityDimension[];
} {
  const strengths: QualityDimension[] = [];
  const weaknesses: QualityDimension[] = [];
  for (const [d, mark] of m) {
    if (mark === "strength") strengths.push(d);
    else if (mark === "weakness") weaknesses.push(d);
  }
  return { strengths, weaknesses };
}

/** `★ 4.2 (3)`, or null when unrated. */
export function ratingLabel(s: RatingSummary | undefined): string | null {
  if (!s || s.count === 0) return null;
  return `★ ${s.average.toFixed(1)} (${s.count})`;
}
