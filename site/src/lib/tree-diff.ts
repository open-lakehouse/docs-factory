// Client-side stable-key diff of two content-version Merkle trees, over the proto
// MerkleNode shape returned by GetVersionTree. Mirror of server/src/tree-diff.ts
// (kept in sync deliberately — the two run the same algorithm so the interactive
// tree view and the ProductChanges rollup agree). Matches by `key` (the depth
// path), not ordinal, so a moved section reads as a move; subtree_hash gives a
// free structural-equality fast-out.
import type { MerkleNode } from "../gen/docs_factory/review/v1/messages_pb";

export type ChangeKind = "added" | "removed" | "modified" | "modified-descendants" | "moved";

export interface DiffEntry {
  key: string;
  kind: string; // MerkleNode.kind: doc|heading|prose|code|snippet
  change: ChangeKind;
  label: string;
  anchorSlug?: string;
}

interface Indexed {
  node: MerkleNode;
  parentKey: string;
  ordinal: number;
}

function indexTree(root: MerkleNode): Map<string, Indexed> {
  const map = new Map<string, Indexed>();
  const walk = (node: MerkleNode, parentKey: string) => {
    node.children.forEach((child, i) => {
      map.set(child.key, { node: child, parentKey, ordinal: i });
      walk(child, child.key);
    });
  };
  walk(root, root.key);
  return map;
}

function entry(node: MerkleNode, change: ChangeKind): DiffEntry {
  return {
    key: node.key,
    kind: node.kind,
    change,
    label: node.label,
    ...(node.anchorSlug ? { anchorSlug: node.anchorSlug } : {}),
  };
}

/** Diff two trees → one entry per changed node (unchanged subtrees pruned). */
export function diffTrees(before: MerkleNode | null, after: MerkleNode | null): DiffEntry[] {
  if (!after) return [];
  if (!before) return [...indexTree(after).values()].map(({ node }) => entry(node, "added"));
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

/** Set of node keys with a change of the given kinds (for badge lookup). */
export function changeByKey(entries: DiffEntry[]): Map<string, ChangeKind> {
  return new Map(entries.map((e) => [e.key, e.change]));
}
