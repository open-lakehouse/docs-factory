import { describe, expect, test } from "bun:test";
import { ReviewState } from "../gen/docs_factory/review/v1/messages_pb";
import {
  effectiveStatus,
  effectiveStatusIconClass,
  effectiveStatusLabel,
  statusBucket,
} from "./effective-status";

describe("effectiveStatus", () => {
  test("idea with no review → authoring idea", () => {
    expect(effectiveStatus("idea", ReviewState.NONE)).toEqual({
      kind: "authoring",
      status: "idea",
    });
  });

  test("draft with no review → authoring draft", () => {
    expect(effectiveStatus("draft", ReviewState.NONE)).toEqual({
      kind: "authoring",
      status: "draft",
    });
  });

  test("an open review request shows needs review on any status", () => {
    for (const status of ["draft", "private"]) {
      expect(effectiveStatus(status, ReviewState.NEEDS_REVIEW)).toEqual({
        kind: "review",
        state: ReviewState.NEEDS_REVIEW,
      });
    }
    expect(effectiveStatusLabel(effectiveStatus("draft", ReviewState.NEEDS_REVIEW))).toBe(
      "needs review",
    );
  });

  test("private with no review activity → authoring private", () => {
    const status = effectiveStatus("private", ReviewState.NONE);
    expect(status).toEqual({ kind: "authoring", status: "private" });
    expect(statusBucket(status)).toBe("private");
    expect(effectiveStatusIconClass(status)).toBe("tree-status-icon-private");
  });

  test("later review states win over frontmatter", () => {
    expect(effectiveStatus("ready", ReviewState.CHANGES_REQUESTED).kind).toBe("review");
    expect(effectiveStatus("ready", ReviewState.APPROVED)).toEqual({
      kind: "review",
      state: ReviewState.APPROVED,
    });
    expect(effectiveStatus("ready", ReviewState.RELEASED)).toEqual({
      kind: "review",
      state: ReviewState.RELEASED,
    });
  });

  test("missing frontmatter + none → not started", () => {
    expect(effectiveStatus(undefined, ReviewState.NONE)).toEqual({
      kind: "review",
      state: ReviewState.NONE,
    });
    expect(effectiveStatusLabel(effectiveStatus(undefined, undefined))).toBe("not started");
  });

  test("icon class mirrors the status tone", () => {
    expect(effectiveStatusIconClass(effectiveStatus("idea", ReviewState.NONE))).toBe(
      "tree-status-icon-idea",
    );
    expect(effectiveStatusIconClass(effectiveStatus("draft", ReviewState.NEEDS_REVIEW))).toBe(
      "tree-status-icon-in-review",
    );
  });

  test("statusBucket maps authoring and review states", () => {
    expect(statusBucket(effectiveStatus("idea", ReviewState.NONE))).toBe("idea");
    expect(statusBucket(effectiveStatus("draft", ReviewState.NONE))).toBe("draft");
    expect(statusBucket(effectiveStatus("draft", ReviewState.NEEDS_REVIEW))).toBe("needs-review");
    expect(statusBucket(effectiveStatus("ready", ReviewState.RELEASED))).toBe("released");
    expect(statusBucket(effectiveStatus("ready", ReviewState.CHANGES_REQUESTED))).toBe(
      "changes-requested",
    );
  });
});
