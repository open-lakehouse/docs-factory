// ReviewSurfaces — the three DOM-coupled review surfaces that overlay a rendered
// article, grouped so both the single-page routes (DocPage / BlogPost) and the
// editor workspace's tabs mount the identical set. Must be rendered INSIDE a
// <ReviewProvider> (for useReview) and a <SelectionProvider> (for the pending
// selection state); it reads both.
//
// `isActive` gates the DOM-global side effects (fixed portals to document.body,
// the CSS Custom Highlight API, document-level mouse listeners, injected "Review
// source" buttons). The single-page routes always have exactly one article, so
// it defaults to true. The editor workspace keeps every open tab mounted but
// passes isActive only to the active tab, so an inactive tab paints nothing
// global over the active one.
import { type RefObject } from "react";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import InlineReviewSurface from "./InlineReviewSurface";
import SelectionLayer from "./SelectionLayer";
import SourceFileLauncher from "./SourceFileLauncher";

export default function ReviewSurfaces({
  contentRef,
  articleRef,
  isActive = true,
  highlightKey,
}: {
  contentRef: ContentRef;
  articleRef: RefObject<HTMLElement | null>;
  isActive?: boolean;
  /** Editor workspace: a per-tab key so each tab's quote highlights register
   * under their own names (defense-in-depth against the document-global CSS
   * Custom Highlight registry). Omitted by the single-page routes. */
  highlightKey?: string;
}) {
  return (
    <>
      <InlineReviewSurface articleRef={articleRef} isActive={isActive} highlightKey={highlightKey} />
      <SelectionLayer articleRef={articleRef} isActive={isActive} />
      <SourceFileLauncher contentRef={contentRef} articleRef={articleRef} isActive={isActive} />
    </>
  );
}
