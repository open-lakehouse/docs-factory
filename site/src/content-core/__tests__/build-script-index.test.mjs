// scripts.json entries (Phase 3): derive the served fetch URL + tutorial route
// from a docsnip script entry's repo-relative path + tutorial_slug. Exercises the
// pure scriptEntry().
import { expect, test } from "bun:test";
import { scriptEntry } from "../../../scripts/build-script-index.mjs";

const DOCSNIP_ENTRY = {
  path: "content/delta/how-to/001-read-a-delta-table/snippets/read_delta_table.py",
  requires_python: ">=3.11",
  dependencies: ["deltalake>=0.20", "docs-factory-seed"],
  compose: null,
  services: [],
  base_url_env: null,
  tutorial_slug: "read-a-delta-table",
};

test("scriptEntry derives the tutorial route (order prefix stripped)", () => {
  const e = scriptEntry(DOCSNIP_ENTRY);
  expect(e.tutorialRoute).toBe("/docs/delta/how-to/read-a-delta-table");
});

test("scriptEntry serves the .py under the tutorial route, keeping the snippets subpath", () => {
  const e = scriptEntry(DOCSNIP_ENTRY);
  expect(e.fetchUrl).toBe("/docs/delta/how-to/read-a-delta-table/snippets/read_delta_table.py");
});

test("scriptEntry carries the PEP 723 runtime contract through", () => {
  const e = scriptEntry(DOCSNIP_ENTRY);
  expect(e.requiresPython).toBe(">=3.11");
  expect(e.dependencies).toEqual(["deltalake>=0.20", "docs-factory-seed"]);
  expect(e.gitPath).toBe(DOCSNIP_ENTRY.path);
});

test("scriptEntry handles a script directly in the tutorial dir (no snippets/)", () => {
  const e = scriptEntry({
    ...DOCSNIP_ENTRY,
    path: "content/uc/tutorials/002-python-client/catalog_flow.py",
    tutorial_slug: "python-client",
  });
  expect(e.fetchUrl).toBe("/docs/uc/tutorials/python-client/catalog_flow.py");
});

test("scriptEntry maps a blog script to its /blog/<slug> route", () => {
  const e = scriptEntry({
    ...DOCSNIP_ENTRY,
    path: "blogs/unity-catalog-delta-api/snippets/read_delta_duckdb.py",
    tutorial_slug: "unity-catalog-delta-api",
  });
  expect(e.tutorialRoute).toBe("/blog/unity-catalog-delta-api");
  expect(e.fetchUrl).toBe("/blog/unity-catalog-delta-api/snippets/read_delta_duckdb.py");
});
