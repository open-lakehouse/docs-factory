import { expect, test } from "bun:test";
import type { CompatCell, CompatMatrix, CompatRow } from "../../compat";
import { compatDataset } from "../../content-core/compat-dataset.mjs";
import {
  applyPreset,
  defaultState,
  facet,
  filterRows,
  matrixSections,
  PRESETS,
  parseState,
  scopesByProject,
  scorecard,
  stateParams,
  toggleFilter,
  withView,
} from "./compat-view";

const cell = (status: CompatCell["status"], draft = false): CompatCell => ({
  status,
  draft,
  proofs: [],
  evidence: [],
});

const matrix = {
  version: 2,
  project: "delta",
  spec: null,
  interfaces: [
    { key: "a", label: "A", version: "1", package: null, model: "engA" },
    { key: "b", label: "B", version: "2", package: null, model: "engB" },
  ],
  tables: [
    { id: "t1", title: "T1", columns: ["a", "b"], rows: ["j1", "j2"] },
    { id: "t2", title: "T2", columns: ["b"], rows: ["j2"] },
  ],
  assets: [],
  engines: [],
  journeys: [
    {
      id: "j1",
      title: "Read",
      summary: "Read a table",
      request: null,
      family: "read",
      asset: null,
      requires: {},
      cells: { a: cell("tested"), b: cell("fails") },
    },
    {
      id: "j2",
      title: "Write",
      summary: "Append rows",
      request: null,
      family: "write",
      asset: null,
      requires: {},
      feature: { spec: "deltaSpec", name: "cdf", since: "writer 4" },
      cells: { a: cell("tested", true) },
    },
  ],
  verifiedEdges: [],
  diagnostics: [],
} satisfies CompatMatrix;

const rows = compatDataset([matrix]) as CompatRow[];
const DIMS = ["bucket", "interface", "featureKey", "tables", "engine", "family"];

test("state round-trips through the URL, leaving defaults out", () => {
  const state = {
    ...withView(defaultState("delta"), "cells"),
    group: "engine" as const,
    sort: [{ id: "journeyTitle", desc: true }],
    filters: { bucket: ["no", "unknown"] },
    q: "read",
    gaps: true,
    cell: "delta/j1/a",
  };
  const params = stateParams(state);
  expect(params.toString()).toBe(
    "project=delta&view=cells&group=engine&sort=-journeyTitle&f.bucket=no%2Cunknown&q=read&gaps=1&cell=delta%2Fj1%2Fa",
  );
  expect(parseState(params, ["delta"], DIMS)).toEqual(state);
  expect(stateParams(defaultState("delta")).toString()).toBe("project=delta");
});

test("pre-explorer links still land", () => {
  const s = parseState(
    new URLSearchParams("group=asset&gaps=1&since=deltaSpec:writer 4&cell=j1:a"),
    ["delta", "unitycatalog"],
    [...DIMS, "asset"],
  );
  expect(s.project).toBe("delta");
  expect(s.view).toBe("matrix");
  expect(s.group).toBe("asset");
  expect(s.gaps).toBe(true);
  expect(s.filters.featureKey).toEqual(["deltaSpec:writer 4"]);
  expect(s.cell).toBe("delta/j1/a");
});

test("unknown views, groups, and filter dims are ignored", () => {
  const s = parseState(new URLSearchParams("view=pie&group=nope&f.nope=x"), ["delta"], DIMS);
  expect(s.view).toBe("matrix");
  expect(s.group).toBe("tables");
  expect(s.filters).toEqual({});
});

test("presets reset to defaults but keep the project", () => {
  const draft = PRESETS.find((p) => p.id === "draft-only");
  if (!draft) throw new Error("preset missing");
  const s = applyPreset({ ...defaultState("unitycatalog"), q: "x" }, draft);
  expect(s).toMatchObject({ project: "unitycatalog", view: "cells", q: "", preset: "draft-only" });
  expect(s.filters).toEqual({ bucket: ["draft"] });
});

test("filters match any value; facets skip their own filter", () => {
  let s = withView(defaultState("delta"), "cells");
  s = toggleFilter(s, "bucket", "proven");
  s = toggleFilter(s, "bucket", "no");
  expect(filterRows(rows, s).map((r) => r.id)).toEqual(["delta/j1/a", "delta/j1/b"]);
  expect(facet(filterRows(rows, s, "bucket"), "bucket")).toEqual([
    { value: "draft", count: 1 },
    { value: "no", count: 1 },
    { value: "proven", count: 1 },
    { value: "unknown", count: 1 },
  ]);
  expect(toggleFilter(toggleFilter(s, "bucket", "no"), "bucket", "proven").filters).toEqual({});
});

test("search and gaps narrow cells; the matrix keeps a gap journey whole", () => {
  const cells = { ...withView(defaultState("delta"), "cells"), q: "append" };
  expect(filterRows(rows, cells).map((r) => r.journey)).toEqual(["j2", "j2"]);
  const gapCells = { ...withView(defaultState("delta"), "cells"), gaps: true };
  expect(filterRows(rows, gapCells).map((r) => r.id)).toEqual(["delta/j2/a", "delta/j2/b"]);
  const matrixState = { ...defaultState("delta"), gaps: true };
  const sections = matrixSections(filterRows(rows, matrixState), "tables", true);
  expect(sections.map((s) => [s.value, s.journeys.map((j) => j.journey.id)])).toEqual([
    ["t1", ["j2"]],
    ["t2", ["j2"]],
  ]);
});

test("matrix sections by table keep the table's rows and columns", () => {
  const [t1, t2] = matrixSections(rows, "tables");
  expect(t1.table?.id).toBe("t1");
  expect(t1.columns.map((c) => c.key)).toEqual(["a", "b"]);
  expect(t1.journeys.map((j) => j.journey.id)).toEqual(["j1", "j2"]);
  expect(t2.columns.map((c) => c.key)).toEqual(["b"]);
  expect(t2.journeys[0].cells.get("b")?.bucket).toBe("unknown");
});

test("matrix sections by another dimension use the artifact's order", () => {
  const sections = matrixSections(rows, "featureKey");
  expect(sections.map((s) => s.value)).toEqual(["deltaSpec:writer 4", "(none)"]);
  expect(sections[0].columns.map((c) => c.key)).toEqual(["a", "b"]);
});

test("scorecard counts each value's rows", () => {
  const byIface = new Map(scorecard(rows, "interface").map((r) => [r.value, r]));
  expect(byIface.get("a")?.counts).toMatchObject({ proven: 1, draft: 1 });
  expect(byIface.get("a")?.answered).toBe(0.5);
  expect(byIface.get("b")?.total).toBe(2);
  expect(byIface.get("b")?.answered).toBe(0.5);
});

test("scorecard splits project-scoped values per project", () => {
  const other = compatDataset([{ ...matrix, project: "unitycatalog" }]) as CompatRow[];
  const both = [...rows, ...other];
  expect(scorecard(both, "interface").find((r) => r.value === "a")?.total).toBe(4);
  const split = scorecard(both, "interface", true);
  expect(split.filter((r) => r.value === "a").map((r) => [r.id, r.total])).toEqual([
    ["delta/a", 2],
    ["unitycatalog/a", 2],
  ]);
  const all = { ...defaultState("all"), view: "scorecard" as const };
  expect(scopesByProject(all, "interface")).toBe(true);
  expect(scopesByProject(all, "engine")).toBe(false);
  expect(scopesByProject(defaultState("delta"), "interface")).toBe(false);
});
