// Unit tests for db-map pure helpers. Run with `bun test`.
import { expect, test, describe } from "bun:test";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { dateOnlyToUtcTimestamp } from "./db-map.js";

describe("dateOnlyToUtcTimestamp", () => {
  test("pins a 'YYYY-MM-DD' string to UTC midnight of that day", () => {
    const ts = dateOnlyToUtcTimestamp("2026-07-01");
    expect(timestampDate(ts).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  test("takes only the calendar date, ignoring any time part", () => {
    const ts = dateOnlyToUtcTimestamp("2026-07-01T13:45:00Z");
    expect(timestampDate(ts).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  test("round-trips the calendar date that setTargetReleaseDate wrote", () => {
    // setTargetReleaseDate stores toISOString().slice(0,10) — the UTC calendar
    // date. Reading it back must land on the SAME day (no TZ-offset drift), for
    // any date value, so the displayed target date is stable across server TZs.
    for (const ymd of ["2026-01-01", "2026-07-01", "2026-12-31"]) {
      const ts = dateOnlyToUtcTimestamp(ymd);
      expect(timestampDate(ts).toISOString().slice(0, 10)).toBe(ymd);
    }
  });
});
