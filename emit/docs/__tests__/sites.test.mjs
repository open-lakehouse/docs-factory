// The site configs and the shells they emit into: one route scheme, and shells
// that share sites/docs-shell/ install the same dependencies.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import delta from "../sites/delta-docs.mjs";
import { projectRoutes } from "../sites/routes.mjs";
import uc from "../sites/unitycatalog-docs.mjs";

const SITES_DIR = join(import.meta.dir, "../../../sites");

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

test("every site shell installs the dependencies the shared shell needs", () => {
  const deps = (name) => {
    const pkg = JSON.parse(readFileSync(join(SITES_DIR, name, "package.json"), "utf8"));
    return { dependencies: pkg.dependencies, devDependencies: pkg.devDependencies };
  };
  expect(deps(delta.name)).toEqual(deps(uc.name));
});
