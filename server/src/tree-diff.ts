// Stable-key diff of two content-version Merkle trees.
//
// Matches nodes by their stable `key` (the depth_path fingerprint path for
// headings; a synthetic path for code/snippet leaves), NOT by ordinal — so a
// section that moves reads as a move, not a delete+add. The subtree_hash gives a
// free structural-equality fast-out; node_hash distinguishes "this node's own
// content changed" from "only a descendant changed".
//
// Used by the ProductChanges RPC server-side (fan-out over a whole product's
// version pairs) and mirrored by the client util for the interactive tree view.
import type { MerkleNodeJson } from "./db-map.js";

export type ChangeKind = "added" | "removed" | "modified" | "modified-descendants" | "moved";

export interface DiffEntry {
  key: string;
  kind: string; // MerkleNode.kind: doc|heading|prose|code|snippet
  change: ChangeKind;
  label: string;
  anchorSlug?: string;
}

interface IndexedNode {
  node: MerkleNodeJson;
  parentKey: string;
  ordinal: number;
}

/** Flatten a tree into key → {node, parentKey, ordinal}, skipping the doc root. */
function indexTree(root: MerkleNodeJson): Map<string, IndexedNode> {
  const map = new Map<string, IndexedNode>();
  const walk = (node: MerkleNodeJson, parentKey: string) => {
    node.children?.forEach((child, i) => {
      map.set(child.key, { node: child, parentKey, ordinal: i });
      walk(child, child.key);
    });
  };
  walk(root, root.key);
  return map;
}

/**
 * Diff two Merkle trees. Returns one entry per changed node (unchanged subtrees
 * are pruned). Empty when the roots are structurally identical.
 */
export function diffTrees(before: MerkleNodeJson | null, after: MerkleNodeJson | null): DiffEntry[] {
  if (!after) return [];
  if (!before) {
    // Everything is new relative to the baseline.
    return [...indexTree(after).values()].map(({ node }) => entry(node, "added"));
  }
  if (before.subtreeHash === after.subtreeHash) return [];

  const a = indexTree(before);
  const b = indexTree(after);
  const out: DiffEntry[] = [];

  for (const [key, { node, parentKey, ordinal }] of b) {
    const prev = a.get(key);
    if (!prev) {
      out.push(entry(node, "added"));
      continue;
    }
    const moved = prev.parentKey !== parentKey || prev.ordinal !== ordinal;
    if (prev.node.subtreeHash === node.subtreeHash) {
      // Unchanged content; surface a pure move if it relocated, else prune.
      if (moved) out.push(entry(node, "moved"));
      continue;
    }
    if (prev.node.nodeHash === node.nodeHash) {
      out.push(entry(node, moved ? "moved" : "modified-descendants"));
    } else {
      out.push(entry(node, moved ? "moved" : "modified"));
    }
  }
  for (const [key, { node }] of a) {
    if (!b.has(key)) out.push(entry(node, "removed"));
  }
  return out;
}

function entry(node: MerkleNodeJson, change: ChangeKind): DiffEntry {
  return {
    key: node.key,
    kind: node.kind,
    change,
    label: node.label,
    ...(node.anchorSlug ? { anchorSlug: node.anchorSlug } : {}),
  };
}

/**
 * The anchor slugs of sections whose ENTIRE subtree (own prose + subsections +
 * code + snippets) is unchanged vs. the baseline — the set the re-anchoring fast
 * path keeps without a scan. Keyed on the HEADING node's subtree hash (the whole
 * section), not the prose leaf's: a heading whose own prose is untouched but
 * whose subsection changed is NOT unchanged. The preamble (a top-level prose
 * node) is included by its own subtree hash.
 */
export function unchangedSlugs(before: MerkleNodeJson | null, after: MerkleNodeJson | null): Set<string> {
  const unchanged = new Set<string>();
  if (!before || !after) return unchanged;
  const a = indexTree(before);
  const b = indexTree(after);
  for (const [key, { node, parentKey }] of b) {
    // Heading nodes, or the preamble (a prose node whose parent is the doc root).
    const isHeading = node.kind === "heading";
    const isPreamble = node.kind === "prose" && parentKey === "";
    if (!isHeading && !isPreamble) continue;
    if (!node.anchorSlug) continue;
    const prev = a.get(key);
    if (prev && prev.node.subtreeHash === node.subtreeHash) unchanged.add(node.anchorSlug);
  }
  return unchanged;
}
