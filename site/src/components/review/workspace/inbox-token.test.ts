import { expect, test } from "bun:test";
import { INBOX_TOKEN, isInboxToken, legacyOverviewPlanPath } from "./inbox-token";

test("inbox token, and the legacy comments view that became it", () => {
  expect(isInboxToken(INBOX_TOKEN)).toBe(true);
  expect(isInboxToken("overview#comments")).toBe(true);
  expect(isInboxToken("overview#compat")).toBe(false);
  expect(isInboxToken("docs:foo:delta:tutorials")).toBe(false);
});

test("legacy Overview planning panels map to their /plan pages", () => {
  expect(legacyOverviewPlanPath("overview")).toBe("/plan/pipeline");
  expect(legacyOverviewPlanPath("overview#pipeline")).toBe("/plan/pipeline");
  expect(legacyOverviewPlanPath("overview#product")).toBe("/plan/changes");
  expect(legacyOverviewPlanPath("overview#coverage")).toBe("/plan/coverage");
  expect(legacyOverviewPlanPath("overview#compat")).toBe("/plan/compat");
  expect(legacyOverviewPlanPath("overview#comments")).toBeNull();
  expect(legacyOverviewPlanPath(INBOX_TOKEN)).toBeNull();
});
