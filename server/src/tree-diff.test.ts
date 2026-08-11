// Stable-key tree-diff tests: structural equality fast-out, precise change
// classification (added/removed/modified/modified-descendants/moved), and the
// unchangedSlugs set the re-anchoring fast path consumes.
import { describe, expect, test } from "bun:test";
import type { MerkleNodeJson } from "./db-map.js";
import { compactDiff, diffTrees, reviewDiff, unchangedSlugs } from "./tree-diff.js";

/** Build a heading node with a prose child, for compact fixtures. */
function heading(
  key: string,
  subtreeHash: string,
  opts: { proseHash?: string; children?: MerkleNodeJson[] } = {},
): MerkleNodeJson {
  const prose: MerkleNodeJson = {
    key: `${key}#prose`,
    kind: "prose",
    nodeHash: opts.proseHash ?? `${key}-prose`,
    subtreeHash: opts.proseHash ?? `${key}-prose`,
    level: 0,
    label: "(prose)",
    children: [],
    anchorSlug: key,
  };
  return {
    key,
    kind: "heading",
    nodeHash: `${key}-node`,
    subtreeHash,
    level: 1,
    label: key,
    children: [prose, ...(opts.children ?? [])],
    anchorSlug: key,
  };
}

function doc(children: MerkleNodeJson[], subtreeHash: string): MerkleNodeJson {
  return { key: "", kind: "doc", nodeHash: "doc", subtreeHash, level: 0, label: "(doc)", children };
}

describe("diffTrees", () => {
  test("identical roots → no changes (fast-out)", () => {
    const t = doc([heading("intro", "s1")], "root1");
    expect(diffTrees(t, t)).toEqual([]);
  });

  test("null baseline → everything added", () => {
    const t = doc([heading("intro", "s1")], "root1");
    const changes = diffTrees(null, t);
    expect(changes.every((c) => c.change === "added")).toBe(true);
    expect(changes.map((c) => c.key).sort()).toEqual(["intro", "intro#prose"]);
  });

  test("added and removed sections", () => {
    const before = doc([heading("intro", "s1")], "r1");
    const after = doc([heading("intro", "s1"), heading("usage", "s2")], "r2");
    const changes = diffTrees(before, after);
    expect(changes.find((c) => c.key === "usage")?.change).toBe("added");
    // intro unchanged (same subtreeHash) → pruned.
    expect(changes.find((c) => c.key === "intro")).toBeUndefined();
  });

  test("own-content change → modified leaf; ancestors → modified-descendants", () => {
    // Parent "intro" with child "intro/setup". Only setup's prose text changes.
    // The prose LEAF is the node whose own content changed (→ modified); both
    // heading ancestors have stable identity but changed subtrees (→ descendants).
    const setupBefore = heading("intro/setup", "setup-s1", { proseHash: "p1" });
    const setupAfter = heading("intro/setup", "setup-s2", { proseHash: "p2" });
    const before = doc([heading("intro", "intro-s1", { children: [setupBefore] })], "r1");
    const after = doc([heading("intro", "intro-s2", { children: [setupAfter] })], "r2");
    const changes = diffTrees(before, after);
    const byKey = Object.fromEntries(changes.map((c) => [c.key, c.change]));
    // The prose leaf under setup is the actual own-content change.
    expect(byKey["intro/setup#prose"]).toBe("modified");
    // Both heading ancestors: own identity stable, subtree changed.
    expect(byKey["intro/setup"]).toBe("modified-descendants");
    expect(byKey["intro"]).toBe("modified-descendants");
  });

  test("moved section (same content, new position)", () => {
    const before = doc([heading("a", "sa"), heading("b", "sb")], "r1");
    const after = doc([heading("b", "sb"), heading("a", "sa")], "r2");
    const changes = diffTrees(before, after);
    // Both moved (their ordinals swapped) but content is identical.
    expect(changes.find((c) => c.key === "a")?.change).toBe("moved");
    expect(changes.find((c) => c.key === "b")?.change).toBe("moved");
  });
});

describe("compactDiff", () => {
  test("drops modified-descendants and collapses added subtrees", () => {
    const setup = heading("intro/setup", "setup-s1");
    const after = doc([heading("intro", "intro-s1", { children: [setup] })], "r1");
    const raw = diffTrees(null, after);
    const compact = compactDiff(raw, null, after);
    expect(compact.map((c) => c.key)).toEqual(["intro"]);
    expect(compact.every((c) => c.change === "added")).toBe(true);
  });

  test("keeps sibling adds and genuine modifications", () => {
    const before = doc([heading("intro", "s1")], "r1");
    const after = doc(
      [heading("intro", "s1-CHANGED", { proseHash: "p2" }), heading("usage", "s2")],
      "r2",
    );
    const compact = compactDiff(diffTrees(before, after), before, after);
    const byKey = Object.fromEntries(compact.map((c) => [c.key, c.change]));
    expect(byKey["intro#prose"]).toBe("modified");
    expect(byKey["usage"]).toBe("added");
    expect(byKey["intro"]).toBeUndefined(); // modified-descendants dropped
    expect(byKey["usage#prose"]).toBeUndefined(); // collapsed under usage
  });
});

describe("reviewDiff", () => {
  test("null baseline → single Document added summary", () => {
    const after = doc([heading("intro", "s1"), heading("usage", "s2")], "r1");
    expect(reviewDiff(null, after)).toEqual([
      { key: "", kind: "doc", change: "added", label: "Document added" },
    ]);
  });

  test("with baseline → compacted structural diff", () => {
    const before = doc([heading("intro", "s1")], "r1");
    const after = doc([heading("intro", "s1"), heading("usage", "s2")], "r2");
    expect(reviewDiff(before, after)).toEqual([
      expect.objectContaining({ key: "usage", change: "added" }),
    ]);
  });
});

describe("unchangedSlugs", () => {
  test("collects heading slugs whose subtree is unchanged", () => {
    const before = doc([heading("intro", "s1"), heading("usage", "s2")], "r1");
    const after = doc([heading("intro", "s1"), heading("usage", "s2-CHANGED")], "r2");
    const set = unchangedSlugs(before, after);
    expect(set.has("intro")).toBe(true); // unchanged
    expect(set.has("usage")).toBe(false); // subtree changed
  });

  test("empty when either tree is null", () => {
    expect(unchangedSlugs(null, doc([], "r")).size).toBe(0);
    expect(unchangedSlugs(doc([], "r"), null).size).toBe(0);
  });
});
