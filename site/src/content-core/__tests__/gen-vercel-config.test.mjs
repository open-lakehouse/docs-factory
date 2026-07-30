// The Build Output API routes array (Phase 1b/1c/1g/3.4). Order is load-bearing:
// /api first, catch-all last, filesystem before catch-all; header rules use
// continue:true; 308 routes carry status:308. Exercises the pure buildRoutes().
import { test, expect } from "bun:test";
import { buildRoutes } from "../../../scripts/gen-vercel-config.mjs";

const routes = buildRoutes({
  fnHost: "review-abc.functions.neon.tech",
  redirectRoutes: [{ src: "/old", dest: "/docs/x/y/z", status: 308 }],
});

test("/api proxy is first and catch-all is last", () => {
  expect(routes[0].src).toBe("/api/(.*)");
  expect(routes.at(-1)).toEqual({ src: "/.*", dest: "/index.html" });
});

test("filesystem handler precedes the SPA catch-all", () => {
  const fsIdx = routes.findIndex((r) => r.handle === "filesystem");
  const catchAll = routes.findIndex((r) => r.src === "/.*");
  expect(fsIdx).toBeGreaterThan(0);
  expect(fsIdx).toBeLessThan(catchAll);
});

test("308 redirect routes are spliced in before filesystem", () => {
  const redirect = routes.find((r) => r.status === 308);
  const fsIdx = routes.findIndex((r) => r.handle === "filesystem");
  expect(redirect).toEqual({ src: "/old", dest: "/docs/x/y/z", status: 308 });
  expect(routes.indexOf(redirect)).toBeLessThan(fsIdx);
});

test(".md rule sets noindex + text/markdown and continues to the filesystem", () => {
  const md = routes.find((r) => r.src === "/(.*)\\.md");
  expect(md.headers["X-Robots-Tag"]).toBe("noindex");
  expect(md.headers["Content-Type"]).toBe("text/markdown; charset=utf-8");
  expect(md.continue).toBe(true);
});

test(".py rule sets noindex + text/x-python and continues", () => {
  const py = routes.find((r) => r.src === "/(.*)\\.py");
  expect(py.headers["X-Robots-Tag"]).toBe("noindex");
  expect(py.headers["Content-Type"]).toBe("text/x-python; charset=utf-8");
  expect(py.continue).toBe(true);
});

test("Accept: text/markdown negotiation rewrites doc/blog routes to their .md twin", () => {
  const neg = routes.find((r) => r.dest === "/$1.md");
  expect(neg.src).toBe("/(docs/.*|blog/.*)");
  expect(neg.has[0]).toEqual({ type: "header", key: "accept", value: "(.*text/markdown.*)" });
});

test("companion-file misses 404 AFTER filesystem and BEFORE the SPA catch-all", () => {
  // A .md/.py/scripts.json request the filesystem didn't resolve must return a real
  // 404, never fall through to /index.html — otherwise the app-shell HTML gets
  // cached (and mislabeled text/markdown by the continue:true header rule) under the
  // companion URL's key, permanently poisoning the review workspace's twin fetch.
  const fsIdx = routes.findIndex((r) => r.handle === "filesystem");
  const catchAll = routes.findIndex((r) => r.src === "/.*");
  const mdPy404 = routes.findIndex((r) => r.src === "/(.*)\\.(md|py)" && r.status === 404);
  const jsonMiss404 = routes.findIndex((r) => r.src === "/scripts\\.json" && r.status === 404);

  for (const idx of [mdPy404, jsonMiss404]) {
    expect(idx).toBeGreaterThan(fsIdx);
    expect(idx).toBeLessThan(catchAll);
  }
});
