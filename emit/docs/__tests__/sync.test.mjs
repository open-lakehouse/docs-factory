// The manifest-driven sync and change report (docs/sync.mjs): only changed bytes
// are written, stale emitter-owned files are deleted, nothing outside the owned
// paths is touched, and the page diff classifies add/remove/rename/change.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applySync,
  changedSections,
  diffPages,
  diskHasher,
  isOwned,
  planSync,
  sha256,
} from "../sync.mjs";

const page = (over = {}) => ({
  route: "/how-to/duckdb",
  title: "DuckDB",
  contentHash: "c1",
  rootHash: "r1",
  sections: { intro: "a", "list-tables": "b" },
  outputs: ["src/content/how-to/duckdb.md", "public/how-to/duckdb.md"],
  ...over,
});

test("isOwned accepts only the emitter's paths", () => {
  expect(isOwned("src/content/how-to/duckdb.md")).toBe(true);
  expect(isOwned("public/llms.txt")).toBe(true);
  expect(isOwned("src/components/callout.tsx")).toBe(false);
  expect(isOwned("package.json")).toBe(false);
  expect(isOwned("public/../package.json")).toBe(false);
});

test("planSync writes only bytes that differ from disk", () => {
  const files = new Map([
    ["public/a.txt", "same"],
    ["public/b.txt", "new"],
  ]);
  const disk = { "public/a.txt": sha256("same"), "public/b.txt": sha256("old") };
  const plan = planSync(files, null, (p) => disk[p] ?? null);
  expect(plan.write).toEqual(["public/b.txt"]);
  expect(plan.unchanged).toBe(1);
  expect(plan.remove).toEqual([]);
});

test("planSync removes stale files from the previous manifest, never unowned ones", () => {
  const previous = { files: { "public/old.txt": "x", "src/App.tsx": "y" } };
  const plan = planSync(new Map([["public/a.txt", "a"]]), previous, () => null);
  expect(plan.remove).toEqual(["public/old.txt"]);
});

test("planSync refuses to write outside the owned paths", () => {
  expect(() => planSync(new Map([["src/App.tsx", "x"]]), null, () => null)).toThrow(
    /outside its owned paths/,
  );
});

test("applySync writes, deletes, and prunes emptied directories", () => {
  const out = mkdtempSync(join(tmpdir(), "sync-"));
  try {
    mkdirSync(join(out, "public/old"), { recursive: true });
    writeFileSync(join(out, "public/old/x.md"), "x");
    writeFileSync(join(out, "package.json"), "{}");
    const files = new Map([["public/new/y.md", "y"]]);
    const plan = planSync(files, { files: { "public/old/x.md": "h" } }, diskHasher(out));
    applySync(out, files, plan);
    expect(readFileSync(join(out, "public/new/y.md"), "utf8")).toBe("y");
    expect(existsSync(join(out, "public/old"))).toBe(false);
    expect(existsSync(join(out, "public"))).toBe(true);
    expect(existsSync(join(out, "package.json"))).toBe(true);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("changedSections reports changed, added, and removed anchors", () => {
  expect(changedSections({ a: "1", b: "2", c: "3" }, { a: "1", b: "9", d: "4" })).toEqual([
    "b",
    "d",
    "c",
  ]);
});

test("diffPages: a source change lists the sections that changed", () => {
  const prev = { pages: { k: page() }, files: {} };
  const next = {
    pages: { k: page({ rootHash: "r2", sections: { intro: "a", "list-tables": "z" } }) },
    files: {},
  };
  const d = diffPages(prev, next);
  expect(d.changed).toEqual([{ key: "k", route: "/how-to/duckdb", sections: ["list-tables"] }]);
  expect(d.renderOnly).toEqual([]);
});

test("diffPages: same source, different output bytes is render-only", () => {
  const outputs = page().outputs;
  const prev = { pages: { k: page() }, files: { [outputs[0]]: "h1", [outputs[1]]: "h2" } };
  const next = { pages: { k: page() }, files: { [outputs[0]]: "h1", [outputs[1]]: "h3" } };
  expect(diffPages(prev, next).renderOnly).toEqual([{ key: "k", route: "/how-to/duckdb" }]);
});

test("diffPages: a removed + added page with the same contentHash is a rename", () => {
  const prev = { pages: { old: page({ route: "/how-to/duck" }) }, files: {} };
  const next = { pages: { new: page() }, files: {} };
  const d = diffPages(prev, next);
  expect(d.renamed).toEqual([
    { from: "old", to: "new", fromRoute: "/how-to/duck", toRoute: "/how-to/duckdb" },
  ]);
  expect(d.added).toEqual([]);
  expect(d.removed).toEqual([]);
});

test("diffPages: first emit reports every page as added", () => {
  const d = diffPages(null, { pages: { k: page() }, files: {} });
  expect(d.added).toEqual([{ key: "k", route: "/how-to/duckdb", title: "DuckDB" }]);
});
