// The site configs and the shells they emit into: one route scheme, and shells
// that share sites/docs-shell/ install the same dependencies.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import delta from "../sites/delta-docs.mjs";
import { guestKey, projectRoutes, twinPath, withGuests } from "../sites/routes.mjs";
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

test("withGuests routes a cross-published page under its project", () => {
  const guest = { area: "docs", project: "unitycatalog", bucket: "how-to", slug: "x" };
  const href = withGuests(projectRoutes("delta"), new Set([guestKey(guest)]));
  expect(href(guest)).toBe("/unitycatalog/how-to/x");
  expect(href({ ...guest, slug: "y" })).toBeNull();
  expect(href({ area: "docs", project: "delta", bucket: "how-to", slug: "x" })).toBe("/how-to/x");
});

test("a mounted site's routes carry its base and end in a slash", () => {
  const href = projectRoutes("unitycatalog", {
    base: "/docs",
    apiPath: "/api",
    trailingSlash: true,
  });
  expect(href({ area: "site" })).toBe("/docs/");
  expect(href({ area: "docs", project: "unitycatalog", bucket: "how-to", slug: "duckdb" })).toBe(
    "/docs/how-to/duckdb/",
  );
  expect(href({ area: "api", slug: "catalog" })).toBe("/docs/api/catalog/");
  expect(href({ area: "api" })).toBe("/docs/api/");
  const guest = { area: "docs", project: "delta", bucket: "how-to", slug: "read" };
  const hosted = withGuests(href, new Set([guestKey(guest)]), {
    base: "/docs",
    trailingSlash: true,
  });
  expect(hosted(guest)).toBe("/docs/delta/how-to/read/");
});

test("twinPath drops a route's trailing slash, and a home's twin is index.md", () => {
  expect(twinPath("/how-to/read")).toBe("/how-to/read.md");
  expect(twinPath("/docs/how-to/duckdb/")).toBe("/docs/how-to/duckdb.md");
  expect(twinPath("/")).toBe("/index.md");
  expect(twinPath("https://unitycatalog.io/")).toBe("https://unitycatalog.io/index.md");
});

test("the UC docs emit into uc-website under /docs, inside its owned paths", () => {
  expect(uc.origin).toBe("https://unitycatalog.io");
  expect(uc.base).toBe("/docs");
  expect(uc.hrefFor({ area: "site" })).toBe("/docs/");
  for (const path of [...Object.values(uc.paths), uc.manifest]) {
    expect(uc.owned.some((prefix) => path.startsWith(prefix))).toBe(true);
  }
  // Every public file lives under the base, so it must be owned there.
  expect(uc.owned).toContain(`public${uc.base}/`);
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
