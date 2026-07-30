// The md-twin target's pure hooks (emit/targets/md-twin.mjs) + the driver's pure
// helpers (site/scripts/build-md-twins.mjs). The full emitter integration (LikeC4
// PNG export needs Chromium) is exercised separately; these cover the parts that
// shape twin paths, frontmatter, and image URLs with no I/O.
import { test, expect } from "bun:test";
import mdTwin, { renderImage, frontmatter, LIKEC4_ASSET_BASE } from "../../../../emit/targets/md-twin.mjs";
import { twinPathForHref, injectCanonical, scaffoldSections, runnableExamplesSection } from "../../../scripts/build-md-twins.mjs";

test("renderImage points a likec4 view at the site-served PNG, wrapped in a paragraph", () => {
  const node = renderImage({ likec4: "managedTableFlow", filename: "x.png", altText: "Flow" });
  expect(node.type).toBe("paragraph"); // block node → keeps blank-line separators
  const img = node.children[0];
  expect(img.type).toBe("image");
  expect(img.url).toBe(`${LIKEC4_ASSET_BASE}/managedTableFlow.png`);
  expect(img.alt).toBe("Flow");
});

test("renderImage leaves a non-likec4 image as a plain filename", () => {
  const node = renderImage({ likec4: null, filename: "screenshot.png", altText: "Shot" });
  expect(node.children[0].url).toBe("screenshot.png");
});

test("frontmatter emits title/summary/diataxis/project but never canonical", () => {
  const fm = frontmatter({ title: "T", summary: "S", diataxis: "how-to", project: "delta", extra: "x" });
  expect(fm).toEqual({ title: "T", summary: "S", diataxis: "how-to", project: "delta" });
  expect(fm.canonical).toBeUndefined();
});

test("frontmatter returns null when the draft has nothing to expose", () => {
  expect(frontmatter({})).toBeNull();
});

test("the md-twin target is a flattening target (no title H1, reflows prose)", () => {
  expect(mdTwin.titleAsH1).toBe(false);
  expect(mdTwin.unwrapProse).toBe(true); // reflow authoring hard-wraps for clean twins
  expect(mdTwin.constructs.tldr).toBeDefined();
  expect(mdTwin.constructs.callouts).toBeDefined();
});

test("twinPathForHref maps a route to canonical-route + .md under dist/", () => {
  expect(twinPathForHref("/docs/delta/how-to/read")).toMatch(/\/dist\/docs\/delta\/how-to\/read\.md$/);
  expect(twinPathForHref("/blog/my-post")).toMatch(/\/dist\/blog\/my-post\.md$/);
});

test("injectCanonical adds canonical into an existing frontmatter block", () => {
  const out = injectCanonical("---\ntitle: T\n---\n\nBody\n", "https://x.test/docs/a");
  expect(out).toContain("title: T");
  expect(out).toContain("canonical: https://x.test/docs/a");
  // canonical sits inside the frontmatter block, before its closing fence.
  expect(out.indexOf("canonical:")).toBeLessThan(out.indexOf("\n---", 4) + 4);
});

test("injectCanonical prepends a frontmatter block when the twin has none", () => {
  const out = injectCanonical("Body only\n", "https://x.test/docs/a");
  expect(out.startsWith("---\ncanonical: https://x.test/docs/a\n---\n")).toBe(true);
});

test("scaffoldSections appends Related concepts; Runnable examples only for tutorials", () => {
  const doc = scaffoldSections("Body\n", { isTutorial: false });
  expect(doc).toContain("## Related concepts");
  expect(doc).not.toContain("## Runnable examples");

  const tut = scaffoldSections("Body\n", { isTutorial: true });
  expect(tut).toContain("## Related concepts");
  expect(tut).toContain("## Runnable examples");
  expect(tut).toContain("_None yet._"); // placeholder when no examples supplied
});

test("scaffoldSections uses a supplied Runnable examples body over the placeholder", () => {
  const examples = "## Runnable examples\n\n- [`x.py`](/docs/a/tutorials/b/x.py)\n";
  const tut = scaffoldSections("Body\n", { isTutorial: true, examples });
  expect(tut).toContain("- [`x.py`](/docs/a/tutorials/b/x.py)");
  expect(tut).not.toContain("## Runnable examples\n\n_None yet._");
});

test("runnableExamplesSection lists fetch URL + PEP 723 contract; empty when no scripts", () => {
  expect(runnableExamplesSection([])).toBe("");
  const md = runnableExamplesSection([
    {
      fetchUrl: "/docs/uc/tutorials/getting-started/snippets/catalog_flow.py",
      requiresPython: ">=3.11",
      dependencies: ["unitycatalog-client>=0.5"],
      compose: "compose.yaml",
      services: ["unitycatalog"],
    },
  ]);
  expect(md).toContain("## Runnable examples");
  expect(md).toContain("the script *is* the test");
  expect(md).toContain("[`catalog_flow.py`](/docs/uc/tutorials/getting-started/snippets/catalog_flow.py)");
  expect(md).toContain("requires Python `>=3.11`");
  expect(md).toContain("`unitycatalog-client>=0.5`");
  expect(md).toContain("needs Docker Compose `compose.yaml`");
  expect(md).toContain("services: `unitycatalog`");
});
