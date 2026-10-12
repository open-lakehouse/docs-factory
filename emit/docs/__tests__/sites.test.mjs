// The site configs: one route scheme across sites.
import { expect, test } from "bun:test";
import delta from "../sites/delta-docs.mjs";
import { projectRoutes } from "../sites/routes.mjs";

test("projectRoutes maps a project's pages, the home page, and API references", () => {
  const href = projectRoutes("delta");
  expect(href({ area: "site" })).toBe("/");
  expect(href({ area: "docs", project: "delta", bucket: "how-to", slug: "read" })).toBe(
    "/how-to/read",
  );
  expect(href({ area: "api", slug: "catalog" })).toBe("/reference/api/catalog");
  expect(href({ area: "api" })).toBe("/reference/api");
});

test("projectRoutes gives another project's pages no route", () => {
  const href = projectRoutes("delta");
  expect(href({ area: "docs", project: "unitycatalog", bucket: "how-to", slug: "x" })).toBeNull();
  expect(href({ area: "docs", project: "delta", bucket: "how-to" })).toBeNull();
  expect(href(null)).toBeNull();
});

test("the Delta site emits content/delta with no env bundle or REST APIs", () => {
  expect(delta.name).toBe("delta-docs");
  expect(delta.project).toBe("delta");
  expect(delta.env).toBeUndefined();
  expect(delta.api).toBeUndefined();
  expect(delta.origin).not.toMatch(/\/$/);
});
