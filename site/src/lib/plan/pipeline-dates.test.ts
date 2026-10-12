import { expect, test } from "bun:test";
import { dateFlag, daysUntil } from "./pipeline-dates";

const now = new Date("2026-10-12T18:30:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("flags a post by its target date", () => {
  expect(dateFlag(undefined, false, now)).toBe("unscheduled");
  expect(dateFlag(day("2026-10-11"), false, now)).toBe("overdue");
  expect(dateFlag(day("2026-10-12"), false, now)).toBe("soon");
  expect(dateFlag(day("2026-10-26"), false, now)).toBe("soon");
  expect(dateFlag(day("2026-10-27"), false, now)).toBe("scheduled");
});

test("released posts are never overdue", () => {
  expect(dateFlag(day("2026-01-01"), true, now)).toBe("released");
});

test("days count from today's UTC date, not the current hour", () => {
  expect(daysUntil(day("2026-10-13"), now)).toBe(1);
  expect(daysUntil(day("2026-10-10"), now)).toBe(-2);
});
