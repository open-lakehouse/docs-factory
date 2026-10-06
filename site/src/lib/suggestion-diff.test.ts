import { describe, expect, test } from "bun:test";
import { diffSuggestion } from "./suggestion-diff";

describe("diffSuggestion", () => {
  test("marks only the changed words", () => {
    expect(diffSuggestion("vends short-lived tokens", "vends scoped tokens")).toEqual([
      { kind: "same", text: "vends " },
      { kind: "del", text: "short-lived" },
      { kind: "ins", text: "scoped" },
      { kind: "same", text: " tokens" },
    ]);
  });

  test("a deletion is all removed", () => {
    expect(diffSuggestion("drop this", "")).toEqual([{ kind: "del", text: "drop this" }]);
  });

  test("joining either side restores its text", () => {
    const a = "The broker  vends\nshort-lived tokens.";
    const b = "The catalog vends short-lived, scoped tokens.";
    const parts = diffSuggestion(a, b);
    const side = (k: "del" | "ins") =>
      parts
        .filter((p) => p.kind !== k)
        .map((p) => p.text)
        .join("");
    expect(side("ins")).toBe(a);
    expect(side("del")).toBe(b);
  });

  test("diffs code by line", () => {
    expect(diffSuggestion("a = 1\nb = 2\n", "a = 1\nb = 3\n", "lines")).toEqual([
      { kind: "same", text: "a = 1\n" },
      { kind: "del", text: "b = 2\n" },
      { kind: "ins", text: "b = 3\n" },
    ]);
  });
});
