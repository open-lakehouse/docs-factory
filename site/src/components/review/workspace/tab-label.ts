// Human label for a ContentRef tab: the page's frontmatter title when we can
// resolve it in the build-time content, else the slug. Kept separate so both
// the TabBar and any deep-link chrome share one definition.

import { findBlog, findDoc } from "../../../content";
import { projectNav } from "../../../doc-nav";
import { ContentArea, type ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { plannedOf } from "../../../lib/content-ref";
import { findPlannedSlot } from "./planned-slot";
import type { TabView } from "./view-token";

export function tabLabel(ref: ContentRef): string {
  const planned = plannedOf(ref);
  if (planned) {
    const slot = findPlannedSlot(projectNav[planned.project] ?? [], planned.id);
    return `${planned.id} · ${slot?.title ?? "planned"}`;
  }
  const page =
    ref.area === ContentArea.BLOGS
      ? findBlog(ref.slug)
      : findDoc(ref.project ?? "", ref.bucket ?? "", ref.slug);
  return page?.frontmatter.title || ref.slug || "(untitled)";
}

/**
 * Label for a sub-view within an item's group. Deliberately UNPREFIXED — the
 * parent item tab already carries the page name, so a sub-view only needs its
 * own distinguishing name: "Rendered", "Markdown", "Head", or a script's file name.
 */
export function viewLabel(view: TabView): string {
  switch (view.kind) {
    case "rendered":
      return "Rendered";
    case "md":
      return "Markdown";
    case "head":
      return "Head";
    case "script":
      return view.fetchUrl.split("/").pop() || view.fetchUrl;
  }
}
