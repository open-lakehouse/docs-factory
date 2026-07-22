// Review status badge + transition controls for a rendered blog/doc page.
// Allowlisted viewers see the current review state (distinct from the git
// frontmatter authoring status) and can advance it; maintainers can Release.
// Reads state from listDrafts (small list) and mutates via connect-query.
import { useQuery, useMutation } from "@connectrpc/connect-query";
import {
  listDrafts,
  transitionReview,
  releaseContent,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ReviewState, type ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { sameRef, useReviewInvalidation } from "../../lib/review-queries";
import { REVIEW_BADGE_VARIANT, REVIEW_STATE_LABEL } from "../../lib/review-status";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ReviewControlsLayout = "inline" | "aside" | "dock";

type TransitionVariant = "default" | "outline";

// Reviewer-available transitions from each state (Release handled separately).
// `variant` gives each state one accented primary action; secondary/caution
// actions stay outline so the control block reads with a clear hierarchy.
const NEXT: Record<number, { to: ReviewState; label: string; variant: TransitionVariant }[]> = {
  [ReviewState.NONE]: [{ to: ReviewState.IN_REVIEW, label: "Start review", variant: "default" }],
  [ReviewState.IN_REVIEW]: [
    { to: ReviewState.APPROVED, label: "Approve", variant: "default" },
    { to: ReviewState.CHANGES_REQUESTED, label: "Request changes", variant: "outline" },
  ],
  [ReviewState.CHANGES_REQUESTED]: [
    { to: ReviewState.IN_REVIEW, label: "Back to review", variant: "default" },
  ],
  [ReviewState.APPROVED]: [{ to: ReviewState.IN_REVIEW, label: "Reopen review", variant: "outline" }],
  [ReviewState.RELEASED]: [],
};

export default function ReviewControls({
  contentRef,
  layout = "inline",
  heading,
}: {
  contentRef: ContentRef;
  layout?: ReviewControlsLayout;
  /** When set, renders a section heading with the state badge beside it (used
   * by the blog aside) instead of a standalone `review: <state>` badge. */
  heading?: string;
}) {
  const { isAllowlisted, isMaintainer, reviewActive } = useAuth();
  const { invalidateDrafts } = useReviewInvalidation();
  const { data } = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  // Both mutations invalidate the shared listDrafts cache on success, so every
  // mounted consumer (this badge, an index list) refreshes — not just this
  // component's own query instance.
  const transition = useMutation(transitionReview, {
    onSuccess: () => void invalidateDrafts(),
  });
  const release = useMutation(releaseContent, {
    onSuccess: () => void invalidateDrafts(),
  });

  if (!reviewActive) return null;

  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const state = summary?.reviewState ?? ReviewState.NONE;

  async function go(to: ReviewState) {
    await transition.mutateAsync({ ref: contentRef, toState: to });
  }
  async function doRelease() {
    await release.mutateAsync({ ref: contentRef });
  }

  const busy = transition.isPending || release.isPending;
  const actions = NEXT[state] ?? [];
  const stateLabel = REVIEW_STATE_LABEL[state] ?? "unknown";
  const badge = (
    <Badge variant={REVIEW_BADGE_VARIANT[state] ?? "secondary"} className="review-controls-badge">
      {heading ? stateLabel : `review: ${stateLabel}`}
    </Badge>
  );

  return (
    <div
      className={cn(
        "review-controls",
        layout === "aside" && "review-controls--aside",
        layout === "dock" && "review-controls--dock",
      )}
    >
      {heading ? (
        <div className="review-controls-header">
          <p className="blog-aside-title">{heading}</p>
          {badge}
        </div>
      ) : (
        badge
      )}
      {actions.length > 0 && (
        <div className="review-controls-actions">
          {actions.map((t) => (
            <Button
              key={t.to}
              variant={t.variant}
              size={layout === "inline" ? "xs" : "sm"}
              onClick={() => go(t.to)}
              disabled={busy}
            >
              {t.label}
            </Button>
          ))}
        </div>
      )}
      {state === ReviewState.APPROVED && isMaintainer && (
        <Button
          size={layout === "inline" ? "xs" : "sm"}
          onClick={doRelease}
          disabled={busy}
          className={layout !== "inline" ? "w-full" : undefined}
        >
          Release
        </Button>
      )}
    </div>
  );
}
