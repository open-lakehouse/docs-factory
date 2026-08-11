// 308 redirect routes (Phase 1g): validated against known routes so a typo fails
// the build. Exercises the pure redirectRoutes().
import { expect, test } from "bun:test";
import { redirectRoutes } from "../../../scripts/build-redirects.mjs";

const ROUTES = new Set(["/docs/delta/how-to/read", "/blog/new-post"]);

test("redirectRoutes emits {src,dest,status:308} for each entry", () => {
  const out = redirectRoutes({ "/docs/delta/how-to/old": "/docs/delta/how-to/read" }, ROUTES);
  expect(out).toEqual([
    { src: "/docs/delta/how-to/old", dest: "/docs/delta/how-to/read", status: 308 },
  ]);
});

test("redirectRoutes throws when dest is not a known route (typo guard)", () => {
  expect(() => redirectRoutes({ "/old": "/docs/delta/how-to/typo" }, ROUTES)).toThrow(
    /not a known route/,
  );
});

test("redirectRoutes throws on non-absolute paths", () => {
  expect(() => redirectRoutes({ old: "/blog/new-post" }, ROUTES)).toThrow(/absolute paths/);
});

test("redirectRoutes is empty for an empty map", () => {
  expect(redirectRoutes({}, ROUTES)).toEqual([]);
});
