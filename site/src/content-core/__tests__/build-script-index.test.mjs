// scripts.json entries (Phase 3): derive the served fetch URL + tutorial route
// from a docsnip script entry's repo-relative path + tutorial_slug. Exercises the
// pure scriptEntry().
import { expect, test } from "bun:test";
import { scriptEntry, stripSectionMarkers } from "../../../scripts/build-script-index.mjs";

const DOCSNIP_ENTRY = {
  path: "content/delta/how-to/001-read-a-delta-table/snippets/read_delta_table.py",
  requires_python: ">=3.11",
  dependencies: ["deltalake>=0.20", "docs-factory-seed"],
  compose: null,
  services: [],
  base_url_env: null,
  verifies: null,
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

test("scriptEntry marks a plain PEP 723 script as python", () => {
  expect(scriptEntry(DOCSNIP_ENTRY).kind).toBe("python");
});

test("scriptEntry publishes the .sh a harness verifies, not the harness", () => {
  const snippets = "content/unitycatalog/tutorials/001-getting-started/snippets";
  const e = scriptEntry({
    path: `${snippets}/first_catalog_cli.py`,
    requires_python: ">=3.11",
    dependencies: ["docsnip"],
    compose: "../compose.yaml",
    services: ["unitycatalog"],
    base_url_env: "UC_BASE_URL",
    verifies: `${snippets}/first_catalog.sh`,
    tutorial_slug: "getting-started",
  });
  expect(e.kind).toBe("shell");
  expect(e.gitPath).toBe(`${snippets}/first_catalog.sh`);
  expect(e.fetchUrl).toBe("/docs/unitycatalog/tutorials/getting-started/snippets/first_catalog.sh");
  expect(e.tutorialRoute).toBe("/docs/unitycatalog/tutorials/getting-started");
  // The harness's own Python deps aren't the shell script's; its stack is.
  expect(e.requiresPython).toBeNull();
  expect(e.dependencies).toEqual([]);
  expect(e.compose).toBe("../compose.yaml");
  expect(e.services).toEqual(["unitycatalog"]);
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

// A fixture modeled on blogs/unity-catalog-delta-api/snippets/read_delta_duckdb.py:
// a PEP 723 header, a whole-file [start:full]/[end:full] pair right against the
// header and the last line, and nested region markers with blank lines around them.
const SCRIPT_WITH_MARKERS = `# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "duckdb>=1.5.4",
# ]
# ///
# --8<-- [start:full]
# --8<-- [start:install]
import os

import duckdb
# --8<-- [end:install]

# --8<-- [start:read]
con.sql("SELECT * FROM events").fetchall()
# --8<-- [end:read]
# --8<-- [end:full]
`;

test("stripSectionMarkers removes every --8<-- start/end marker line", () => {
  const out = stripSectionMarkers(SCRIPT_WITH_MARKERS);
  expect(out).not.toMatch(/--8<--/);
  expect(out).not.toMatch(/\[start:/);
  expect(out).not.toMatch(/\[end:/);
});

test("stripSectionMarkers preserves the PEP 723 header and real code", () => {
  const out = stripSectionMarkers(SCRIPT_WITH_MARKERS);
  expect(out).toContain("# /// script");
  expect(out).toContain('#     "duckdb>=1.5.4",');
  expect(out).toContain("# ///");
  expect(out).toContain("import os");
  expect(out).toContain("import duckdb");
  expect(out).toContain('con.sql("SELECT * FROM events").fetchall()');
});

test("stripSectionMarkers collapses blank runs, trims edges, single trailing newline", () => {
  const out = stripSectionMarkers(SCRIPT_WITH_MARKERS);
  // No leading blank (the [start:full]/[start:install] pair sat right after # ///),
  // no run of two blank lines, ends with exactly one newline.
  expect(out.startsWith("# /// script")).toBe(true);
  expect(out).not.toMatch(/\n\n\n/);
  expect(out.endsWith("\n")).toBe(true);
  expect(out.endsWith("\n\n")).toBe(false);
  // The single blank between the install block and the read block survives.
  expect(out).toContain("import duckdb\n\ncon.sql");
});

test("stripSectionMarkers leaves a marker-free script unchanged (bar trailing newline)", () => {
  const src = "import os\n\nprint(os.getcwd())\n";
  expect(stripSectionMarkers(src)).toBe(src);
});

test("stripSectionMarkers does not clip a --8<-- inside a string literal", () => {
  const src = 'sep = "# --8<-- [start:x]"\nprint(sep)\n';
  // The marker regex is anchored to a full comment line, so this code line stays.
  expect(stripSectionMarkers(src)).toContain('sep = "# --8<-- [start:x]"');
});

test("scriptEntry serves under a target site's hrefFor", () => {
  const e = scriptEntry(DOCSNIP_ENTRY, { hrefFor: (id) => `/${id.bucket}/${id.slug}` });
  expect(e.tutorialRoute).toBe("/how-to/read-a-delta-table");
  expect(e.fetchUrl).toBe("/how-to/read-a-delta-table/snippets/read_delta_table.py");
});
