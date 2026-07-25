// Compact sticky chrome for a review-workspace tab: key page metadata on the
// left, review lifecycle + request controls on the right. Sits as a flex sibling
// above the scroll pane (not position:sticky inside it) so deep-link scrolling
// still targets the article container.
import { ContentArea, type ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import type { ContentPage } from "../../../content";
import { useAuth } from "../../../lib/auth-context";
import AuthorBadge from "../../AuthorBadge";
import { FrontmatterStatusBadge } from "../../StatusBadge";
import ReviewControls from "../ReviewControls";
import RequestReviewControl from "../RequestReviewControl";

export default function ReviewTabChrome({
  contentRef,
  page,
}: {
  contentRef: ContentRef;
  page: ContentPage;
}) {
  const { reviewActive } = useAuth();
  const fm = page.frontmatter;
  const isBlog = contentRef.area === ContentArea.BLOGS;

  return (
    <div className="review-tab-chrome" aria-label="Page metadata and review">
      <div className="review-tab-chrome-meta">
        {fm.status && <FrontmatterStatusBadge status={fm.status} />}
        {isBlog && fm.series && (
          <span className="review-tab-chrome-series">{fm.series}</span>
        )}
        {isBlog && fm.author && <AuthorBadge byline={fm.author} />}
        {isBlog && fm.date && <span className="mono review-tab-chrome-muted">{fm.date}</span>}
        {isBlog && fm.target && (
          <span className="mono review-tab-chrome-muted">→ {fm.target}</span>
        )}
        {!isBlog && fm.diataxis && (
          <span className="mono review-tab-chrome-muted">{fm.diataxis}</span>
        )}
        {!isBlog && page.project && (
          <span className="mono review-tab-chrome-muted">
            {page.project}
            {page.bucket ? ` / ${page.bucket}` : ""}
          </span>
        )}
      </div>

      {reviewActive && (
        <div className="review-tab-chrome-actions">
          <ReviewControls contentRef={contentRef} layout="inline" />
          <RequestReviewControl contentRef={contentRef} />
        </div>
      )}
    </div>
  );
}
