import { expect, test, describe } from "bun:test";
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

  test("ready derives to needs review — show review entry, not ready", () => {
    expect(effectiveStatus("ready", ReviewState.NEEDS_REVIEW)).toEqual({
      kind: "review",
      state: ReviewState.NEEDS_REVIEW,
    });
    expect(effectiveStatus("ready", ReviewState.NONE)).toEqual({
      kind: "review",
      state: ReviewState.NEEDS_REVIEW,
    });
    expect(effectiveStatusLabel(effectiveStatus("ready", ReviewState.NEEDS_REVIEW))).toBe(
      "needs review",
    );
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
    expect(effectiveStatusIconClass(effectiveStatus("ready", ReviewState.NEEDS_REVIEW))).toBe(
      "tree-status-icon-in-review",
    );
  });

  test("statusBucket maps authoring and review states", () => {
    expect(statusBucket(effectiveStatus("idea", ReviewState.NONE))).toBe("idea");
    expect(statusBucket(effectiveStatus("draft", ReviewState.NONE))).toBe("draft");
    expect(statusBucket(effectiveStatus("ready", ReviewState.NEEDS_REVIEW))).toBe("needs-review");
    expect(statusBucket(effectiveStatus("ready", ReviewState.CHANGES_REQUESTED))).toBe(
      "changes-requested",
    );
  });
});
