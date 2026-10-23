import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CompatMatrix } from "../compat";
import {
  answered,
  type EstateCatalog,
  graphImplementations,
  implementationProfile,
  journeyCells,
  specColumns,
} from "./estate-graph";

const repo = join(import.meta.dir, "../../..");
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(repo, rel), "utf8"));
const catalog = read<EstateCatalog>("architecture/dist/journeys.json");
const matrices = ["delta", "unitycatalog"].map((p) =>
  read<CompatMatrix>(`content/${p}/compatibility.json`),
);

test("a profile counts a rollup's members through the rollup", () => {
  const spark = implementationProfile("apacheSpark", catalog, matrices);
  const uc = spark.columns.filter((c) => c.project === "unitycatalog");
  expect(uc.find((c) => c.key === "spark-sql")?.rolledInto).toBe("spark");
  const counted = new Set(spark.cells.map((c) => `${c.project}:${c.interface}`));
  expect(counted.has("unitycatalog:spark")).toBe(true);
  expect(counted.has("unitycatalog:spark-sql")).toBe(false);
  const total = Object.values(spark.counts).reduce((a, b) => a + b, 0);
  expect(total).toBe(spark.cells.length);
});

test("a server's profile carries its facts; a client's what they block", () => {
  const server = implementationProfile("unityCatalogServer", catalog, matrices);
  expect(server.facts.length).toBe(
    catalog.facts.filter((f) => f.implementation === "unityCatalogServer").length,
  );
  expect(server.paths.some((p) => p.path === "uc-managed" && p.role === "catalog")).toBe(true);
  const pyiceberg = implementationProfile("pyIceberg", catalog, matrices);
  expect(pyiceberg.blockedBy.some((b) => b.fact.implementation === "unityCatalogServer")).toBe(
    true,
  );
});

test("coverage rows are the artifact's own, per project", () => {
  const duck = implementationProfile("duckdb", catalog, matrices);
  for (const c of duck.coverage) {
    const m = matrices.find((x) => x.project === c.project);
    expect(m?.coverage?.some((x) => x.interface === c.interface && x.spec === c.spec)).toBe(true);
  }
});

test("spec columns measure every interface the projects report on", () => {
  const cols = specColumns("deltaSpec", matrices);
  const expected = matrices.flatMap((m) =>
    (m.coverage ?? []).filter((c) => c.spec === "deltaSpec"),
  );
  expect(cols.length).toBe(expected.length);
  for (const col of cols)
    for (const n of Object.values(col.roles)) expect(answered(n).total).toBeGreaterThan(0);
});

test("the graph's implementations and a journey's cells across projects", () => {
  const impls = graphImplementations(catalog, matrices);
  expect(impls.get("apacheSpark")).toBeGreaterThan(0);
  expect(impls.has("unityCatalogServer")).toBe(true);
  const shared = Object.entries(catalog.journeys).find(([, j]) => j.projects.length > 1);
  expect(shared).toBeDefined();
  if (shared) expect(journeyCells(shared[0], matrices).length).toBe(shared[1].projects.length);
});
