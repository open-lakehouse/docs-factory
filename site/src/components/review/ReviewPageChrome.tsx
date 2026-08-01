// Shared page metadata + review controls. The review workspace keeps this
// visible for page context; regular content pages show it only in review mode.
import { useQuery } from "@connectrpc/connect-query";
import { timestampDate, type Timestamp } from "@bufbuild/protobuf/wkt";
import { History } from "lucide-react";
import { ContentArea, type ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { listDrafts } from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import type { ContentPage } from "../../content";
import { useAuth } from "../../lib/auth-context";
import { EffectiveStatusBadge } from "../../lib/effective-status";
import { sameRef } from "../../lib/review-queries";
import AuthorBadge from "../AuthorBadge";
import { FrontmatterStatusBadge } from "../StatusBadge";
import ReviewControls from "./ReviewControls";
import RequestReviewControl from "./RequestReviewControl";

interface ReviewPageChromeProps {
  contentRef: ContentRef;
  page: ContentPage;
  alwaysVisible?: boolean;
}

/** Format a protobuf Timestamp as YYYY-MM-DD (UTC calendar day). */
function dayLabel(ts: Timestamp | undefined): string | null {
  if (!ts) return null;
  return timestampDate(ts).toISOString().slice(0, 10);
}

export default function ReviewPageChrome({
  contentRef,
  page,
  alwaysVisible = false,
}: ReviewPageChromeProps) {
  const { reviewActive, isAllowlisted } = useAuth();
  const fm = page.frontmatter;
  const isBlog = contentRef.area === ContentArea.BLOGS;
  const { data } = useQuery(listDrafts, {}, { enabled: reviewActive && isAllowlisted });
  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const lastUpdated = dayLabel(summary?.latestVersion?.createdAt);
  const targetRelease = dayLabel(summary?.targetReleaseDate);

  if (!reviewActive && !alwaysVisible) return null;

  return (
    <div className="review-page-chrome" aria-label="Page metadata and review">
      <div className="review-page-chrome-meta">
        {/* Compact chrome leads with one effective status. Dual-axis display
            lives in detailed listings (blog pipeline, ContentTable). */}
        {reviewActive && (
          <EffectiveStatusBadge
            frontmatterStatus={fm.status}
            reviewState={summary?.reviewState}
          />
        )}
        {!reviewActive && fm.status && <FrontmatterStatusBadge status={fm.status} />}
        {isBlog && fm.author && <AuthorBadge byline={fm.author} />}
        {reviewActive && lastUpdated && (
          <span
            className="mono review-page-chrome-muted inline-flex items-center gap-1"
            title="Last content update"
            aria-label={`Last updated ${lastUpdated}`}
          >
            <History aria-hidden className="size-3.5" />
            {lastUpdated}
          </span>
        )}
        {reviewActive && targetRelease && (
          <span className="mono review-page-chrome-muted" title="Target release date">
            target {targetRelease}
          </span>
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
          <RequestReviewControl contentRef={contentRef}>
            <ReviewControls
              contentRef={contentRef}
              frontmatterStatus={fm.status}
              layout="inline"
              showStatus={false}
            />
          </RequestReviewControl>
        </div>
      )}
    </div>
  );
}
