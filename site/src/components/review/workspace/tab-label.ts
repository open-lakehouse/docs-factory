// Human label for a ContentRef tab: the page's frontmatter title when we can
// resolve it in the build-time content, else the slug. Kept separate so both
// the TabBar and any deep-link chrome share one definition.
import { ContentArea, type ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { findBlog, findDoc } from "../../../content";

export function tabLabel(ref: ContentRef): string {
  const page =
    ref.area === ContentArea.BLOGS
      ? findBlog(ref.slug)
      : findDoc(ref.project ?? "", ref.bucket ?? "", ref.slug);
  return page?.frontmatter.title || ref.slug || "(untitled)";
}
