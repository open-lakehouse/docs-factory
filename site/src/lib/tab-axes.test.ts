import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { axisTabs, choose, engines, parsePrefs, pick } from "./tab-axes";

const tabs = axisTabs(["Spark · SQL", "Spark · Python", "delta-rs · Python", "DuckDB · SQL"]);
if (!tabs) throw new Error("expected an axis group");
const label = (prefs: Parameters<typeof pick>[1]) => pick(tabs, prefs).label;

describe("axisTabs", () => {
  test("splits engine and language in label order", () => {
    expect(engines(tabs)).toEqual(["Spark", "delta-rs", "DuckDB"]);
    expect(tabs[1]).toEqual({ label: "Spark · Python", engine: "Spark", language: "Python" });
  });

  test("a group with any plain label isn't an axis group", () => {
    expect(axisTabs(["Spark · SQL", "CLI"])).toBeNull();
    expect(axisTabs(["Python SDK", "CLI"])).toBeNull();
    expect(axisTabs([" · SQL"])).toBeNull();
    expect(axisTabs([])).toBeNull();
  });
});

describe("pick", () => {
  test("defaults to the first tab", () => {
    expect(label({})).toBe("Spark · SQL");
  });

  test("keeps the language chosen for each engine", () => {
    let prefs = choose({}, tabs[1]); // Spark · Python
    prefs = choose(prefs, tabs[3]); // DuckDB · SQL
    expect(label(prefs)).toBe("DuckDB · SQL");
    expect(label({ ...prefs, engine: "Spark" })).toBe("Spark · Python");
  });

  test("carries the last language to an engine with no choice yet", () => {
    const prefs = choose({}, tabs[1]); // Spark · Python
    expect(label({ ...prefs, engine: "delta-rs" })).toBe("delta-rs · Python");
    expect(label({ ...prefs, engine: "DuckDB" })).toBe("DuckDB · SQL");
  });

  test("falls back to the first engine when the stored one is absent", () => {
    expect(label({ engine: "Trino", language: "Python" })).toBe("Spark · Python");
  });
});

test("parsePrefs survives junk", () => {
  expect(parsePrefs(null)).toEqual({});
  expect(parsePrefs("not json")).toEqual({});
  expect(parsePrefs("null")).toEqual({});
  expect(parsePrefs('{"engine":"Spark"}')).toEqual({ engine: "Spark" });
});

test("the docs-shell copy is identical", () => {
  const read = (p: string) => readFileSync(resolve(import.meta.dir, p), "utf8");
  expect(read("../../../sites/docs-shell/src/lib/tab-axes.ts")).toBe(read("./tab-axes.ts"));
});
