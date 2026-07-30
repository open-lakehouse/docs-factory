// The workspace's left navigation: a file-explorer-style tree of all reviewable
// content. Branches (project → bucket, blog series) expand/collapse; leaves open
// the page in a middle-pane tab. Built from build-time content (tree-model.ts),
// expansion persisted in sessionStorage (expansion-context.tsx). Leaf rows show
// compact status dots: frontmatter authoring (idea / draft / ready) then DB
// review lifecycle (none / in review / changes requested / approved / released).
// Branch aggregates show a review status dot when any descendant is pending.
import { useMemo } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { Files, FileText, FolderTree, Layers3, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import DiataxisIcon from "../../DiataxisIcon";
import { listDrafts } from "../../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ReviewState } from "../../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../../lib/auth-context";
import { refToParam } from "../../../lib/content-ref";
import { refTokenOf } from "./view-token";
import { statusDotClass } from "../../../lib/frontmatter-status";
import { PENDING_REVIEW_STATES } from "../../../lib/review-inbox";
import { refKey } from "../../../lib/review-queries";
import { REVIEW_STATE_LABEL, reviewStateDotClass } from "../../../lib/review-status";
import { useExpansion } from "./expansion-context";
import { useReviewTree, type TreeNode } from "./tree-model";
import { TreeRow } from "./TreeRow";
import { useWorkspaceTabs } from "./workspace-tabs-context";

function FrontmatterStatusDot({ status }: { status?: string }) {
  const label = (status ?? "draft").toLowerCase();
  return (
    <span
      className={cn("tree-status-dot", statusDotClass(status))}
      title={label}
      aria-label={`Authoring: ${label}`}
    />
  );
}

function ReviewStatusDot({ state }: { state: ReviewState }) {
  const label = REVIEW_STATE_LABEL[state] ?? "unknown";
  return (
    <span
      className={cn("tree-status-dot", reviewStateDotClass(state))}
      title={label}
      aria-label={`Review: ${label}`}
    />
  );
}

function LeafTrailing({
  frontmatterStatus,
  reviewState,
}: {
  frontmatterStatus?: string;
  reviewState: ReviewState;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <FrontmatterStatusDot status={frontmatterStatus} />
      <ReviewStatusDot state={reviewState} />
    </span>
  );
}

function BranchIcon({ node }: { node: Extract<TreeNode, { kind: "branch" }> }) {
  const className = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (node.role === "axis" && node.axis) {
    return <DiataxisIcon axis={node.axis} className={className} />;
  }
  if (node.role === "blog") {
    return <Newspaper className={className} aria-hidden="true" />;
  }
  if (node.role === "series") {
    return <Layers3 className={className} aria-hidden="true" />;
  }
  return <FolderTree className={className} aria-hidden="true" />;
}

/** Highest-priority pending review state in a subtree, if any. Changes-
 *  requested wins over in-review so collapsed groups surface the sharper signal. */
function pendingInSubtree(
  node: TreeNode,
  reviewByRef: Map<string, ReviewState>,
): ReviewState | undefined {
  if (node.kind === "leaf") {
    const state = reviewByRef.get(refKey(node.ref)) ?? ReviewState.NONE;
    return PENDING_REVIEW_STATES.has(state) ? state : undefined;
  }
  let found: ReviewState | undefined;
  for (const child of node.children) {
    const childPending = pendingInSubtree(child, reviewByRef);
    if (childPending === undefined) continue;
    if (childPending === ReviewState.CHANGES_REQUESTED) return childPending;
    found = childPending;
  }
  return found;
}

function Node({
  node,
  depth,
  reviewByRef,
}: {
  node: TreeNode;
  depth: number;
  reviewByRef: Map<string, ReviewState>;
}) {
  const { isOpen, toggle } = useExpansion();
  const { openTab, activeToken } = useWorkspaceTabs();

  if (node.kind === "leaf") {
    const token = refToParam(node.ref);
    const reviewState = reviewByRef.get(refKey(node.ref)) ?? ReviewState.NONE;
    return (
      <TreeRow
        depth={depth}
        icon={<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        label={node.label}
        trailing={
          <LeafTrailing frontmatterStatus={node.frontmatterStatus} reviewState={reviewState} />
        }
        // The active tab may be any of this item's views (rendered/md/script);
        // compare on the group key so the row stays highlighted across them.
        selected={activeToken !== null && refTokenOf(activeToken) === token}
        onSelect={() => openTab(node.ref)}
      />
    );
  }

  const open = isOpen(node.id);
  const pendingState = pendingInSubtree(node, reviewByRef);
  return (
    <>
      <TreeRow
        depth={depth}
        icon={<BranchIcon node={node} />}
        label={node.label}
        expandable
        open={open}
        trailing={pendingState !== undefined ? <ReviewStatusDot state={pendingState} /> : undefined}
        onToggle={() => toggle(node.id)}
      />
      {open &&
        node.children.map((child, i) => (
          <Node
            key={child.kind === "leaf" ? refToParam(child.ref) : child.id + i}
            node={child}
            depth={depth + 1}
            reviewByRef={reviewByRef}
          />
        ))}
    </>
  );
}

export default function ReviewTree() {
  const { tree, isLoading } = useReviewTree();
  const { isAllowlisted } = useAuth();
  const { data } = useQuery(listDrafts, {}, { enabled: isAllowlisted });

  const reviewByRef = useMemo(() => {
    const map = new Map<string, ReviewState>();
    for (const draft of data?.drafts ?? []) {
      if (draft.ref) map.set(refKey(draft.ref), draft.reviewState);
    }
    return map;
  }, [data?.drafts]);

  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" aria-label="Content">
      <p className="flex items-center gap-1.5 px-2 py-1 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
        <Files className="h-3.5 w-3.5 text-primary/80" aria-hidden="true" />
        Content
      </p>
      {isLoading ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
      ) : (
        tree.map((node) => (
          <Node
            key={node.kind === "leaf" ? refToParam(node.ref) : node.id}
            node={node}
            depth={0}
            reviewByRef={reviewByRef}
          />
        ))
      )}
    </nav>
  );
}
