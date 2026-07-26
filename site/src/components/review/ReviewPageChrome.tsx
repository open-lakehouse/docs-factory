// Shared page metadata + review controls. The review workspace keeps this
// visible for page context; regular content pages show it only in review mode.
import { ContentArea, type ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import type { ContentPage } from "../../content";
import { useAuth } from "../../lib/auth-context";
import AuthorBadge from "../AuthorBadge";
import { FrontmatterStatusBadge } from "../StatusBadge";
import ReviewControls from "./ReviewControls";
import RequestReviewControl from "./RequestReviewControl";

interface ReviewPageChromeProps {
  contentRef: ContentRef;
  page: ContentPage;
  alwaysVisible?: boolean;
}

export default function ReviewPageChrome({
  contentRef,
  page,
  alwaysVisible = false,
}: ReviewPageChromeProps) {
  const { reviewActive } = useAuth();
  const fm = page.frontmatter;
  const isBlog = contentRef.area === ContentArea.BLOGS;

  if (!reviewActive && !alwaysVisible) return null;

  return (
    <div className="review-page-chrome" aria-label="Page metadata and review">
      <div className="review-page-chrome-meta">
        {fm.status && <FrontmatterStatusBadge status={fm.status} />}
        {isBlog && fm.series && (
          <span className="review-page-chrome-series">{fm.series}</span>
        )}
        {isBlog && fm.author && <AuthorBadge byline={fm.author} />}
        {isBlog && fm.date && <span className="mono review-page-chrome-muted">{fm.date}</span>}
        {isBlog && fm.target && (
          <span className="mono review-page-chrome-muted">→ {fm.target}</span>
        )}
        {!isBlog && fm.diataxis && (
          <span className="mono review-page-chrome-muted">{fm.diataxis}</span>
        )}
        {!isBlog && page.project && (
          <span className="mono review-page-chrome-muted">
            {page.project}
            {page.bucket ? ` / ${page.bucket}` : ""}
          </span>
        )}
      </div>

      {reviewActive && (
        <div className="review-page-chrome-actions">
          <RequestReviewControl
            contentRef={contentRef}
            renderTrigger={(openRequestReview) => (
              <ReviewControls
                contentRef={contentRef}
                layout="inline"
                onRequestReview={openRequestReview}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}
