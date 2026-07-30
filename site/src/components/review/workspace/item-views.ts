// Fan one sidebar item out to the set of VIEWS its tab opens. Clicking a page
// opens: always the rendered page; the `.md` twin when one is built for it; and
// one view per runnable script served alongside it.
//
// The two companion views have DIFFERENT availability, so they're gated
// independently:
//   - `.md` twin: only emitted for PUBLIC (`status: ready`) pages — build-md-twins
//     gates on isPublic — so a draft/idea would only 404. Gate on ready.
//   - scripts: docsnip discovers every `# /// script` file regardless of the
//     page's frontmatter (build-script-index does NOT filter by status), so a
//     DRAFT tutorial still has runnable scripts in scripts.json. Show them
//     whenever an entry matches the page's route — never gate scripts on status.
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import type { ContentPage } from "../../../content";
import { refHref } from "../../../lib/content-ref";
import type { ScriptsIndex } from "../../../lib/scripts-index";
import type { TabView } from "./view-token";

/**
 * The ordered views for an item: rendered, then the md twin (if published),
 * then one script view per scripts.json entry owned by this page. Order is
 * stable so the tab list and the URL token list stay deterministic.
 */
export function viewsFor(
  ref: ContentRef,
  page: ContentPage | undefined,
  scriptsIndex: ScriptsIndex,
): TabView[] {
  const views: TabView[] = [{ kind: "rendered" }];

  // The `.md` twin exists only for published pages.
  if (page?.frontmatter.status === "ready") {
    views.push({ kind: "md" });
  }

  // Scripts are matched purely on scripts.json membership (any status).
  // refHref(ref) is the tutorialRoute the build recorded on each entry.
  const route = refHref(ref);
  for (const entry of scriptsIndex.scripts) {
    if (entry.tutorialRoute === route && entry.fetchUrl) {
      views.push({ kind: "script", fetchUrl: entry.fetchUrl });
    }
  }

  return views;
}
