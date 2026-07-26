// Shared reviewer "inbox" queries — the cross-content signals that are NOT tied
// to any single page: pending review, latest comments, and open review requests
// (to me / by me). Lifted from ReviewDashboard so the dashboard and the review
// workspace's right pane read the same cached queries.
import { useQuery } from "@connectrpc/connect-query";
import {
  listDrafts,
  listRecentComments,
  listReviewRequests,
} from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ReviewState, type DraftSummary } from "../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "./auth-context";

const READY = "ready";

/** Review states that count as active pending work for a reviewer. */
export const PENDING_REVIEW_STATES = new Set<ReviewState>([
  ReviewState.IN_REVIEW,
  ReviewState.CHANGES_REQUESTED,
]);

export function useReviewInbox() {
  const { isAllowlisted } = useAuth();
  const drafts = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  const recent = useQuery(listRecentComments, { limit: 20 }, { enabled: isAllowlisted });
  const toMe = useQuery(
    listReviewRequests,
    { mine: true, openOnly: true },
    { enabled: isAllowlisted },
  );
  const byMe = useQuery(
    listReviewRequests,
    { byMe: true, openOnly: true },
    { enabled: isAllowlisted },
  );

  const allDrafts = drafts.data?.drafts ?? [];
  const pending = allDrafts.filter((d) => PENDING_REVIEW_STATES.has(d.reviewState));
  const approvedNotReady = allDrafts.filter(
    (d: DraftSummary) =>
      (d.reviewState === ReviewState.APPROVED || d.reviewState === ReviewState.RELEASED) &&
      d.frontmatterStatus !== READY,
  );

  return {
    drafts: allDrafts,
    pending,
    approvedNotReady,
    recent: recent.data?.comments ?? [],
    toMe: toMe.data?.requests ?? [],
    byMe: byMe.data?.requests ?? [],
    isLoading:
      drafts.isLoading || recent.isLoading || toMe.isLoading || byMe.isLoading,
  };
}
