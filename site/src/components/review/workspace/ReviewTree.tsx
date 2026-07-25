// The workspace's left navigation: a file-explorer-style tree of all reviewable
// content. Branches (project → bucket, blog series) expand/collapse; leaves open
// the page in a middle-pane tab. Built from build-time content (tree-model.ts),
// expansion persisted in sessionStorage (expansion-context.tsx).
import { FileText } from "lucide-react";
import { refToParam } from "../../../lib/content-ref";
import { useExpansion } from "./expansion-context";
import { useReviewTree, type TreeNode } from "./tree-model";
import { TreeRow } from "./TreeRow";
import { useWorkspaceTabs } from "./workspace-tabs-context";

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const { isOpen, toggle } = useExpansion();
  const { openTab, activeToken } = useWorkspaceTabs();

  if (node.kind === "leaf") {
    const token = refToParam(node.ref);
    return (
      <TreeRow
        depth={depth}
        icon={<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        label={node.label}
        selected={activeToken === token}
        onSelect={() => openTab(node.ref)}
      />
    );
  }

  const open = isOpen(node.id);
  return (
    <>
      <TreeRow
        depth={depth}
        label={node.label}
        expandable
        open={open}
        onToggle={() => toggle(node.id)}
      />
      {open &&
        node.children.map((child, i) => (
          <Node key={child.kind === "leaf" ? refToParam(child.ref) : child.id + i} node={child} depth={depth + 1} />
        ))}
    </>
  );
}

export default function ReviewTree() {
  const { tree, isLoading } = useReviewTree();

  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" aria-label="Content">
      <p className="px-2 py-1 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
        Content
      </p>
      {isLoading ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
      ) : (
        tree.map((node) => (
          <Node key={node.kind === "leaf" ? refToParam(node.ref) : node.id} node={node} depth={0} />
        ))
      )}
    </nav>
  );
}
