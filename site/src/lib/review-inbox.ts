// Shared reviewer "inbox" queries — the cross-content signals that are NOT tied
// to any single page: pending review, latest comments, and open review requests
// (to me / by me). Lifted from ReviewDashboard so the dashboard and the review
// workspace's right pane read the same cached queries.
import { useQuery } from "@connectrpc/connect-query";
import { useMemo } from "react";
import {
  type DraftSummary,
  type RecentComment,
  ReviewState,
} from "../gen/docs_factory/review/v1/messages_pb";
import {
  listDrafts,
  listRecentComments,
  listReviewRequests,
} from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "./auth-context";
import { buildFeed, type FeedGroup } from "./comment-feed";
import { useShowResolved } from "./review-show-resolved";

const RECENT_WINDOW = 100;

/** Review states that count as active pending work for a reviewer. */
export const PENDING_REVIEW_STATES = new Set<ReviewState>([
  ReviewState.NEEDS_REVIEW,
  ReviewState.CHANGES_REQUESTED,
]);

export function useReviewInbox() {
  const { isAllowlisted } = useAuth();
  const drafts = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  // One window for the Inbox and the right pane's feed (the server's max).
  const recent = useQuery(
    listRecentComments,
    { limit: RECENT_WINDOW },
    { enabled: isAllowlisted, refetchInterval: 60_000, refetchIntervalInBackground: false },
  );
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
  // `ready` derives to RELEASED, so APPROVED is exactly "cleared, not yet ready".
  const approvedNotReady = allDrafts.filter(
    (d: DraftSummary) => d.reviewState === ReviewState.APPROVED,
  );

  return {
    drafts: allDrafts,
    pending,
    approvedNotReady,
    recent: recent.data?.comments ?? [],
    toMe: toMe.data?.requests ?? [],
    byMe: byMe.data?.requests ?? [],
    isLoading: drafts.isLoading || recent.isLoading || toMe.isLoading || byMe.isLoading,
  };
}

/**
 * The recent comments as a per-page thread feed. `titleOf` labels a page the
 * server has no version for (a planned slot), so the caller owns it.
 */
export function useCommentFeed(titleOf: (ref: RecentComment) => string): {
  groups: FeedGroup[];
  unreadThreads: number;
  resolvedThreads: number;
  isLoading: boolean;
  showResolved: boolean;
  setShowResolved: (show: boolean) => void;
} {
  const { recent, isLoading } = useReviewInbox();
  const [showResolved, setShowResolved] = useShowResolved();
  return useMemo(() => {
    const all = buildFeed(recent, { showResolved: true, titleOf });
    const threads = all.flatMap((g) => g.threads);
    return {
      groups: showResolved ? all : buildFeed(recent, { showResolved: false, titleOf }),
      unreadThreads: threads.filter((t) => t.unread > 0 && !t.resolved).length,
      resolvedThreads: threads.filter((t) => t.resolved).length,
      isLoading,
      showResolved,
      setShowResolved,
    };
  }, [recent, isLoading, showResolved, setShowResolved, titleOf]);
}
