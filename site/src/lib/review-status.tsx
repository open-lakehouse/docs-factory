// Shared presentation for the DB review lifecycle state (distinct from the git
// frontmatter authoring status). The badge tones and labels live here so the
// doc-page ReviewControls and the index tables' Review column render the state
// identically — one source of truth for "released" vs "in review" styling.
import { ReviewState } from "../gen/docs_factory/review/v1/messages_pb";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// Badge tone per review state: released = solid, approved = default accent,
// changes-requested = destructive, in-review/none = muted outline/secondary.
export const REVIEW_BADGE_VARIANT: Record<number, BadgeVariant> = {
  [ReviewState.NONE]: "outline",
  [ReviewState.IN_REVIEW]: "secondary",
  [ReviewState.CHANGES_REQUESTED]: "destructive",
  [ReviewState.APPROVED]: "default",
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
    <Badge variant={REVIEW_BADGE_VARIANT[state] ?? "secondary"} className="review-state-badge">
      {REVIEW_STATE_LABEL[state] ?? "unknown"}
    </Badge>
  );
}
