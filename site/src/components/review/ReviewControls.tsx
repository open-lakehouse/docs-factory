// Review status badge + transition controls for a rendered blog/doc page.
// Allowlisted viewers see the current review state (distinct from the git
// frontmatter authoring status) and can advance it; maintainers can Release.
// Reads state from listDrafts (small list) and mutates via connect-query.
import { useState } from "react";
import { useQuery, useMutation } from "@connectrpc/connect-query";
import {
  listDrafts,
  transitionReview,
  releaseContent,
  requestChangesOnPublished,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ReviewState, type ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { sameRef, useReviewInvalidation } from "../../lib/review-queries";
import { ReviewStateBadge } from "../../lib/review-status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const { invalidateDrafts, invalidateContentEvents, invalidateReviewRequests } =
    useReviewInvalidation();
  const { data } = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  // Mutations invalidate the shared listDrafts cache (+ events/requests) on
  // success, so every mounted consumer (this badge, an index list, the timeline)
  // refreshes — not just this component's own query instance.
  const invalidateAll = () => {
    void invalidateDrafts();
    void invalidateContentEvents();
    void invalidateReviewRequests();
  };
  const transition = useMutation(transitionReview, { onSuccess: invalidateAll });
  const release = useMutation(releaseContent, { onSuccess: invalidateAll });
  const reopen = useMutation(requestChangesOnPublished, { onSuccess: invalidateAll });

  // Reopen-a-published-artifact dialog: the maintainer chooses keep-visible
  // (default) or unpublish when requesting changes on a released page.
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenNote, setReopenNote] = useState("");
  const [unpublish, setUnpublish] = useState(false);

  if (!reviewActive) return null;

  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const state = summary?.reviewState ?? ReviewState.NONE;
  const openRequired = summary?.openRequiredRequestCount ?? 0;

  async function go(to: ReviewState) {
    await transition.mutateAsync({ ref: contentRef, toState: to });
  }
  async function doRelease() {
    await release.mutateAsync({ ref: contentRef });
  }
  async function doReopen() {
    await reopen.mutateAsync({
      ref: contentRef,
      note: reopenNote.trim() || undefined,
      unpublish,
    });
    setReopenNote("");
    setUnpublish(false);
    setReopenOpen(false);
  }

  const busy = transition.isPending || release.isPending || reopen.isPending;
  const actions = NEXT[state] ?? [];
  const badge = <ReviewStateBadge state={state} />;

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
        <>
          <Button
            size={layout === "inline" ? "xs" : "sm"}
            onClick={doRelease}
            disabled={busy || openRequired > 0}
            className={layout !== "inline" ? "w-full" : undefined}
          >
            Release
          </Button>
          {openRequired > 0 && (
            <p className="review-controls-hint muted">
              Blocked: {openRequired} required review
              {openRequired === 1 ? "" : "s"} still open.
            </p>
          )}
        </>
      )}

      {/* Reopen a released artifact to request changes (maintainer-only, since it
          may unpublish). RELEASED is otherwise a dead end in the button map. */}
      {state === ReviewState.RELEASED && isMaintainer && (
        <Button
          variant="outline"
          size={layout === "inline" ? "xs" : "sm"}
          onClick={() => setReopenOpen(true)}
          disabled={busy}
          className={layout !== "inline" ? "w-full" : undefined}
        >
          Request changes
        </Button>
      )}

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes on a published page</DialogTitle>
            <DialogDescription>
              This reopens the review (state → changes requested). By default the page
              stays public; choose to unpublish if it should be hidden while you work.
            </DialogDescription>
          </DialogHeader>

          <label className="request-review-field">
            <span>Note (optional)</span>
            <Textarea
              value={reopenNote}
              onChange={(e) => setReopenNote(e.target.value)}
              placeholder="What needs to change?"
              rows={2}
              autoFocus
            />
          </label>

          <label className="review-controls-unpublish">
            <input
              type="checkbox"
              checked={unpublish}
              onChange={(e) => setUnpublish(e.target.checked)}
            />
            <span>Also unpublish (hide the page while under review)</span>
          </label>

          {reopen.isError && (
            <p className="request-review-error">{reopen.error?.message ?? "Reopen failed."}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={reopen.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void doReopen()} disabled={reopen.isPending}>
              {reopen.isPending ? "Reopening…" : unpublish ? "Reopen & unpublish" : "Reopen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
