import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CompatMatrix } from "../../compat";
import { bucketOf } from "../estate-graph";
import {
  buildTable,
  DEFAULT_STATE,
  parseState,
  scopedMatrices,
  stateParams,
  type TableState,
} from "./compat-table";

const repo = join(import.meta.dir, "../../../..");
const matrices = ["delta", "unitycatalog"].map(
  (p) =>
    JSON.parse(readFileSync(join(repo, `content/${p}/compatibility.json`), "utf8")) as CompatMatrix,
);
const uc = matrices.find((m) => m.project === "unitycatalog") as CompatMatrix;
const state = (patch: Partial<TableState>): TableState => ({ ...DEFAULT_STATE, ...patch });

test("grouped by docs table, each group is a table with its own columns", () => {
  const t = buildTable(uc, DEFAULT_STATE);
  expect(t.groups.map((g) => g.key)).toEqual(uc.tables.map((x) => x.id));
  for (const g of t.groups) {
    const table = uc.tables.find((x) => x.id === g.key);
    expect([...g.columns].sort()).toEqual([...(table?.columns ?? [])].sort());
    expect(g.rows.length).toBe(table?.rows.length ?? 0);
  }
});

test("a column's group counts are its docs table's cells", () => {
  const t = buildTable(uc, DEFAULT_STATE);
  const g = t.groups[0];
  const col = [...g.counts.keys()][0];
  const tested = g.rows.filter((j) => bucketOf(j.cells[col]) === "tested").length;
  expect(g.counts.get(col)?.tested).toBe(tested);
});

test("filters: show, where, search, and hidden columns", () => {
  const gaps = buildTable(uc, state({ show: "fails" }));
  for (const g of gaps.groups)
    for (const j of g.rows)
      expect([...g.columns].some((k) => ["fails", "missing"].includes(bucketOf(j.cells[k])))).toBe(
        true,
      );
  const where = buildTable(uc, state({ group: "none", where: { col: "spark", bucket: "tested" } }));
  expect(where.rows).toBeGreaterThan(0);
  for (const j of where.groups[0].rows) expect(bucketOf(j.cells.spark)).toBe("tested");
  const q = buildTable(uc, state({ group: "none", q: "managed.append" }));
  expect(q.groups[0].rows.map((j) => j.id)).toEqual(["managed.append"]);
  const hidden = buildTable(uc, state({ hidden: ["spark"] }));
  expect(hidden.columns.some((c) => c.key === "spark")).toBe(false);
  expect(hidden.available.some((c) => c.key === "spark")).toBe(true);
});

test("sorting a column puts proven cells first, or gaps first when descending", () => {
  const asc = buildTable(uc, state({ group: "none", sort: { col: "duckdb", desc: false } }));
  const rows = asc.groups[0].rows;
  expect(bucketOf(rows[0].cells.duckdb)).toBe("tested");
  const desc = buildTable(uc, state({ group: "none", sort: { col: "duckdb", desc: true } }));
  expect(bucketOf(desc.groups[0].rows[0].cells.duckdb)).not.toBe("tested");
});

test("scoped to an implementation, only its columns and the rows it has cells in", () => {
  const scoped = scopedMatrices(matrices, { model: "pyIceberg" });
  expect(scoped.length).toBeGreaterThan(0);
  const t = buildTable(scoped[0], DEFAULT_STATE, { model: "pyIceberg" });
  expect(t.columns.every((c) => c.model === "pyIceberg")).toBe(true);
  for (const g of t.groups)
    for (const j of g.rows) expect(t.columns.some((c) => j.cells[c.key])).toBe(true);
  const path = buildTable(uc, state({ group: "asset" }), { path: "uc-managed" });
  for (const g of path.groups) for (const j of g.rows) expect(j.path).toBe("uc-managed");
});

test("state round-trips through the URL, and old links still land", () => {
  const s = state({
    project: "delta",
    group: "asset",
    show: "gaps",
    q: "read",
    sort: { col: "duckdb-sql", desc: true },
    where: { col: "spark-sql", bucket: "fails" },
    hidden: ["spark-java"],
    cell: "read.scan:duckdb-sql",
  });
  expect(parseState(stateParams(s))).toEqual(s);
  expect(parseState(new URLSearchParams("gaps=1")).show).toBe("gaps");
  expect(parseState(new URLSearchParams("since=deltaSpec:v3")).group).toBe("spec");
  expect(parseState(new URLSearchParams("group=asset")).group).toBe("asset");
  expect(stateParams(DEFAULT_STATE).toString()).toBe("");
});
