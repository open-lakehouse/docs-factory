import { expect, test } from "bun:test";
import remarkResolveImages from "../remark-resolve-images.mjs";

const ROOT = "/repo";
const PAGE = "/repo/content/uc/how-to/011-x/index.md";

function run(url, title) {
  const image = { type: "image", url, title };
  const reported = [];
  const tree = { type: "root", children: [{ type: "paragraph", children: [image] }] };
  remarkResolveImages({ repoRoot: ROOT, onAsset: (abs, o) => reported.push([abs, o]) })(tree, {
    path: PAGE,
  });
  return { url: image.url, reported };
}

test("a relative image becomes a repo-relative URL and is reported", () => {
  const { url, reported } = run("./assets/a.svg");
  expect(url).toBe("/repo-assets/content/uc/how-to/011-x/assets/a.svg");
  expect(reported).toEqual([["/repo/content/uc/how-to/011-x/assets/a.svg", undefined]]);
});

function runMarker(meta) {
  const node = { type: "code", lang: "trestle", meta, value: "The stack" };
  const reported = [];
  const tree = { type: "root", children: [node] };
  remarkResolveImages({ repoRoot: ROOT, onAsset: (abs, o) => reported.push([abs, o]) })(tree, {
    path: PAGE,
  });
  return { meta: node.meta, reported };
}

test("a trestle marker's ref becomes its snapshot's URL and is reported", () => {
  expect(runMarker("uc")).toEqual({
    meta: "/repo-assets/envs/uc/diagram.trestle-graph.json",
    reported: [["/repo/envs/uc/diagram.trestle-graph.json", { trestle: true }]],
  });
  expect(runMarker("./assets/s.trestle-graph.json")).toEqual({
    meta: "/repo-assets/content/uc/how-to/011-x/assets/s.trestle-graph.json",
    reported: [["/repo/content/uc/how-to/011-x/assets/s.trestle-graph.json", { trestle: true }]],
  });
});

test("absolute, external, and data: URLs are left alone", () => {
  for (const src of [
    "/assets/a.png",
    "https://x.io/a.png",
    "//x.io/a.png",
    "data:image/png;base64,AA",
  ]) {
    expect(run(src)).toEqual({ url: src, reported: [] });
  }
});

test("a path outside the repository fails the page", () => {
  expect(() => run("../../../../../../elsewhere.png")).toThrow(/outside the repository/);
});
