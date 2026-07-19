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

function sameRef(a: ContentRef, b: ContentRef): boolean {
  return a.area === b.area && a.slug === b.slug && (a.project ?? "") === (b.project ?? "") && (a.bucket ?? "") === (b.bucket ?? "");
}

export default function ReviewControls({ contentRef }: { contentRef: ContentRef }) {
  const { isAllowlisted, isMaintainer } = useAuth();
  const { data, refetch } = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  const transition = useMutation(transitionReview);
  const release = useMutation(releaseContent);

  if (!isAllowlisted) return null;

  const summary = data?.drafts.find((d) => d.ref && sameRef(d.ref, contentRef));
  const state = summary?.reviewState ?? ReviewState.NONE;

  async function go(to: ReviewState) {
    await transition.mutateAsync({ ref: contentRef, toState: to });
    refetch();
  }
  async function doRelease() {
    await release.mutateAsync({ ref: contentRef });
    refetch();
  }

  const busy = transition.isPending || release.isPending;

  return (
    <span className="review-controls">
      <span className="review-state-badge" data-state={state}>
        review: {LABEL[state] ?? "unknown"}
      </span>
      {(NEXT[state] ?? []).map((t) => (
        <button key={t.to} onClick={() => go(t.to)} disabled={busy}>
          {t.label}
        </button>
      ))}
      {state === ReviewState.APPROVED && isMaintainer && (
        <button className="review-release" onClick={doRelease} disabled={busy}>
          Release
        </button>
      )}
    </span>
  );
}
