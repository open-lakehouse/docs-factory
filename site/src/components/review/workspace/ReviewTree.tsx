// The workspace's left navigation: Overview (pipeline + product + comments)
// above a file-explorer-style tree of all reviewable content. Branches
// (project → bucket, blog series) expand/collapse; leaves open the page in a
// middle-pane tab. Built from build-time content (tree-model.ts), expansion
// persisted in sessionStorage (expansion-context.tsx). Leaf icons tint with
// the effective status; branches show descendant counts by status immediately
// after their label. A right-edge icon marks items requested from the viewer.
import { useMemo } from "react";
import { useQuery } from "@connectrpc/connect-query";
import {
  Files,
  FileText,
  FolderTree,
  LayoutDashboard,
  Layers3,
  Newspaper,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import DiataxisIcon from "../../DiataxisIcon";
import {
  listDrafts,
  listReviewRequests,
} from "../../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { ReviewState } from "../../../gen/docs_factory/review/v1/messages_pb";
import { useAuth } from "../../../lib/auth-context";
import { refToParam } from "../../../lib/content-ref";
import { isOverviewGroup } from "./overview-token";
import { refTokenOf } from "./view-token";
import {
  effectiveStatus,
  effectiveStatusIconClass,
  effectiveStatusLabel,
  STATUS_BUCKET_ORDER,
  statusBucket,
  statusBucketDotClass,
  statusBucketLabel,
  type StatusBucket,
} from "../../../lib/effective-status";
import { refKey } from "../../../lib/review-queries";
import { useExpansion } from "./expansion-context";
import { useReviewTree, type TreeNode } from "./tree-model";
import { TreeRow } from "./TreeRow";
import { useWorkspaceTabs } from "./workspace-tabs-context";

type LeafStatus = { frontmatterStatus?: string; reviewState: ReviewState };

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

/** Count every leaf descendant by effective status bucket. */
function statusCountsInSubtree(
  node: TreeNode,
  reviewByRef: Map<string, ReviewState>,
): Map<StatusBucket, number> {
  const counts = new Map<StatusBucket, number>();
  function bump(bucket: StatusBucket) {
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  function walk(n: TreeNode) {
    if (n.kind === "leaf") {
      const reviewState = reviewByRef.get(refKey(n.ref)) ?? ReviewState.NONE;
      bump(statusBucket(effectiveStatus(n.frontmatterStatus, reviewState)));
      return;
    }
    for (const child of n.children) walk(child);
  }
  walk(node);
  return counts;
}

function StatusCountStrip({ counts }: { counts: Map<StatusBucket, number> }) {
  const entries = STATUS_BUCKET_ORDER.filter((bucket) => (counts.get(bucket) ?? 0) > 0);
  if (entries.length === 0) return null;
  const summary = entries
    .map((bucket) => `${counts.get(bucket)} ${statusBucketLabel(bucket)}`)
    .join(", ");
  return (
    <span className="tree-status-counts" title={summary} aria-label={summary}>
      {entries.map((bucket) => (
        <span key={bucket} className="tree-status-count">
          <span className={cn("tree-status-dot", statusBucketDotClass(bucket))} aria-hidden />
          {counts.get(bucket)}
        </span>
      ))}
    </span>
  );
}

function LeafIcon({ status }: { status: LeafStatus }) {
  const effective = effectiveStatus(status.frontmatterStatus, status.reviewState);
  const label = effectiveStatusLabel(effective);
  return (
    <FileText
      className={cn("h-3.5 w-3.5 shrink-0", effectiveStatusIconClass(effective))}
      aria-label={label}
      title={label}
    />
  );
}

/** Number of requested-from-viewer leaves in this subtree. */
function requestedInSubtree(node: TreeNode, requestedRefs: Set<string>): number {
  if (node.kind === "leaf") {
    return requestedRefs.has(refKey(node.ref)) ? 1 : 0;
  }
  return node.children.reduce(
    (total, child) => total + requestedInSubtree(child, requestedRefs),
    0,
  );
}

function RequestedReviewIndicator({ count = 1 }: { count?: number }) {
  const label =
    count === 1 ? "Review requested from you" : `${count} reviews requested from you`;
  return (
    <UserCheck
      className="h-3.5 w-3.5 shrink-0 text-primary"
      title={label}
      aria-label={label}
    />
  );
}

function Node({
  node,
  depth,
  reviewByRef,
  requestedRefs,
}: {
  node: TreeNode;
  depth: number;
  reviewByRef: Map<string, ReviewState>;
  requestedRefs: Set<string>;
}) {
  const { isOpen, toggle } = useExpansion();
  const { openTab, activeToken } = useWorkspaceTabs();

  if (node.kind === "leaf") {
    const token = refToParam(node.ref);
    const reviewState = reviewByRef.get(refKey(node.ref)) ?? ReviewState.NONE;
    return (
      <TreeRow
        depth={depth}
        icon={
          <LeafIcon
            status={{ frontmatterStatus: node.frontmatterStatus, reviewState }}
          />
        }
        label={node.label}
        trailing={
          requestedRefs.has(refKey(node.ref)) ? <RequestedReviewIndicator /> : undefined
        }
        // The active tab may be any of this item's views (rendered/md/script);
        // compare on the group key so the row stays highlighted across them.
        selected={activeToken !== null && refTokenOf(activeToken) === token}
        onSelect={() => openTab(node.ref)}
      />
    );
  }

  const open = isOpen(node.id);
  const counts = statusCountsInSubtree(node, reviewByRef);
  const requestedCount = requestedInSubtree(node, requestedRefs);
  return (
    <>
      <TreeRow
        depth={depth}
        icon={<BranchIcon node={node} />}
        label={node.label}
        expandable
        open={open}
        afterLabel={<StatusCountStrip counts={counts} />}
        trailing={
          requestedCount > 0 ? (
            <RequestedReviewIndicator count={requestedCount} />
          ) : undefined
        }
        onToggle={() => toggle(node.id)}
      />
      {open &&
        node.children.map((child, i) => (
          <Node
            key={child.kind === "leaf" ? refToParam(child.ref) : child.id + i}
            node={child}
            depth={depth + 1}
            reviewByRef={reviewByRef}
            requestedRefs={requestedRefs}
          />
        ))}
    </>
  );
}

export default function ReviewTree() {
  const { tree, isLoading } = useReviewTree();
  const { isAllowlisted } = useAuth();
  const { data } = useQuery(listDrafts, {}, { enabled: isAllowlisted });
  const { data: requestData } = useQuery(
    listReviewRequests,
    { mine: true, openOnly: true },
    { enabled: isAllowlisted },
  );
  const { openOverview, activeToken } = useWorkspaceTabs();

  const reviewByRef = useMemo(() => {
    const map = new Map<string, ReviewState>();
    for (const draft of data?.drafts ?? []) {
      if (draft.ref) map.set(refKey(draft.ref), draft.reviewState);
    }
    return map;
  }, [data?.drafts]);

  const requestedRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const request of requestData?.requests ?? []) {
      if (request.ref) refs.add(refKey(request.ref));
    }
    return refs;
  }, [requestData?.requests]);

  const overviewSelected =
    activeToken !== null && isOverviewGroup(refTokenOf(activeToken));

  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" aria-label="Review">
      <TreeRow
        depth={0}
        icon={<LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        label="Overview"
        selected={overviewSelected}
        onSelect={() => openOverview()}
      />
      <p className="mt-2 flex items-center gap-1.5 px-2 py-1 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
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
            requestedRefs={requestedRefs}
          />
        ))
      )}
    </nav>
  );
}
