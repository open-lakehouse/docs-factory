// The Model section reads the repo's real model, content, and registry, so
// these check the joins against the checkout rather than fixtures.
import { expect, test } from "bun:test";
import path from "node:path";
import { DOCS_SITES } from "../../../emit/docs/sites/index.mjs";
import { buildConcepts, buildModelIndex, readPages } from "../../scripts/model-index.mjs";
import { CONCEPT_SITES } from "./model-index";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const pages = readPages(repoRoot);
const index = buildModelIndex({ repoRoot, pages });

test("CONCEPT_SITES matches the emitter's docs sites", () => {
  expect([...CONCEPT_SITES].sort()).toEqual(DOCS_SITES.map((s) => s.name).sort());
});

test("every explains: lands on its element, with the page's status", () => {
  const explaining = pages.filter((p) => typeof p.meta.explains === "string");
  expect(explaining.length).toBeGreaterThan(0);
  for (const p of explaining) {
    const links = index.elements[p.meta.explains]?.explainedBy ?? [];
    expect(links).toContainEqual(
      expect.objectContaining({ slug: p.identity.slug, status: p.meta.status ?? "draft" }),
    );
  }
});

test("a site's concepts are exactly the elements the index marks published there", () => {
  const concepts = buildConcepts({ repoRoot, pages });
  for (const site of DOCS_SITES) {
    const ids = concepts[site.name].concepts.map((c: { id: string }) => c.id).sort();
    const published = Object.entries(index.elements)
      .filter(([, el]) => el.published[site.name]?.inConcepts)
      .map(([id]) => id)
      .sort();
    expect(ids).toEqual(published);
    for (const id of ids) expect(index.elements[id].public).toBe(true);
  }
});
