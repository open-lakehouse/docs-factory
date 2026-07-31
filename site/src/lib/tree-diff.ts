// Client-side stable-key diff of two content-version Merkle trees, over the proto
// MerkleNode shape returned by GetVersionTree. Mirror of server/src/tree-diff.ts
// (kept in sync deliberately — the two run the same algorithm so the interactive
// tree view and the ProductChanges rollup agree). Matches by `key` (the depth
// path), not ordinal, so a moved section reads as a move; subtree_hash gives a
// free structural-equality fast-out. tree-diff-parity.test.ts pins this against
// the server copy so the mirror can't silently drift.
import type { MerkleNode } from "../gen/docs_factory/review/v1/messages_pb";
import { ChangeKind as ProtoChangeKind } from "../gen/docs_factory/review/v1/review_service_pb";

export type ChangeKind = "added" | "removed" | "modified" | "modified-descendants" | "moved";

/**
 * Human-readable label per change kind — the single source shared by every
 * review surface that renders a diff badge (VersionHistory, ProductRollup), so
 * the wording can't drift between them.
 */
export const CHANGE_LABEL: Record<ChangeKind, string> = {
  added: "added",
  removed: "removed",
  modified: "modified",
  "modified-descendants": "sub-changed",
  moved: "moved",
};

/** CSS modifier class per change kind (`change-<class>` badge styling). */
export const CHANGE_CLASS: Record<ChangeKind, string> = {
  added: "added",
  removed: "removed",
  modified: "modified",
  "modified-descendants": "modified-descendants",
  moved: "moved",
};

/**
 * Map a proto ChangeKind enum value (from ProductChanges) to the string kind
 * this module keys on, so the server-side rollup and the client-side diff share
 * one label/class vocabulary. UNSPECIFIED/unknown falls back to "modified".
 */
export function changeKindFromProto(kind: ProtoChangeKind): ChangeKind {
  switch (kind) {
    case ProtoChangeKind.ADDED:
      return "added";
    case ProtoChangeKind.REMOVED:
      return "removed";
    case ProtoChangeKind.MODIFIED_DESCENDANTS:
      return "modified-descendants";
    case ProtoChangeKind.MOVED:
      return "moved";
    default:
      return "modified";
  }
}

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

/**
 * Diff two Merkle trees. Returns one entry per changed node (unchanged subtrees
 * are pruned). Empty when the roots are structurally identical.
 */
export function diffTrees(before: MerkleNode | null, after: MerkleNode | null): DiffEntry[] {
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

/**
 * Collapse a raw Merkle diff into review-level changes:
 * - descendant-only entries are context, not changes of their own;
 * - a newly added/removed subtree is represented by its highest changed node,
 *   instead of repeating every prose/code leaf below it.
 */
export function compactDiff(
  entries: DiffEntry[],
  before: MerkleNode | null,
  after: MerkleNode | null,
): DiffEntry[] {
  const beforeIndex = before ? indexTree(before) : new Map<string, Indexed>();
  const afterIndex = after ? indexTree(after) : new Map<string, Indexed>();
  const changed = new Map(entries.map((e) => [e.key, e]));

  return entries.filter((entry) => {
    if (entry.change === "modified-descendants") return false;
    if (entry.change !== "added" && entry.change !== "removed") return true;

    const index = entry.change === "removed" ? beforeIndex : afterIndex;
    let parentKey: string | undefined = index.get(entry.key)?.parentKey;
    // Top-level children parent to the doc root (""), which is never itself a
    // change entry — falsy parentKey ends the walk there.
    while (parentKey) {
      if (changed.get(parentKey)?.change === entry.change) return false;
      parentKey = index.get(parentKey)?.parentKey;
    }
    return true;
  });
}

/**
 * Review-facing diff. A null baseline means the artifact is brand new — surface
 * a single "Document added" summary instead of every leaf as added. Otherwise
 * return the compacted structural diff.
 */
export function reviewDiff(
  before: MerkleNode | null,
  after: MerkleNode | null,
): DiffEntry[] {
  if (!after) return [];
  if (!before) {
    return [{ key: "", kind: "doc", change: "added", label: "Document added" }];
  }
  return compactDiff(diffTrees(before, after), before, after);
}

/** Set of node keys → change kind (for badge lookup). */
export function changeByKey(entries: DiffEntry[]): Map<string, ChangeKind> {
  return new Map(entries.map((e) => [e.key, e.change]));
}
