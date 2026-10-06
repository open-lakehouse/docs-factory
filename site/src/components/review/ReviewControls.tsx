// Review status badge + review actions for a rendered blog/doc page.
// Allowlisted viewers see one effective status and can approve or request
// changes. There is no Release action: approval tells the author (or an agent)
// to set `status: ready`, and that merged to main is the release (ADR-0002).
// Private pages have no approval; a requested reviewer marks them reviewed.
// Reads state from listDrafts and mutates via connect-query.

import { useMutation, useQuery } from "@connectrpc/connect-query";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type ContentRef, ReviewState } from "../../gen/docs_factory/review/v1/messages_pb";
import {
  dismissApproval,
  listDrafts,
  listReviewRequests,
  markReviewed,
  recordApproval,
  transitionReview,
} from "../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../lib/auth-context";
import { EffectiveStatusBadge } from "../../lib/effective-status";
import { sameRef, useReviewInvalidation } from "../../lib/review-queries";

type ReviewControlsLayout = "inline" | "aside" | "dock";

type TransitionVariant = "default" | "outline";

export default function ReviewControls({
  contentRef,
  frontmatterStatus,
  layout = "inline",
  heading,
  showStatus = true,
}: {
  contentRef: ContentRef;
  /** Git frontmatter status — folded with reviewState into one effective badge. */
  frontmatterStatus?: string;
  layout?: ReviewControlsLayout;
  /** When set, renders a section heading with the state badge beside it (used
   * by the blog aside) instead of a standalone `review: <state>` badge. */
  heading?: string;
  /** Compact chrome may render the effective status separately at its leading edge. */
  showStatus?: boolean;
}) {
  const { isAllowlisted, reviewActive, viewer } = useAuth();
  const { invalidateDrafts, invalidateContentEvents, invalidateReviewRequests } =
    useReviewInvalidation();
  const { data } = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const isPrivate = (summary?.frontmatterStatus || frontmatterStatus) === "private";
  const { data: myRequests } = useQuery(
    listReviewRequests,
    { ref: contentRef, mine: true, openOnly: true },
    { enabled: isAllowlisted && isPrivate },
  );
  // Mutations invalidate the shared listDrafts cache (+ events/requests) on
  // success, so every mounted consumer (this badge, an index list, the timeline)
  // refreshes — not just this component's own query instance.
  const invalidateAll = () => {
    void invalidateDrafts();
    void invalidateContentEvents();
    void invalidateReviewRequests();
  };
  const transition = useMutation(transitionReview, { onSuccess: invalidateAll });
  const approve = useMutation(recordApproval, { onSuccess: invalidateAll });
  const dismiss = useMutation(dismissApproval, { onSuccess: invalidateAll });
  const reviewed = useMutation(markReviewed, { onSuccess: invalidateAll });

  if (!reviewActive) return null;

  const state = summary?.reviewState ?? ReviewState.NONE;
  const approvals = summary?.approvals ?? [];
  const iApproved = !!viewer?.userId && approvals.some((a) => a.approverUserId === viewer.userId);
  const askedToReview = (myRequests?.requests.length ?? 0) > 0;

  const busy = transition.isPending || approve.isPending || dismiss.isPending || reviewed.isPending;
  const badge = <EffectiveStatusBadge frontmatterStatus={frontmatterStatus} reviewState={state} />;
  const size = layout === "inline" ? "xs" : "sm";
  type ActionOption = {
    key: string;
    label: string;
    variant?: TransitionVariant;
    disabled?: boolean;
    run: () => void | Promise<void>;
  };
  // Approve (or Dismiss my approval) is the happy-path primary on releasable
  // content; Mark reviewed takes its place on private content. Request changes
  // follows. Request-review lives in RequestReviewControl's menu. The first
  // `default` option becomes the split-button primary; the rest open from the
  // chevron.
  const actionOptions: ActionOption[] = [];
  if (isPrivate) {
    if (askedToReview) {
      actionOptions.push({
        key: "reviewed",
        label: "Mark reviewed",
        variant: "default",
        run: async () => {
          await reviewed.mutateAsync({ ref: contentRef });
        },
      });
    }
  } else {
    actionOptions.push(
      iApproved
        ? {
            key: "dismiss",
            label: "Dismiss my approval",
            variant: "outline",
            run: async () => {
              await dismiss.mutateAsync({ ref: contentRef });
            },
          }
        : {
            key: "approve",
            label: "Approve",
            variant: "default",
            run: async () => {
              await approve.mutateAsync({ ref: contentRef });
            },
          },
    );
  }
  if (state !== ReviewState.CHANGES_REQUESTED) {
    actionOptions.push({
      key: "request-changes",
      label: "Request changes",
      variant: "outline",
      run: async () => {
        await transition.mutateAsync({ ref: contentRef, toState: ReviewState.CHANGES_REQUESTED });
      },
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
          {showStatus && badge}
        </div>
      ) : showStatus ? (
        badge
      ) : null}
      {actionControl && <div className="review-controls-actions">{actionControl}</div>}
      {isPrivate ? (
        <p className="review-controls-hint muted">Private · never released</p>
      ) : state === ReviewState.APPROVED ? (
        <p className="review-controls-hint muted">Approved: set `status: ready` to release.</p>
      ) : summary?.readyWithoutApproval ? (
        <p className="review-controls-hint muted">Released without an approval.</p>
      ) : null}
    </div>
  );
}
