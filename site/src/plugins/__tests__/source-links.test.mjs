// remark-source-links resolution behavior. The plugin only inspects
// `node.type === "link"` and `node.url`, so we drive it over a hand-built mdast
// tree — faithful to what remark-parse would produce — without pulling in a
// markdown parser the site package doesn't depend on. The point of these cases
// is the NNN- order-prefix / folder-mode normalization: authors link against
// the prefix-less logical slug and the on-disk file has a NNN- prefix, yet both
// must resolve to the SAME /docs route.
import { expect, test } from "bun:test";
import remarkSourceLinks from "../remark-source-links.mjs";

// The known-pages registry as vite.config.ts would build it for these fixtures.
const knownHrefs = new Set([
  "/docs/delta/explanation/what-is-delta-lake",
  "/docs/delta/reference/table-features",
  "/docs/delta/how-to/query-a-table-as-of-version",
  "/docs/unitycatalog/tutorials/first-server",
  "/blog/kernel-becomes-tree",
]);

const link = (url) => ({ type: "link", url, children: [{ type: "text", value: "x" }] });

/** Run the plugin over a paragraph of `urls` as if from source file `fromPath`,
 * return every (possibly rewritten) link URL in document order. */
function resolve(urls, fromPath, opts = { knownHrefs }) {
  const tree = {
    type: "root",
    children: [{ type: "paragraph", children: urls.map(link) }],
  };
  remarkSourceLinks(opts)(tree, { path: fromPath });
  return tree.children[0].children.map((n) => n.url);
}

const DELTA_EXPLANATION = "/repo/content/delta/explanation/002-delta-kernel-architecture.md";

test("same-bucket sibling: ./what-is-delta-lake.md → /docs route", () => {
  expect(resolve(["./what-is-delta-lake.md"], DELTA_EXPLANATION)).toEqual([
    "/docs/delta/explanation/what-is-delta-lake",
  ]);
});

test("cross-bucket: ../reference/table-features.md (on disk 001-…) → /docs route", () => {
  expect(resolve(["../reference/table-features.md"], DELTA_EXPLANATION)).toEqual([
    "/docs/delta/reference/table-features",
  ]);
});

test("folder-mode target: ../query-.../index.md addresses the folder slug", () => {
  const from = "/repo/content/delta/how-to/001-read-a-delta-table/index.md";
  expect(resolve(["../query-a-table-as-of-version/index.md"], from)).toEqual([
    "/docs/delta/how-to/query-a-table-as-of-version",
  ]);
});

test("cross-area from a UC tutorial to a sibling doc", () => {
  const from = "/repo/content/unitycatalog/tutorials/002-python-client/index.md";
  expect(resolve(["../first-server.md"], from)).toEqual([
    "/docs/unitycatalog/tutorials/first-server",
  ]);
});

test("#anchor is preserved onto the rewritten href", () => {
  expect(resolve(["./what-is-delta-lake.md#the-log"], DELTA_EXPLANATION)).toEqual([
    "/docs/delta/explanation/what-is-delta-lake#the-log",
  ]);
});

test("unresolved target is left inert (URL unchanged)", () => {
  expect(resolve(["../reference/does-not-exist.md"], DELTA_EXPLANATION)).toEqual([
    "../reference/does-not-exist.md",
  ]);
});

test("without a knownHrefs set, any resolvable .md candidate is rewritten", () => {
  expect(resolve(["./what-is-delta-lake.md"], DELTA_EXPLANATION, {})).toEqual([
    "/docs/delta/explanation/what-is-delta-lake",
  ]);
});

test("external, absolute, anchor, and model: URLs pass through untouched", () => {
  const urls = [
    "https://example.com/x.md",
    "/docs/delta/reference/table-features",
    "#section",
    "model:some.element.id",
    "mailto:x@y.com",
    "../reference/table-features", // no .md extension → not our concern
  ];
  expect(resolve(urls, DELTA_EXPLANATION)).toEqual(urls);
});
