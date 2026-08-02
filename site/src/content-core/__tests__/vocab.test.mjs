// Vocab single-source test: content-core's derived constants come straight from
// content/vocab.json, so this asserts the JSON is well-formed and that the
// derived JS exports match it. The Python side (tools/docsnip/tests) makes the
// same assertion against its own derived constants, so the site and docsnip
// share one source of truth — the old hand-maintained "mirror in X" maps are
// gone.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DIATAXIS, PAGE_WORTHY_KINDS, PROJECTS, STATUSES } from "../vocab.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const json = JSON.parse(readFileSync(resolve(here, "../../../../content/vocab.json"), "utf8"));

test("content/vocab.json has the four expected keys, all non-empty", () => {
  for (const key of ["diataxis", "projects", "statuses", "pageWorthyKinds"]) {
    expect(Array.isArray(json[key])).toBe(true);
    expect(json[key].length).toBeGreaterThan(0);
  }
});

test("content-core exports mirror the JSON exactly", () => {
  expect(DIATAXIS).toEqual(json.diataxis);
  expect(PROJECTS).toEqual(json.projects);
  expect(STATUSES).toEqual(json.statuses);
  expect(PAGE_WORTHY_KINDS).toEqual(json.pageWorthyKinds);
});

test("the Diátaxis quadrants are exactly the canonical four", () => {
  expect([...json.diataxis].sort()).toEqual(["explanation", "how-to", "reference", "tutorial"]);
});
