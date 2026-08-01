// Overview tab-token helpers: synthetic workspace item for the blog pipeline,
// ProductChanges rollup, and latest-comments inbox. Locks the group key, view
// labels, and bare-token fallback.
import { test, expect } from "bun:test";
import {
  OVERVIEW_GROUP_KEY,
  OVERVIEW_VIEWS,
  isOverviewGroup,
  overviewTabsParam,
  overviewToken,
  overviewViewLabel,
  parseOverviewToken,
} from "./overview-token";

test("overview tokens use the synthetic group key", () => {
  expect(overviewToken("pipeline")).toBe("overview#pipeline");
  expect(overviewToken("product")).toBe("overview#product");
  expect(overviewToken("comments")).toBe("overview#comments");
  expect(OVERVIEW_VIEWS).toEqual(["pipeline", "product", "comments"]);
  expect(overviewTabsParam()).toBe(
    "overview#pipeline,overview#product,overview#comments",
  );
});

test("bare overview falls back to pipeline", () => {
  expect(parseOverviewToken("overview")).toBe("pipeline");
  expect(parseOverviewToken("overview#pipeline")).toBe("pipeline");
  expect(parseOverviewToken("overview#product")).toBe("product");
  expect(parseOverviewToken("overview#comments")).toBe("comments");
  expect(parseOverviewToken("docs:foo:delta:tutorials")).toBeNull();
});

test("group detection and labels", () => {
  expect(isOverviewGroup(OVERVIEW_GROUP_KEY)).toBe(true);
  expect(isOverviewGroup("docs:foo")).toBe(false);
  expect(overviewViewLabel("pipeline")).toBe("Blog pipeline");
  expect(overviewViewLabel("product")).toBe("Product changes");
  expect(overviewViewLabel("comments")).toBe("Latest comments");
});
