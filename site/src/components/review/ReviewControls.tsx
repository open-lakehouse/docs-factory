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
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type ReviewControlsLayout = "inline" | "aside" | "dock";

// Badge tone per review state: released = solid, approved = default accent,
// changes-requested = destructive, in-review/none = muted outline/secondary.
const BADGE_VARIANT: Record<number, BadgeVariant> = {
  [ReviewState.NONE]: "outline",
  [ReviewState.IN_REVIEW]: "secondary",
  [ReviewState.CHANGES_REQUESTED]: "destructive",
  [ReviewState.APPROVED]: "default",
  [ReviewState.RELEASED]: "default",
};

const LABEL: Record<number, string> = {
  [ReviewState.NONE]: "not in review",
  [ReviewState.IN_REVIEW]: "in review",
  [ReviewState.CHANGES_REQUESTED]: "changes requested",
  [ReviewState.APPROVED]: "approved",
  [ReviewState.RELEASED]: "released",
};

// Reviewer-available transitions from each state (Release handled separately).
const NEXT: Record<number, { to: ReviewState; label: string }[]> = {
  [ReviewState.NONE]: [{ to: ReviewState.IN_REVIEW, label: "Start review" }],
  [ReviewState.IN_REVIEW]: [
    { to: ReviewState.APPROVED, label: "Approve" },
    { to: ReviewState.CHANGES_REQUESTED, label: "Request changes" },
  ],
  [ReviewState.CHANGES_REQUESTED]: [{ to: ReviewState.IN_REVIEW, label: "Back to review" }],
  [ReviewState.APPROVED]: [{ to: ReviewState.IN_REVIEW, label: "Reopen review" }],
  [ReviewState.RELEASED]: [],
};

export default function ReviewControls({
  contentRef,
  layout = "inline",
}: {
  contentRef: ContentRef;
  layout?: ReviewControlsLayout;
}) {
  const { isAllowlisted, isMaintainer } = useAuth();
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

  if (!isAllowlisted) return null;

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

  return (
    <div
      className={cn(
        "review-controls",
        layout === "aside" && "review-controls--aside",
        layout === "dock" && "review-controls--dock",
      )}
    >
      <Badge variant={BADGE_VARIANT[state] ?? "secondary"} className="review-controls-badge">
        review: {LABEL[state] ?? "unknown"}
      </Badge>
      {actions.length > 0 && (
        <div className="review-controls-actions">
          {actions.map((t) => (
            <Button
              key={t.to}
              variant="outline"
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
