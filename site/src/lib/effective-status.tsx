// Compact "one badge" presentation that folds the git frontmatter status and
// the DB review state into a single effective status. Review activity wins;
// with none, the frontmatter status shows (`ready` on main derives to
// RELEASED server-side, so a bare `ready` only appears before registration).
//
// Detailed listings (blog pipeline, ContentTable) still render both axes.

import { cn } from "@/lib/utils";
import { FrontmatterStatusBadge } from "../components/StatusBadge";
import { ReviewState } from "../gen/docs_factory/review/v1/messages_pb";
import { statusDotClass } from "./frontmatter-status";
import { REVIEW_STATE_LABEL, ReviewStateBadge, reviewStateDotClass } from "./review-status";

export type EffectiveStatus =
  | { kind: "authoring"; status: string }
  | { kind: "review"; state: ReviewState };

/** Review states that have progressed past (or are) the review entry point. */
const REVIEW_LIFECYCLE_STATES = new Set<ReviewState>([
  ReviewState.NEEDS_REVIEW,
  ReviewState.CHANGES_REQUESTED,
  ReviewState.APPROVED,
  ReviewState.RELEASED,
]);

/**
 * Pick the single status a compact surface should show.
 *
 * - needs review / changes requested / approved / released → that review state
 * - otherwise the authoring label (idea / draft / ready / private)
 */
export function effectiveStatus(
  frontmatterStatus: string | undefined,
  reviewState: ReviewState | undefined,
): EffectiveStatus {
  const state = reviewState ?? ReviewState.NONE;
  if (REVIEW_LIFECYCLE_STATES.has(state)) {
    return { kind: "review", state };
  }
  const status = (frontmatterStatus ?? "").trim();
  if (status) {
    return { kind: "authoring", status };
  }
  return { kind: "review", state: ReviewState.NONE };
}

export function effectiveStatusLabel(status: EffectiveStatus): string {
  return status.kind === "authoring"
    ? status.status
    : (REVIEW_STATE_LABEL[status.state] ?? "unknown");
}

export function effectiveStatusDotClass(status: EffectiveStatus): string {
  return status.kind === "authoring"
    ? statusDotClass(status.status)
    : reviewStateDotClass(status.state);
}

/** Text/icon tone class mirroring the tree-status-dot colors. */
export function effectiveStatusIconClass(status: EffectiveStatus): string {
  return effectiveStatusDotClass(status).replace("tree-status-dot-", "tree-status-icon-");
}

/** Stable bucket keys for rollup counts (ordered sharpest → quietest). */
export type StatusBucket =
  | "changes-requested"
  | "needs-review"
  | "idea"
  | "draft"
  | "approved"
  | "released"
  | "private"
  | "none";

export const STATUS_BUCKET_ORDER: StatusBucket[] = [
  "changes-requested",
  "needs-review",
  "idea",
  "draft",
  "approved",
  "released",
  "private",
  "none",
];

export function statusBucket(status: EffectiveStatus): StatusBucket {
  if (status.kind === "authoring") {
    const s = status.status.toLowerCase();
    if (s === "idea") return "idea";
    if (s === "private") return "private";
    if (s === "ready") return "released";
    return "draft";
  }
  switch (status.state) {
    case ReviewState.CHANGES_REQUESTED:
      return "changes-requested";
    case ReviewState.NEEDS_REVIEW:
      return "needs-review";
    case ReviewState.APPROVED:
      return "approved";
    case ReviewState.RELEASED:
      return "released";
    default:
      return "none";
  }
}

export function statusBucketLabel(bucket: StatusBucket): string {
  switch (bucket) {
    case "changes-requested":
      return "changes requested";
    case "needs-review":
      return "needs review";
    case "idea":
      return "idea";
    case "draft":
      return "draft";
    case "approved":
      return "approved";
    case "released":
      return "released";
    case "private":
      return "private";
    case "none":
      return "not started";
  }
}

export function statusBucketDotClass(bucket: StatusBucket): string {
  switch (bucket) {
    case "changes-requested":
    case "idea":
      return "tree-status-dot-idea";
    case "needs-review":
      return "tree-status-dot-in-review";
    case "approved":
      return "tree-status-dot-ready";
    case "released":
      return "tree-status-dot-released";
    case "private":
      return "tree-status-dot-private";
    case "draft":
    case "none":
      return "tree-status-dot-draft";
  }
}

/** Single badge for compact chrome — authoring or review, never both. */
export function EffectiveStatusBadge({
  frontmatterStatus,
  reviewState,
  className,
}: {
  frontmatterStatus?: string;
  reviewState?: ReviewState;
  className?: string;
}) {
  const status = effectiveStatus(frontmatterStatus, reviewState);
  if (status.kind === "authoring") {
    return <FrontmatterStatusBadge status={status.status} />;
  }
  return <ReviewStateBadge state={status.state} className={className} />;
}

/** Compact tree-row status dot for the effective status. */
export function EffectiveStatusDot({
  frontmatterStatus,
  reviewState,
}: {
  frontmatterStatus?: string;
  reviewState?: ReviewState;
}) {
  const status = effectiveStatus(frontmatterStatus, reviewState);
  const label = effectiveStatusLabel(status);
  return (
    <span
      className={cn("tree-status-dot", effectiveStatusDotClass(status))}
      title={label}
      aria-label={label}
    />
  );
}
