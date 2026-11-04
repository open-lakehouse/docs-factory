import { findBlog, findDoc } from "../content";
import { parsePlannedSlug } from "../content-core/identity.mjs";
import { ContentArea, type ContentRef } from "../gen/docs_factory/review/v1/messages_pb";

/**
 * True when the review DB knows a blog or doc page this build doesn't ship (it
 * was deleted or renamed in git). Planned slots and model threads never have a
 * page, so they are never orphans.
 */
export function isOrphaned(ref: ContentRef | undefined): boolean {
  if (!ref?.slug) return false;
  if (ref.area === ContentArea.BLOGS) return !findBlog(ref.slug);
  if (ref.area === ContentArea.DOCS) {
    // A planned slot with only threads has no version, so no bucket: match the slug.
    if (parsePlannedSlug(ref.slug)) return false;
    return !findDoc(ref.project ?? "", ref.bucket ?? "", ref.slug);
  }
  return false;
}
