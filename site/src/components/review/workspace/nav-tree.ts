// Map a project's resolved nav.yml onto workspace tree nodes. Kept free of the
// build-time content globs so it can be unit-tested under bun.
import type { NavNode } from "../../../doc-nav";
import { docRef } from "../../../lib/content-ref";
import { treeNodeId } from "./expansion-context";
import type { TreeNode } from "./tree-model";

/**
 * Secondary placements stay in, so the tree reads like the emitted sidebar.
 * Section ids carry the full label trail: the same label may recur under
 * different parents.
 */
export function navBranches(
  project: string,
  nodes: NavNode[],
  statusOf: (bucket: string, slug: string) => string | undefined,
  trail: string[] = [],
): TreeNode[] {
  return nodes.map((node): TreeNode => {
    if (node.kind === "section") {
      const path = [...trail, node.label];
      return {
        kind: "branch",
        id: treeNodeId.navSection(project, path),
        label: node.label,
        role: "section",
        children: navBranches(project, node.children, statusOf, path),
      };
    }
    if (node.kind === "planned") return { kind: "planned", id: node.id, title: node.title };
    return {
      kind: "leaf",
      label: node.label,
      ref: docRef(project, node.bucket, node.slug),
      frontmatterStatus: statusOf(node.bucket, node.slug),
    };
  });
}
