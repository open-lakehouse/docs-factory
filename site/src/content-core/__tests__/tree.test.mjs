// Merkle content-tree tests: deterministic hashing, precise change localization,
// and snippet-source drift propagation — the properties the review layer's diff
// and hash-aware re-anchoring rely on.
import { expect, test } from "bun:test";
import { extractHeadings } from "../slug.mjs";
import { canonicalizeTopic, normalizeTopics } from "../topics.mjs";
import { buildMerkleTree, PREAMBLE_KEY } from "../tree.mjs";

const MD = [
  "preamble prose",
  "",
  "# Intro",
  "",
  "alpha",
  "",
  "## Setup",
  "",
  "beta",
  "",
  "# Usage",
  "",
  "gamma",
].join("\n");

/** Emulate what pipeline.mjs will hand buildMerkleTree for MD above. */
function inputsFor(md, { snippets = [], codeBlocks = [] } = {}) {
  const headings = extractHeadings(md);
  // Preamble = normalized prose before the first heading. extractHeadings drops
  // it, so the pipeline computes it separately; here we hardcode MD's preamble.
  return { headings, snippets, codeBlocks, preamble: { bodyText: "preamble prose" } };
}

test("tree is deterministic across runs", () => {
  const a = buildMerkleTree(inputsFor(MD));
  const b = buildMerkleTree(inputsFor(MD));
  expect(a.rootHash).toBe(b.rootHash);
  expect(a.rootHash).toMatch(/^[0-9a-f]{64}$/);
});

test("nesting follows heading level; sections carry depth paths + parents", () => {
  const { sections, tree } = buildMerkleTree(inputsFor(MD));
  const bySlug = Object.fromEntries(sections.map((s) => [s.anchorSlug, s]));
  // Setup is nested under Intro (H2 under H1); Usage is a top-level sibling.
  expect(bySlug.setup.parentAnchorSlug).toBe("intro");
  expect(bySlug.setup.depthPath).toBe("intro/setup");
  expect(bySlug.usage.parentAnchorSlug).toBe(null);
  expect(bySlug.intro.parentAnchorSlug).toBe(null);
  // Preamble is a top-level prose node.
  expect(bySlug[PREAMBLE_KEY]).toBeTruthy();
  expect(bySlug[PREAMBLE_KEY].ordinal).toBe(-1);
  // Root has: preamble, Intro (which nests Setup), Usage.
  const topKinds = tree.children.map((c) => c.key);
  expect(topKinds).toEqual([PREAMBLE_KEY, "intro", "usage"]);
});

test("editing one section changes only its hash + its ancestors' subtree hash", () => {
  const before = buildMerkleTree(inputsFor(MD));
  const edited = MD.replace("beta", "beta EDITED");
  const after = buildMerkleTree(inputsFor(edited));

  const b = Object.fromEntries(before.sections.map((s) => [s.anchorSlug, s]));
  const a = Object.fromEntries(after.sections.map((s) => [s.anchorSlug, s]));

  // Setup's own prose changed.
  expect(a.setup.nodeHash).not.toBe(b.setup.nodeHash);
  // Intro is Setup's ancestor: own prose unchanged, subtree changed.
  expect(a.intro.nodeHash).toBe(b.intro.nodeHash);
  expect(a.intro.subtreeHash).not.toBe(b.intro.subtreeHash);
  // Usage is untouched, entirely.
  expect(a.usage.nodeHash).toBe(b.usage.nodeHash);
  expect(a.usage.subtreeHash).toBe(b.usage.subtreeHash);
  // Preamble untouched.
  expect(a[PREAMBLE_KEY].nodeHash).toBe(b[PREAMBLE_KEY].nodeHash);
  // Root changed.
  expect(after.rootHash).not.toBe(before.rootHash);
});

test("snippet-source drift propagates to root even with identical markdown", () => {
  const snippets = [
    { path: "src/x.py", region: "A..B", fileHash: "hash1", sectionSlug: "intro", position: 0 },
  ];
  const v1 = buildMerkleTree(inputsFor(MD, { snippets }));
  const v2 = buildMerkleTree(inputsFor(MD, { snippets: [{ ...snippets[0], fileHash: "hash2" }] }));
  // Same markdown, only the referenced file's content hash changed.
  expect(v2.rootHash).not.toBe(v1.rootHash);
  // The section the snippet lives in (Intro, order 1 falls in Intro's range) changed subtree.
  const s1 = Object.fromEntries(v1.sections.map((s) => [s.anchorSlug, s]));
  const s2 = Object.fromEntries(v2.sections.map((s) => [s.anchorSlug, s]));
  expect(s2.intro.subtreeHash).not.toBe(s1.intro.subtreeHash);
});

test("blob section-node hashes equal the flat section rows (invariant)", () => {
  const { tree, sections } = buildMerkleTree(inputsFor(MD));
  const bySlug = Object.fromEntries(sections.map((s) => [s.anchorSlug, s]));
  (function walk(n) {
    if (n.kind === "heading") {
      // The heading node's subtreeHash must equal the section row's subtreeHash.
      expect(n.subtreeHash).toBe(bySlug[n.anchorSlug].subtreeHash);
      // The section's own nodeHash is the prose child's hash.
      const prose = n.children.find((c) => c.kind === "prose");
      expect(prose.nodeHash).toBe(bySlug[n.anchorSlug].nodeHash);
    }
    for (const c of n.children) walk(c);
  })(tree);
});

test("normalizeTopics folds synonyms, dedupes, sorts, drops unknowns", () => {
  const dropped = [];
  const topics = normalizeTopics({
    tags: ["unity-catalog", "unitycatalog", "delta-lake", "delta-kernel", "made-up-tag", "devrel"],
    project: "unitycatalog",
    warn: (l) => dropped.push(l),
  });
  expect(topics).toEqual(["delta", "unity-catalog"]);
  // "made-up-tag" is a genuine unknown → warned; "devrel" maps to null → silently dropped.
  expect(dropped).toEqual(["made-up-tag"]);
});

test("canonicalizeTopic: canonical passes through, duckdb is valid with no content", () => {
  expect(canonicalizeTopic("delta")).toBe("delta");
  expect(canonicalizeTopic("duckdb")).toBe("duckdb");
  expect(canonicalizeTopic("nope")).toBe(null);
});
