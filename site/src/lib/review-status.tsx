// Shared presentation for the DB review lifecycle state (distinct from the git
// frontmatter authoring status). The badge tones and labels live here so the
// doc-page ReviewControls and the index tables' Review column render the state
// identically — one source of truth for "released" vs "in review" styling.
import { ReviewState, Requirement, RequestStatus } from "../gen/docs_factory/review/v1/messages_pb";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// Badge tone per review state: released = solid, approved = subtle ready-green,
// changes-requested = subtle amber, in-review/none = muted outline/secondary.
export const REVIEW_BADGE_VARIANT: Record<number, BadgeVariant> = {
  [ReviewState.NONE]: "outline",
  [ReviewState.IN_REVIEW]: "secondary",
  [ReviewState.CHANGES_REQUESTED]: "outline",
  [ReviewState.APPROVED]: "outline",
  [ReviewState.RELEASED]: "default",
};

export const REVIEW_STATE_LABEL: Record<number, string> = {
  [ReviewState.NONE]: "not in review",
  [ReviewState.IN_REVIEW]: "in review",
  [ReviewState.CHANGES_REQUESTED]: "changes requested",
  [ReviewState.APPROVED]: "approved",
  [ReviewState.RELEASED]: "released",
};

/** Colored badge for a review state, matching the doc-page ReviewControls tone. */
export function ReviewStateBadge({ state }: { state: ReviewState }) {
  return (
    <Badge
      variant={REVIEW_BADGE_VARIANT[state] ?? "secondary"}
      className={cn(
        "review-state-badge",
        state === ReviewState.APPROVED && "blog-badge-ready",
        state === ReviewState.CHANGES_REQUESTED && "blog-badge-idea",
      )}
    >
      {REVIEW_STATE_LABEL[state] ?? "unknown"}
    </Badge>
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
