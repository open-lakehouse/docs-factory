// Human label for a ContentRef tab: the page's frontmatter title when we can
// resolve it in the build-time content, else the slug. Kept separate so both
// the TabBar and any deep-link chrome share one definition.

import { findBlog, findDoc } from "../../../content";
import { ContentArea, type ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import type { TabView } from "./view-token";

export function tabLabel(ref: ContentRef): string {
  const page =
    ref.area === ContentArea.BLOGS
      ? findBlog(ref.slug)
      : findDoc(ref.project ?? "", ref.bucket ?? "", ref.slug);
  return page?.frontmatter.title || ref.slug || "(untitled)";
}

/**
 * Label for a sub-view within an item's group. Deliberately UNPREFIXED — the
 * parent item tab already carries the page name, so a sub-view only needs its
 * own distinguishing name: "Rendered", "Markdown", or a script's file name.
 */
export function viewLabel(view: TabView): string {
  switch (view.kind) {
    case "rendered":
      return "Rendered";
    case "md":
      return "Markdown";
    case "script":
      return view.fetchUrl.split("/").pop() || view.fetchUrl;
  }
}
