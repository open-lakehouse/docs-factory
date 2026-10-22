// compatDataset: the matrices flattened to one row per journey × interface in scope.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compatDataset, countBuckets } from "../compat-dataset.mjs";
import { bucketOf, emptyCounts } from "../coverage.mjs";

const cell = (status, { draft = false, proofs = [], evidence = [] } = {}) => ({
  status,
  draft,
  proofs,
  evidence,
});
const proof = (ready, version) => ({ ready, works: true, version, api: "SELECT" });

const matrix = {
  project: "proj",
  interfaces: [
    { key: "a", label: "A", version: "1.0", package: "a-pkg", model: "engA", via: null },
    { key: "b", label: "B", version: "2.0", package: null, model: null, via: null },
    { key: "c", label: "C", version: null, package: null, model: null, via: null },
  ],
  engines: [{ id: "engB", title: "Engine B", interfaces: ["b"] }],
  tables: [
    { id: "t1", title: "T1", columns: ["a", "b"], rows: ["j1", "j2"] },
    { id: "t2", title: "T2", columns: ["a"], rows: ["j1"] },
  ],
  assets: [{ id: "lakehouse.table", title: "Table", columns: ["a"], rows: ["j1"] }],
  journeys: [
    {
      id: "j1",
      title: "J1",
      summary: "S1",
      request: null,
      family: "table",
      asset: "lakehouse.table",
      cells: {
        a: cell("tested", { proofs: [proof(false, "0.9"), proof(true, "1.0")] }),
        c: cell("documented", { evidence: [{ verified: "3.0", api: null }] }),
      },
    },
    {
      id: "j2",
      title: "J2",
      summary: "S2",
      request: null,
      feature: { spec: "icebergSpec", name: "variant", since: "v3" },
      cells: { b: cell("tested", { draft: true, proofs: [proof(false, "2.0")] }) },
    },
  ],
};

const rows = compatDataset([matrix]);
const byId = new Map(rows.map((r) => [r.id, r]));

test("one row per journey × interface a table places or a claim mentions", () => {
  expect(rows.map((r) => r.id).sort()).toEqual([
    "proj/j1/a",
    "proj/j1/b",
    "proj/j1/c",
    "proj/j2/a",
    "proj/j2/b",
  ]);
});

test("an absent cell is an unknown row, not a missing one", () => {
  const r = byId.get("proj/j1/b");
  expect(r.status).toBe("unknown");
  expect(r.bucket).toBe("unknown");
  expect(r.proofCount).toBe(0);
});

test("placements list every table and asset group", () => {
  expect(byId.get("proj/j1/a").tables).toEqual(["t1", "t2"]);
  expect(byId.get("proj/j1/a").assetGroups).toEqual(["lakehouse.table"]);
  expect(byId.get("proj/j1/c").tables).toEqual([]);
});

test("measures come from the counted claim", () => {
  const a = byId.get("proj/j1/a");
  expect(a.bucket).toBe("proven");
  expect(a.readyProofCount).toBe(1);
  expect(a.testedVersion).toBe("1.0");
  expect(byId.get("proj/j1/c").testedVersion).toBe("3.0");
  expect(byId.get("proj/j2/b").bucket).toBe("draft");
});

test("feature key and engine resolve", () => {
  expect(byId.get("proj/j2/b").featureKey).toBe("icebergSpec:v3");
  expect(byId.get("proj/j1/a").featureKey).toBeNull();
  expect(byId.get("proj/j1/a").engine).toBe("engA");
  expect(byId.get("proj/j2/b").engine).toBe("engB");
  expect(byId.get("proj/j2/b").engineTitle).toBe("Engine B");
});

test("countBuckets tallies rows", () => {
  expect(countBuckets(rows)).toEqual({ proven: 1, draft: 1, documented: 1, no: 0, unknown: 2 });
});

for (const project of ["unitycatalog", "delta"]) {
  test(`${project}: each table's counts match the matrix it came from`, () => {
    const url = new URL(`../../../../content/${project}/compatibility.json`, import.meta.url);
    const real = JSON.parse(readFileSync(url, "utf8"));
    const data = compatDataset([real]);
    const journeys = new Map(real.journeys.map((j) => [j.id, j]));
    for (const table of real.tables) {
      const expected = emptyCounts();
      for (const id of table.rows) {
        for (const col of table.columns) expected[bucketOf(journeys.get(id)?.cells[col])]++;
      }
      expect(countBuckets(data.filter((r) => r.tables.includes(table.id)))).toEqual(expected);
    }
    expect(new Set(data.map((r) => r.id)).size).toBe(data.length);
  });
}
