// Unit tests for the pure review-state derivation (the single source of truth
// for the effective ReviewState). No DB. Run with `bun test`.
import { expect, test, describe } from "bun:test";
import { deriveReviewState, type DeriveReviewStateInput } from "./review.js";
import { ReviewState } from "../gen/docs_factory/review/v1/messages_pb.js";

// A baseline: frontmatter not ready, no outcome, no approvals, no requests.
function base(over: Partial<DeriveReviewStateInput> = {}): DeriveReviewStateInput {
  return {
    frontmatterStatus: null,
    explicitOutcome: null,
    explicitOutcomeAt: null,
    activeApprovals: [],
    latestApprovalAt: null,
    openRequiredUserIds: [],
    hasRequiredRequests: false,
    ...over,
  };
}

const T0 = new Date("2026-07-01T00:00:00Z");
const T1 = new Date("2026-07-02T00:00:00Z");

describe("deriveReviewState", () => {
  test("not ready, nothing set -> NONE", () => {
    expect(deriveReviewState(base()).state).toBe(ReviewState.NONE);
  });

  test("frontmatter ready with no outcome -> NEEDS_REVIEW (and needsReview flag)", () => {
    const d = deriveReviewState(base({ frontmatterStatus: "ready" }));
    expect(d.state).toBe(ReviewState.NEEDS_REVIEW);
    expect(d.needsReview).toBe(true);
  });

  test("ready + one approval, no required requests -> APPROVED", () => {
    const d = deriveReviewState(
      base({
        frontmatterStatus: "ready",
        activeApprovals: [{ approverUserId: "alice" }],
        latestApprovalAt: T0,
      }),
    );
    expect(d.state).toBe(ReviewState.APPROVED);
    expect(d.needsReview).toBe(false);
  });

  test("required requests: not approved until every required reviewer approved", () => {
    // alice approved, bob still pending -> NEEDS_REVIEW, bob listed as pending.
    const partial = deriveReviewState(
      base({
        frontmatterStatus: "ready",
        hasRequiredRequests: true,
        openRequiredUserIds: ["bob"],
        activeApprovals: [{ approverUserId: "alice" }],
        latestApprovalAt: T0,
      }),
    );
    expect(partial.state).toBe(ReviewState.NEEDS_REVIEW);
    expect(partial.pendingRequiredUserIds).toEqual(["bob"]);

    // Both approved (no open required left) -> APPROVED.
    const full = deriveReviewState(
      base({
        frontmatterStatus: "ready",
        hasRequiredRequests: true,
        openRequiredUserIds: [],
        activeApprovals: [{ approverUserId: "alice" }, { approverUserId: "bob" }],
        latestApprovalAt: T1,
      }),
    );
    expect(full.state).toBe(ReviewState.APPROVED);
  });

  test("required requests but zero approvals is NOT approved", () => {
    // Guard: with required requests, APPROVED needs open==0 AND >=1 approval, so
    // a brand-new artifact with no requests recorded yet can't derive approved.
    const d = deriveReviewState(
      base({ frontmatterStatus: "ready", hasRequiredRequests: true, openRequiredUserIds: [] }),
    );
    expect(d.state).toBe(ReviewState.NEEDS_REVIEW);
  });

  test("changes-requested holds while newer than the latest approval", () => {
    const d = deriveReviewState(
      base({
        frontmatterStatus: "ready",
        explicitOutcome: "changes-requested",
        explicitOutcomeAt: T1,
        activeApprovals: [{ approverUserId: "alice" }],
        latestApprovalAt: T0,
      }),
    );
    expect(d.state).toBe(ReviewState.CHANGES_REQUESTED);
  });

  test("a later approval supersedes an earlier changes-requested -> APPROVED", () => {
    const d = deriveReviewState(
      base({
        frontmatterStatus: "ready",
        explicitOutcome: "changes-requested",
        explicitOutcomeAt: T0,
        activeApprovals: [{ approverUserId: "alice" }],
        latestApprovalAt: T1,
      }),
    );
    expect(d.state).toBe(ReviewState.APPROVED);
  });

  test("maintainer approved override -> APPROVED even with no approvals", () => {
    const d = deriveReviewState(
      base({ frontmatterStatus: "ready", explicitOutcome: "approved", explicitOutcomeAt: T0 }),
    );
    expect(d.state).toBe(ReviewState.APPROVED);
  });

  test("released wins over everything", () => {
    const d = deriveReviewState(
      base({
        frontmatterStatus: "ready",
        explicitOutcome: "released",
        explicitOutcomeAt: T0,
        activeApprovals: [{ approverUserId: "alice" }],
        latestApprovalAt: T1,
      }),
    );
    expect(d.state).toBe(ReviewState.RELEASED);
  });

  test("not-ready + changes-requested still shows CHANGES_REQUESTED (outcome outranks frontmatter)", () => {
    const d = deriveReviewState(
      base({ frontmatterStatus: "draft", explicitOutcome: "changes-requested", explicitOutcomeAt: T0 }),
    );
    expect(d.state).toBe(ReviewState.CHANGES_REQUESTED);
  });
});
