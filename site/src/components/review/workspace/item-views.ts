// Fan one sidebar item out to the set of VIEWS its tab opens. Clicking a page
// opens: always the rendered page and its `.md` twin; the page's emitted
// `<head>`; and one view per runnable script served alongside it.
//
// No view is gated on status: the app is login-gated, so a draft's companions
// are as reviewable as a ready page's.
//   - `.md` twin: build-md-twins emits one for every page.
//   - head: docs pages of a project with a docs site.
//   - scripts: one per scripts.json entry whose route matches the page's.

import type { ContentPage } from "../../../content";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { refHref } from "../../../lib/content-ref";
import { hasPageHead } from "../../../lib/page-heads";
import type { ScriptsIndex } from "../../../lib/scripts-index";
import type { TabView } from "./view-token";

/**
 * The ordered views for an item: rendered, then the md twin, then the head
 * (docs-site pages), then one script view per scripts.json entry owned by this page. Order is
 * stable so the tab list and the URL token list stay deterministic.
 */
export function viewsFor(
  ref: ContentRef,
  page: ContentPage | undefined,
  scriptsIndex: ScriptsIndex,
): TabView[] {
  const views: TabView[] = [{ kind: "rendered" }];

  if (page) views.push({ kind: "md" });

  if (page?.area === "docs" && hasPageHead(page.project)) {
    views.push({ kind: "head" });
  }

  // refHref(ref) is the tutorialRoute the build recorded on each entry.
  const route = refHref(ref);
  for (const entry of scriptsIndex.scripts) {
    if (entry.tutorialRoute === route && entry.fetchUrl) {
      views.push({ kind: "script", fetchUrl: entry.fetchUrl });
    }
  }

  return views;
}
