// viewsFor fans a page out to its tab-group views. The rules under test: every
// page has a rendered view; only PUBLISHED (status: ready) pages get a Markdown
// twin; scripts attach only when a scripts.json entry's tutorialRoute matches
// the page's canonical route (so a page's own scripts, and no others, appear).
import { test, expect } from "bun:test";
import { docRef } from "../../../lib/content-ref";
import type { ContentPage } from "../../../content";
import type { ScriptsIndex } from "../../../lib/scripts-index";
import { viewsFor } from "./item-views";

const ref = docRef("delta", "tutorials", "explore-table-history");
const route = "/docs/delta/tutorials/explore-table-history";

const readyPage = { frontmatter: { status: "ready" } } as unknown as ContentPage;
const draftPage = { frontmatter: { status: "draft" } } as unknown as ContentPage;

function indexWith(...routes: string[]): ScriptsIndex {
  return {
    version: 1,
    scripts: routes.map((tutorialRoute, i) => ({
      gitPath: `content/x/${i}.py`,
      fetchUrl: `${tutorialRoute}/snippets/s${i}.py`,
      tutorialRoute,
      tutorialSlug: "s",
      requiresPython: null,
      dependencies: null,
      compose: null,
      services: null,
      baseUrlEnv: null,
    })),
  };
}

test("a draft page gets only the rendered view (no twin, no scripts)", () => {
  const views = viewsFor(ref, draftPage, indexWith(route));
  expect(views).toEqual([{ kind: "rendered" }]);
});

test("a published page gets rendered + markdown", () => {
  const views = viewsFor(ref, readyPage, indexWith());
  expect(views).toEqual([{ kind: "rendered" }, { kind: "md" }]);
});

test("a published tutorial attaches its own scripts, not others'", () => {
  const index = indexWith(route, "/docs/delta/tutorials/other");
  const views = viewsFor(ref, readyPage, index);
  expect(views).toEqual([
    { kind: "rendered" },
    { kind: "md" },
    { kind: "script", fetchUrl: `${route}/snippets/s0.py` },
  ]);
});

test("a missing page (undefined) still opens as the rendered view", () => {
  expect(viewsFor(ref, undefined, indexWith(route))).toEqual([{ kind: "rendered" }]);
});
