// Unit tests for the pure review-state derivation (the single source of truth
// for the effective ReviewState). No DB. Run with `bun test`.
import { describe, expect, test } from "bun:test";
import { ReviewState } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type DeriveReviewStateInput, deriveReviewState } from "./review.js";

// A baseline: a draft with no outcome, no approvals, no requests.
function base(over: Partial<DeriveReviewStateInput> = {}): DeriveReviewStateInput {
  return {
    frontmatterStatus: "draft",
    explicitOutcome: null,
    explicitOutcomeAt: null,
    activeApprovals: [],
    latestApprovalAt: null,
    openRequiredUserIds: [],
    hasRequiredRequests: false,
    hasOpenRequests: false,
    latestSatisfiedAt: null,
    ...over,
  };
}

const T0 = new Date("2026-07-01T00:00:00Z");
const T1 = new Date("2026-07-02T00:00:00Z");
const APPROVED_BY_ALICE = { activeApprovals: [{ approverUserId: "alice" }], latestApprovalAt: T0 };

describe("deriveReviewState", () => {
  test("a draft with no review activity -> NONE", () => {
    const d = deriveReviewState(base());
    expect(d.state).toBe(ReviewState.NONE);
    expect(d.needsReview).toBe(false);
  });

  test("an unregistered artifact (no status) -> NONE", () => {
    expect(deriveReviewState(base({ frontmatterStatus: null })).state).toBe(ReviewState.NONE);
  });

  test("an open review request -> NEEDS_REVIEW (and needsReview flag)", () => {
    const d = deriveReviewState(base({ hasOpenRequests: true }));
    expect(d.state).toBe(ReviewState.NEEDS_REVIEW);
    expect(d.needsReview).toBe(true);
  });

  test("an open optional request alongside an approval -> APPROVED", () => {
    const d = deriveReviewState(base({ hasOpenRequests: true, ...APPROVED_BY_ALICE }));
    expect(d.state).toBe(ReviewState.APPROVED);
  });

  test("a draft with one approval and no required requests -> APPROVED (awaiting ready)", () => {
    const d = deriveReviewState(base(APPROVED_BY_ALICE));
    expect(d.state).toBe(ReviewState.APPROVED);
    expect(d.pendingRequiredUserIds).toEqual([]);
    expect(d.readyWithoutApproval).toBe(false);
  });

  test("a still-open required request blocks derived approval -> NEEDS_REVIEW", () => {
    const d = deriveReviewState(
      base({
        ...APPROVED_BY_ALICE,
        hasRequiredRequests: true,
        hasOpenRequests: true,
        openRequiredUserIds: ["bob"],
      }),
    );
    expect(d.state).toBe(ReviewState.NEEDS_REVIEW);
    expect(d.pendingRequiredUserIds).toEqual(["bob"]);
  });

  test("every required request satisfied -> APPROVED", () => {
    const d = deriveReviewState(
      base({
        activeApprovals: [{ approverUserId: "alice" }, { approverUserId: "bob" }],
        latestApprovalAt: T1,
        hasRequiredRequests: true,
      }),
    );
    expect(d.state).toBe(ReviewState.APPROVED);
  });

  test("required requests all satisfied but every approval dismissed -> NONE", () => {
    const d = deriveReviewState(base({ hasRequiredRequests: true }));
    expect(d.state).toBe(ReviewState.NONE);
  });

  test("the maintainer approved override beats a pending required request", () => {
    const d = deriveReviewState(
      base({
        explicitOutcome: "approved",
        explicitOutcomeAt: T0,
        hasRequiredRequests: true,
        hasOpenRequests: true,
        openRequiredUserIds: ["bob"],
      }),
    );
    expect(d.state).toBe(ReviewState.APPROVED);
    expect(d.pendingRequiredUserIds).toEqual([]);
  });

  test("a change request newer than the latest approval -> CHANGES_REQUESTED", () => {
    const d = deriveReviewState(
      base({ ...APPROVED_BY_ALICE, explicitOutcome: "changes-requested", explicitOutcomeAt: T1 }),
    );
    expect(d.state).toBe(ReviewState.CHANGES_REQUESTED);
  });

  test("an approval newer than the change request supersedes it -> APPROVED", () => {
    const d = deriveReviewState(
      base({
        explicitOutcome: "changes-requested",
        explicitOutcomeAt: T0,
        activeApprovals: [{ approverUserId: "alice" }],
        latestApprovalAt: T1,
      }),
    );
    expect(d.state).toBe(ReviewState.APPROVED);
  });

  test("a change request with no approval holds even with an open request", () => {
    const d = deriveReviewState(
      base({ explicitOutcome: "changes-requested", explicitOutcomeAt: T0, hasOpenRequests: true }),
    );
    expect(d.state).toBe(ReviewState.CHANGES_REQUESTED);
  });
});

describe("release is git's", () => {
  test("frontmatter ready on main -> RELEASED", () => {
    const d = deriveReviewState(base({ frontmatterStatus: "ready", ...APPROVED_BY_ALICE }));
    expect(d.state).toBe(ReviewState.RELEASED);
    expect(d.readyWithoutApproval).toBe(false);
  });

  test("ready without any approval -> RELEASED, flagged readyWithoutApproval", () => {
    const d = deriveReviewState(base({ frontmatterStatus: "ready" }));
    expect(d.state).toBe(ReviewState.RELEASED);
    expect(d.readyWithoutApproval).toBe(true);
  });

  test("the maintainer override counts as approval for the warning", () => {
    const d = deriveReviewState(
      base({ frontmatterStatus: "ready", explicitOutcome: "approved", explicitOutcomeAt: T0 }),
    );
    expect(d.readyWithoutApproval).toBe(false);
  });

  test("an open request on released content keeps it RELEASED", () => {
    const d = deriveReviewState(
      base({ frontmatterStatus: "ready", hasOpenRequests: true, ...APPROVED_BY_ALICE }),
    );
    expect(d.state).toBe(ReviewState.RELEASED);
  });

  test("a change request newer than the approval outranks RELEASED", () => {
    const d = deriveReviewState(
      base({
        frontmatterStatus: "ready",
        ...APPROVED_BY_ALICE,
        explicitOutcome: "changes-requested",
        explicitOutcomeAt: T1,
      }),
    );
    expect(d.state).toBe(ReviewState.CHANGES_REQUESTED);
    expect(d.readyWithoutApproval).toBe(false);
  });
});

describe("private content has no approval axis", () => {
  const priv = (over: Partial<DeriveReviewStateInput> = {}) =>
    base({ frontmatterStatus: "private", ...over });

  test("never APPROVED, even with approvals or the override on record", () => {
    expect(deriveReviewState(priv(APPROVED_BY_ALICE)).state).toBe(ReviewState.NONE);
    expect(
      deriveReviewState(priv({ explicitOutcome: "approved", explicitOutcomeAt: T0 })).state,
    ).toBe(ReviewState.NONE);
  });

  test("never RELEASED", () => {
    const d = deriveReviewState(priv());
    expect(d.state).toBe(ReviewState.NONE);
    expect(d.readyWithoutApproval).toBe(false);
  });

  test("an open review request -> NEEDS_REVIEW", () => {
    expect(deriveReviewState(priv({ hasOpenRequests: true })).state).toBe(ReviewState.NEEDS_REVIEW);
  });

  test("a change request holds until a later request is marked reviewed", () => {
    const requested = { explicitOutcome: "changes-requested" as const, explicitOutcomeAt: T0 };
    expect(deriveReviewState(priv(requested)).state).toBe(ReviewState.CHANGES_REQUESTED);
    expect(deriveReviewState(priv({ ...requested, latestSatisfiedAt: T1 })).state).toBe(
      ReviewState.NONE,
    );
  });

  test("an approval does not supersede a private change request", () => {
    const d = deriveReviewState(
      priv({
        explicitOutcome: "changes-requested",
        explicitOutcomeAt: T0,
        activeApprovals: [{ approverUserId: "alice" }],
        latestApprovalAt: T1,
      }),
    );
    expect(d.state).toBe(ReviewState.CHANGES_REQUESTED);
  });
});
