// viewsFor fans a page out to its tab views. The rules under test: every page
// has a rendered view; only PUBLISHED (status: ready) pages get a Markdown twin;
// scripts attach whenever a scripts.json entry's tutorialRoute matches the page's
// route — INDEPENDENT of status (docsnip indexes scripts regardless of
// frontmatter), so a draft tutorial still shows its scripts. Blog routes match too.
import { test, expect } from "bun:test";
import { blogRef, docRef } from "../../../lib/content-ref";
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

test("a draft page has no Markdown twin but STILL shows its scripts", () => {
  const views = viewsFor(ref, draftPage, indexWith(route));
  expect(views).toEqual([
    { kind: "rendered" },
    { kind: "script", fetchUrl: `${route}/snippets/s0.py` },
  ]);
});

test("a draft page with no matching scripts is rendered-only", () => {
  expect(viewsFor(ref, draftPage, indexWith())).toEqual([{ kind: "rendered" }]);
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

test("a published blog attaches scripts matched on its /blog/<slug> route", () => {
  const blog = blogRef("unity-catalog-delta-api");
  const blogRoute = "/blog/unity-catalog-delta-api";
  const views = viewsFor(blog, readyPage, indexWith(blogRoute));
  expect(views).toEqual([
    { kind: "rendered" },
    { kind: "md" },
    { kind: "script", fetchUrl: `${blogRoute}/snippets/s0.py` },
  ]);
});

test("a missing page (undefined) has no twin; rendered-only when no scripts match", () => {
  expect(viewsFor(ref, undefined, indexWith())).toEqual([{ kind: "rendered" }]);
});
