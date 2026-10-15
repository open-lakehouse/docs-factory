// HEAD_PROJECTS gates the Head tab before page-heads.json loads, so it must name
// exactly the projects the emitter has a docs site for.
import { expect, test } from "bun:test";
import { DOCS_SITES } from "../../../emit/docs/sites/index.mjs";
import { HEAD_PROJECTS } from "./page-heads";

test("HEAD_PROJECTS matches the emitter's docs sites", () => {
  expect([...HEAD_PROJECTS].sort()).toEqual(DOCS_SITES.map((s) => s.project).sort());
});
