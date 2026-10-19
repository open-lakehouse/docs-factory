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
  const { url, reported } = run("../../../../envs/uc/diagram.png", "trestle=uc");
  expect(url).toBe("/repo-assets/envs/uc/diagram.png");
  expect(reported).toEqual([["/repo/envs/uc/diagram.png", { trestle: true }]]);
  expect(run("./assets/a.svg").reported).toEqual([
    ["/repo/content/uc/how-to/011-x/assets/a.svg", { trestle: false }],
  ]);
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
