// The Build Output API routes array. Order is load-bearing: /api first, catch-all
// last, filesystem before catch-all; header rules use continue:true. Exercises
// the pure buildRoutes().
import { expect, test } from "bun:test";
import { buildRoutes } from "../../../scripts/gen-vercel-config.mjs";

const routes = buildRoutes({ fnHost: "review-abc.functions.neon.tech" });

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

test(".sh rule sets noindex + text/x-shellscript and continues", () => {
  const sh = routes.find((r) => r.src === "/(.*)\\.sh");
  expect(sh.headers["X-Robots-Tag"]).toBe("noindex");
  expect(sh.headers["Content-Type"]).toBe("text/x-shellscript; charset=utf-8");
  expect(sh.continue).toBe(true);
});

test("companion-file misses 404 AFTER filesystem and BEFORE the SPA catch-all", () => {
  // A .md/.py/scripts.json request the filesystem didn't resolve must return a real
  // 404, never fall through to /index.html — otherwise the app-shell HTML gets
  // cached (and mislabeled text/markdown by the continue:true header rule) under the
  // companion URL's key, permanently poisoning the review workspace's twin fetch.
  const fsIdx = routes.findIndex((r) => r.handle === "filesystem");
  const catchAll = routes.findIndex((r) => r.src === "/.*");
  const mdPy404 = routes.findIndex((r) => r.src === "/(.*)\\.(md|py|sh)" && r.status === 404);
  const jsonMiss404 = routes.findIndex((r) => r.src === "/scripts\\.json" && r.status === 404);

  for (const idx of [mdPy404, jsonMiss404]) {
    expect(idx).toBeGreaterThan(fsIdx);
    expect(idx).toBeLessThan(catchAll);
  }
});
