// Unit tests for the pure last-maintainer invariant that manageAllowlist
// hard-blocks (removing/demoting the sole maintainer). No DB. Run with `bun test`.
import { describe, expect, test } from "bun:test";
import { removesLastMaintainer } from "./review.js";

describe("removesLastMaintainer", () => {
  test("removing the only maintainer is blocked", () => {
    // count=1, target is a maintainer, op demotes it → would leave zero.
    expect(removesLastMaintainer(1, true, true)).toBe(true);
  });

  test("removing a maintainer when others remain is allowed", () => {
    expect(removesLastMaintainer(2, true, true)).toBe(false);
  });

  test("removing a reviewer is never the last-maintainer case", () => {
    expect(removesLastMaintainer(1, false, true)).toBe(false);
  });

  test("a non-demoting op on the sole maintainer is allowed (re-add / role unchanged)", () => {
    // e.g. ADD maintainer over an existing maintainer row: demotesTarget=false.
    expect(removesLastMaintainer(1, true, false)).toBe(false);
  });

  test("zero maintainers (defensive) still reads as would-remove-last", () => {
    expect(removesLastMaintainer(0, true, true)).toBe(true);
  });
});
