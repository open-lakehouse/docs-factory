import { expect, test } from "bun:test";
import type { CompatCell, CompatMatrix } from "../../compat";
import { answeredShare, columnCounts, featureGroups, matrixCounts } from "./compat-stats";

const cell = (status: CompatCell["status"], draft = false): CompatCell => ({
  status,
  draft,
  proofs: [],
  evidence: [],
});

const matrix: CompatMatrix = {
  project: "delta",
  spec: null,
  interfaces: [],
  tables: [
    { id: "t1", title: "T1", columns: ["a", "b"], rows: ["j1", "j2", "missing-row"] },
    { id: "t2", title: "T2", columns: ["a"], rows: ["j1"] },
  ],
  journeys: [
    {
      id: "j1",
      title: "J1",
      summary: "S",
      request: null,
      cells: { a: cell("tested"), b: cell("fails") },
    },
    {
      id: "j2",
      title: "J2",
      summary: "S",
      request: null,
      feature: { spec: "icebergSpec", name: "variant", since: "v3" },
      cells: { a: cell("tested", true), b: cell("documented") },
    },
  ],
};

test("columns bucket each journey's cell; absent cells are unknown", () => {
  const cols = columnCounts(matrix, matrix.tables[0]);
  expect(cols.get("a")).toEqual({ proven: 1, draft: 1, documented: 0, no: 0, unknown: 0 });
  expect(cols.get("b")).toEqual({ proven: 0, draft: 0, documented: 1, no: 1, unknown: 0 });
});

test("matrix totals count a journey once per table it appears in", () => {
  const total = matrixCounts(matrix);
  expect(total).toEqual({ proven: 2, draft: 1, documented: 1, no: 1, unknown: 0 });
  expect(answeredShare(total)).toBeCloseTo(3 / 5);
});

test("feature groups count their journeys' cells per spec version", () => {
  const [v3] = featureGroups(matrix);
  expect(featureGroups(matrix)).toHaveLength(1);
  expect(v3.key).toBe("icebergSpec:v3");
  expect([...v3.journeys]).toEqual(["j2"]);
  expect(v3.counts).toEqual({ proven: 0, draft: 1, documented: 1, no: 0, unknown: 0 });
});
