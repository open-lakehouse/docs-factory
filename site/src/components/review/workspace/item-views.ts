// Fan one sidebar item out to the set of VIEWS its tab group should contain.
// Clicking a page opens: always the rendered page; the `.md` twin when one is
// built for it; and one view per runnable script served alongside it.
//
// Twins and scripts are only emitted for PUBLIC (`status: ready`) pages
// (build-md-twins / build-script-index gate on isPublic), so a draft/idea under
// review has neither — it opens as just the rendered view. That keeps us from
// offering a Markdown/script tab that would only ever 404.
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import type { ContentPage } from "../../../content";
import { refHref } from "../../../lib/content-ref";
import type { ScriptsIndex } from "../../../lib/scripts-index";
import type { TabView } from "./view-token";

/**
 * The ordered views for an item: rendered, then the md twin (if published),
 * then one script view per scripts.json entry owned by this page. Order is
 * stable so the sub-view strip and the URL token list stay deterministic.
 */
export function viewsFor(
  ref: ContentRef,
  page: ContentPage | undefined,
  scriptsIndex: ScriptsIndex,
): TabView[] {
  const views: TabView[] = [{ kind: "rendered" }];

  const published = page?.frontmatter.status === "ready";
  if (published) {
    views.push({ kind: "md" });

    // refHref(ref) is the tutorialRoute the build recorded on each script entry.
    const route = refHref(ref);
    for (const entry of scriptsIndex.scripts) {
      if (entry.tutorialRoute === route && entry.fetchUrl) {
        views.push({ kind: "script", fetchUrl: entry.fetchUrl });
      }
    }
  }

  return views;
}
