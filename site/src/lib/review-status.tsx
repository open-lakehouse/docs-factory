// Shared presentation for the DB review lifecycle state (distinct from the git
// frontmatter authoring status). The badge tones and labels live here so the
// doc-page ReviewControls, the index tables' Review column, and the workspace
// inbox all render the state identically — one component, one look.
import { ReviewState, Requirement, RequestStatus } from "../gen/docs_factory/review/v1/messages_pb";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// Badge tone per review state: released = solid, approved = ready-green,
// changes-requested = amber, needs-review = purple, none = muted outline.
export const REVIEW_BADGE_VARIANT: Record<number, BadgeVariant> = {
  [ReviewState.NONE]: "outline",
  [ReviewState.NEEDS_REVIEW]: "outline",
  [ReviewState.CHANGES_REQUESTED]: "outline",
  [ReviewState.APPROVED]: "outline",
  [ReviewState.RELEASED]: "default",
};

export const REVIEW_STATE_LABEL: Record<number, string> = {
  [ReviewState.NONE]: "not started",
  [ReviewState.NEEDS_REVIEW]: "needs review",
  [ReviewState.CHANGES_REQUESTED]: "changes requested",
  [ReviewState.APPROVED]: "approved",
  [ReviewState.RELEASED]: "released",
};

/** Extra badge class for a review state tint (ready / idea / needs-review). */
export function reviewStateBadgeClass(state: ReviewState): string {
  switch (state) {
    case ReviewState.APPROVED:
      return "status-badge-ready";
    case ReviewState.CHANGES_REQUESTED:
      return "status-badge-idea";
    case ReviewState.NEEDS_REVIEW:
      return "status-badge-in-review";
    default:
      return "";
  }
}

/** Extra class for a compact tree-row review-status dot. */
export function reviewStateDotClass(state: ReviewState | undefined): string {
  switch (state ?? ReviewState.NONE) {
    case ReviewState.NEEDS_REVIEW:
      return "tree-status-dot-in-review";
    case ReviewState.CHANGES_REQUESTED:
      return "tree-status-dot-idea";
    case ReviewState.APPROVED:
      return "tree-status-dot-ready";
    case ReviewState.RELEASED:
      return "tree-status-dot-released";
    default:
      return "tree-status-dot-none";
  }
}

/** Colored badge for a review state — shared by tables, dashboards, and ReviewControls. */
export function ReviewStateBadge({
  state,
  className,
}: {
  state: ReviewState;
  className?: string;
}) {
  return (
    <StatusBadge
      variant={REVIEW_BADGE_VARIANT[state] ?? "secondary"}
      toneClass={reviewStateBadgeClass(state)}
      className={cn(state === ReviewState.NONE && "status-badge--idle", className)}
    >
      {REVIEW_STATE_LABEL[state] ?? "unknown"}
    </StatusBadge>
  );
}

export const REQUIREMENT_LABEL: Record<number, string> = {
  [Requirement.REQUIRED]: "required",
  [Requirement.OPTIONAL]: "optional",
};

export const REQUEST_STATUS_LABEL: Record<number, string> = {
  [RequestStatus.OPEN]: "open",
  [RequestStatus.SATISFIED]: "satisfied",
  [RequestStatus.CANCELLED]: "cancelled",
};

const REQUEST_STATUS_VARIANT: Record<number, BadgeVariant> = {
  [RequestStatus.OPEN]: "secondary",
  [RequestStatus.SATISFIED]: "default",
  [RequestStatus.CANCELLED]: "outline",
};

/** Badge for a review request: "required · open", tone by status. */
export function ReviewRequestBadge({
  requirement,
  status,
}: {
  requirement: Requirement;
  status: RequestStatus;
}) {
  return (
    <Badge variant={REQUEST_STATUS_VARIANT[status] ?? "secondary"} className="review-request-badge">
      {REQUIREMENT_LABEL[requirement] ?? "required"} · {REQUEST_STATUS_LABEL[status] ?? "open"}
    </Badge>
  );
}
