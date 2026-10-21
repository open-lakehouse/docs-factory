// Look a nav.yml `planned:` slot up by backlog id. Pure (no content globs) so
// the tab, its label, and the comment feed share one lookup and it tests under bun.
import type { NavNode } from "../../../doc-nav";

export interface PlannedSlot {
  id: string;
  title: string;
  /** Section labels above the slot, outermost first. */
  trail: string[];
  request?: string;
}

export function findPlannedSlot(
  nodes: NavNode[],
  id: string,
  trail: string[] = [],
): PlannedSlot | null {
  for (const node of nodes) {
    if (node.kind === "planned" && node.id === id) {
      return { id, title: node.title, trail, ...(node.request ? { request: node.request } : {}) };
    }
    if (node.kind === "section") {
      const hit = findPlannedSlot(node.children, id, [...trail, node.label]);
      if (hit) return hit;
    }
  }
  return null;
}
