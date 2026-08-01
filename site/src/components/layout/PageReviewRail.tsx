// Page-route review rail body — same sections as the ReviewWorkspace RightPane:
// comments (when displayMode is rail) above the per-page Activity timeline.
// Blog and docs asides host this so page review and workspace review stay aligned.
import type { RefObject } from "react";
import type { ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import CommentSidebar from "../review/CommentSidebar";
import ContentEventTimeline from "../review/ContentEventTimeline";
import { useReview } from "../review/review-context";

export default function PageReviewRail({
  articleRef,
  contentRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  contentRef: ContentRef;
}) {
  const { displayMode } = useReview();
  const showComments = displayMode === "rail";

  return (
    <>
      {showComments && (
        <div className="workspace-section-divider">
          <div className="review-rail-body p-3">
            <CommentSidebar articleRef={articleRef} />
          </div>
        </div>
      )}
      <section className="workspace-activity" aria-label="Activity">
        <ContentEventTimeline contentRef={contentRef} heading="Activity" />
      </section>
    </>
  );
}
