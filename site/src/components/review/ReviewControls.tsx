// Review status badge + transition controls for a rendered blog/doc page.
// Allowlisted viewers see the current review state (distinct from the git
// frontmatter authoring status) and can advance it; maintainers can Release.
// Reads state from listDrafts (small list) and mutates via connect-query.
import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "@connectrpc/connect-query";
import {
  listDrafts,
  transitionReview,
  releaseContent,
  requestChangesOnPublished,
  recordApproval,
  dismissApproval,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ReviewState, type ContentRef } from "../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../lib/auth-context";
import { sameRef, useReviewInvalidation } from "../../lib/review-queries";
import { ReviewStateBadge } from "../../lib/review-status";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Reviewer-available EXPLICIT transitions from each derived state (Approve is a
// separate recordApproval action, Release/reopen handled separately). Approval is
// no longer a transition — it's recorded per reviewer and the state derives to
// APPROVED once preconditions are met, so there is no "Start review"/"Back to
// review"/"Reopen review" step. The only transition surfaced here is "Request
// changes", available while the artifact needs review or is approved.
const NEXT: Record<number, { to: ReviewState; label: string; variant: TransitionVariant }[]> = {
  [ReviewState.NONE]: [],
  [ReviewState.NEEDS_REVIEW]: [
    { to: ReviewState.CHANGES_REQUESTED, label: "Request changes", variant: "outline" },
  ],
  [ReviewState.CHANGES_REQUESTED]: [],
  [ReviewState.APPROVED]: [
    { to: ReviewState.CHANGES_REQUESTED, label: "Request changes", variant: "outline" },
  ],
  [ReviewState.RELEASED]: [],
};

export default function ReviewControls({
  contentRef,
  layout = "inline",
  heading,
  onRequestReview,
}: {
  contentRef: ContentRef;
  layout?: ReviewControlsLayout;
  /** When set, renders a section heading with the state badge beside it (used
   * by the blog aside) instead of a standalone `review: <state>` badge. */
  heading?: string;
  /** Opens the shared request-review dialog. When present, requesting a review
   * participates in the same single/dropdown action control as transitions. */
  onRequestReview?: () => void;
}) {
  const { isAllowlisted, isMaintainer, reviewActive, viewer } = useAuth();
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
  const approve = useMutation(recordApproval, { onSuccess: invalidateAll });
  const dismiss = useMutation(dismissApproval, { onSuccess: invalidateAll });

  // Reopen-a-published-artifact dialog: the maintainer chooses keep-visible
  // (default) or unpublish when requesting changes on a released page.
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenNote, setReopenNote] = useState("");
  const [unpublish, setUnpublish] = useState(false);

  if (!reviewActive) return null;

  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const state = summary?.reviewState ?? ReviewState.NONE;
  const openRequired = summary?.openRequiredRequestCount ?? 0;
  const approvals = summary?.approvals ?? [];
  const pendingRequired = summary?.pendingRequiredLogins ?? [];
  const iApproved =
    !!viewer?.userId && approvals.some((a) => a.approverUserId === viewer.userId);

  async function go(to: ReviewState) {
    await transition.mutateAsync({ ref: contentRef, toState: to });
  }
  async function doApprove() {
    await approve.mutateAsync({ ref: contentRef });
  }
  async function doDismiss() {
    await dismiss.mutateAsync({ ref: contentRef });
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

  const busy =
    transition.isPending ||
    release.isPending ||
    reopen.isPending ||
    approve.isPending ||
    dismiss.isPending;
  const actions = NEXT[state] ?? [];
  const badge = <ReviewStateBadge state={state} />;
  const size = layout === "inline" ? "xs" : "sm";
  type ActionOption = {
    key: string;
    label: string;
    variant?: TransitionVariant;
    disabled?: boolean;
    run: () => void | Promise<void>;
  };
  // Approve (or Dismiss my approval) is the happy-path primary while the artifact
  // is still open for review; then any explicit transitions (Request changes);
  // then Release/reopen; then request-review. The first `default` option becomes
  // the split-button primary; the rest open from the chevron.
  const actionOptions: ActionOption[] = [];
  const canApprove =
    state === ReviewState.NEEDS_REVIEW ||
    state === ReviewState.CHANGES_REQUESTED ||
    state === ReviewState.APPROVED;
  if (canApprove) {
    actionOptions.push(
      iApproved
        ? { key: "dismiss", label: "Dismiss my approval", variant: "outline", run: doDismiss }
        : { key: "approve", label: "Approve", variant: "default", run: doApprove },
    );
  }
  for (const action of actions) {
    actionOptions.push({
      key: `state-${action.to}`,
      label: action.label,
      variant: action.variant,
      run: () => go(action.to),
    });
  }

  if (state === ReviewState.APPROVED && isMaintainer) {
    actionOptions.unshift({
      key: "release",
      label: "Release",
      variant: "default",
      disabled: openRequired > 0,
      run: doRelease,
    });
  }
  if (state === ReviewState.RELEASED && isMaintainer) {
    actionOptions.push({
      key: "request-changes-published",
      label: "Request changes",
      variant: "outline",
      run: () => setReopenOpen(true),
    });
  }
  if (onRequestReview) {
    actionOptions.push({
      key: "request-review",
      label: "Request review",
      variant: "outline",
      run: onRequestReview,
    });
  }

  const primaryIdx = Math.max(
    0,
    actionOptions.findIndex((action) => action.variant === "default"),
  );
  const primary = actionOptions[primaryIdx];
  const secondary = actionOptions.filter((_, i) => i !== primaryIdx);

  let actionControl: ReactNode = null;
  if (actionOptions.length === 1 && primary) {
    actionControl = (
      <Button
        variant={primary.variant}
        size={size}
        onClick={() => void primary.run()}
        disabled={busy || primary.disabled}
      >
        {primary.label}
      </Button>
    );
  } else if (primary && secondary.length > 0) {
    actionControl = (
      <div className="review-controls-split">
        <Button
          variant={primary.variant ?? "default"}
          size={size}
          onClick={() => void primary.run()}
          disabled={busy || primary.disabled}
          className="review-controls-split-primary"
        >
          {primary.label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={primary.variant ?? "default"}
              size={size}
              disabled={busy}
              aria-label="More review actions"
              className="review-controls-split-toggle"
            >
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="review-actions-menu">
            {secondary.map((action) => (
              <DropdownMenuItem
                key={action.key}
                disabled={action.disabled}
                onSelect={() => void action.run()}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

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
      {actionControl && <div className="review-controls-actions">{actionControl}</div>}
      {approvals.length > 0 && (
        <p className="review-controls-hint muted">
          Approved by {approvals.map((a) => a.approverLogin || a.approverUserId).join(", ")}.
        </p>
      )}
      {pendingRequired.length > 0 && (
        <p className="review-controls-hint muted">
          Required: {pendingRequired.join(", ")} still pending.
        </p>
      )}
      {state === ReviewState.APPROVED && isMaintainer && openRequired > 0 && (
        <p className="review-controls-hint muted">
          Blocked: {openRequired} required review
          {openRequired === 1 ? "" : "s"} still open.
        </p>
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
