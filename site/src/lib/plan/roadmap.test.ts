import { expect, test } from "bun:test";
import type { NavNode } from "../../doc-nav";
import { buildRoadmap, progress, sectionAnchor } from "./roadmap";

const page = (bucket: string, slug: string, primary = true): NavNode => ({
  kind: "page",
  bucket,
  slug,
  label: slug,
  primary,
});

const nav: NavNode[] = [
  {
    kind: "section",
    label: "Start here",
    children: [
      page("tutorials", "first"),
      { kind: "planned", id: "T02", title: "Register a table", request: "req-promoted" },
      {
        kind: "section",
        label: "Engines",
        children: [page("how-to", "spark"), page("tutorials", "first", false)],
      },
    ],
  },
];

const status = (_b: string, slug: string) => (slug === "first" ? "ready" : "draft");

test("sections roll up stage counts, skipping secondary placements", () => {
  const root = buildRoadmap(nav, status, []);
  const start = root.sections[0];
  expect(start.placement).toBe("Start here");
  expect(start.sections[0].placement).toBe("Start here › Engines");
  expect(start.sections[0].counts).toEqual({ ready: 0, draft: 1, planned: 0, requested: 0 });
  expect(start.counts).toEqual({ ready: 1, draft: 1, planned: 1, requested: 0 });
  expect(root.counts).toEqual(start.counts);
  expect(progress(start.counts)).toBeCloseTo(1 / 3);
});

test("requests land on their section, unknown sections on the root, promoted ones once", () => {
  const root = buildRoadmap(nav, status, [
    { id: "req-1", title: "Use DuckDB", placement: "Start here › Engines" },
    { id: "req-promoted", title: "Register a table", placement: "Start here" },
    { id: "req-elsewhere", title: "Orphan", placement: "Gone" },
  ]);
  const engines = root.sections[0].sections[0];
  expect(engines.slots.at(-1)).toEqual({
    kind: "requested",
    stage: "requested",
    requestId: "req-1",
    title: "Use DuckDB",
  });
  expect(root.sections[0].slots.filter((s) => s.kind === "requested")).toHaveLength(0);
  expect(root.slots.map((s) => s.kind === "requested" && s.requestId)).toEqual(["req-elsewhere"]);
  expect(root.counts.requested).toBe(2);
});

test("an empty section reports zero progress", () => {
  expect(progress(buildRoadmap([], status, []).counts)).toBe(0);
});

test("section anchors are URL-safe and follow the label trail", () => {
  expect(sectionAnchor("Start here › Engines & clients")).toBe(
    "section-start-here-engines-clients",
  );
});

test("private pages are listed but never count toward progress", () => {
  const root = buildRoadmap(
    [{ kind: "section", label: "Internal", children: [page("reference", "coverage")] }],
    () => "private",
    [],
  );
  expect(root.sections[0].slots).toHaveLength(1);
  expect(root.counts).toEqual({ ready: 0, draft: 0, planned: 0, requested: 0 });
});
