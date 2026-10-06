// The workspace's left navigation: Overview (pipeline + product + comments)
// above a file-explorer-style tree of all reviewable content. Branches
// (project → bucket or nav.yml section, blog series) expand/collapse; leaves
// open the page in a middle-pane tab. Built from build-time content (tree-model.ts), expansion
// persisted in sessionStorage (expansion-context.tsx). Leaf icons tint with
// the effective status; branches show descendant counts by status immediately
// after their label. A right-edge icon marks items requested from the viewer.
// Nav sections and blog series take content requests, listed under them.

import { useQuery } from "@connectrpc/connect-query";
import {
  CircleDashed,
  Files,
  FileText,
  FolderTree,
  Layers3,
  LayoutDashboard,
  ListTree,
  MessageSquarePlus,
  Newspaper,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { projectNav } from "../../../doc-nav";
import type { ContentRequest } from "../../../gen/docs_factory/review/v1/messages_pb";
import { ReviewState } from "../../../gen/docs_factory/review/v1/messages_pb";
import {
  listDrafts,
  listReviewRequests,
} from "../../../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { useAuth } from "../../../lib/auth-context";
import { refToParam } from "../../../lib/content-ref";
import {
  effectiveStatus,
  effectiveStatusIconClass,
  effectiveStatusLabel,
  STATUS_BUCKET_ORDER,
  type StatusBucket,
  statusBucket,
  statusBucketDotClass,
  statusBucketLabel,
} from "../../../lib/effective-status";
import { refKey } from "../../../lib/review-queries";
import DiataxisIcon from "../../DiataxisIcon";
import {
  placementKey,
  RequestContentButton,
  requestStatusLabel,
  useOpenContentRequests,
} from "../ContentRequests";
import { useExpansion } from "./expansion-context";
import { isOverviewGroup } from "./overview-token";
import { TreeRow } from "./TreeRow";
import { type TreeMode, type TreeNode, useReviewTree } from "./tree-model";
import { refTokenOf } from "./view-token";
import { useWorkspaceTabs } from "./workspace-tabs-context";

type LeafStatus = { frontmatterStatus?: string; reviewState: ReviewState };

const TREE_MODE_KEY = "docs.review.treeMode";
const HAS_NAV = Object.keys(projectNav).length > 0;

function loadTreeMode(): TreeMode {
  try {
    return window.localStorage.getItem(TREE_MODE_KEY) === "nav" ? "nav" : "files";
  } catch {
    return "files";
  }
}

function TreeModeToggle({ mode, onChange }: { mode: TreeMode; onChange: (m: TreeMode) => void }) {
  const options: { value: TreeMode; label: string; title: string }[] = [
    { value: "files", label: "Files", title: "Group docs by Diátaxis folder" },
    { value: "nav", label: "Site nav", title: "Order docs as the emitted site's nav.yml" },
  ];
  return (
    <span className="ml-auto flex rounded border border-border normal-case tracking-normal">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={mode === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-1.5 py-0.5 text-[0.68rem]",
            mode === o.value ? "bg-accent text-foreground" : "hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

function BranchIcon({ node }: { node: Extract<TreeNode, { kind: "branch" }> }) {
  const className = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  if (node.role === "axis" && node.axis) {
    return <DiataxisIcon axis={node.axis} className={className} />;
  }
  if (node.role === "section") {
    return <ListTree className={className} aria-hidden="true" />;
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
    if (n.kind === "planned") return;
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
  // Titled span so the status shows as a native hover tooltip: lucide icons
  // don't render a `title` prop as an SVG <title> child. aria-label on the icon
  // supplies the accessible name.
  return (
    <span title={label} className="inline-flex">
      <FileText
        className={cn("h-3.5 w-3.5 shrink-0", effectiveStatusIconClass(effective))}
        aria-label={label}
      />
    </span>
  );
}

/** Number of requested-from-viewer leaves in this subtree. */
function requestedInSubtree(node: TreeNode, requestedRefs: Set<string>): number {
  if (node.kind === "leaf") {
    return requestedRefs.has(refKey(node.ref)) ? 1 : 0;
  }
  if (node.kind === "planned") return 0;
  return node.children.reduce(
    (total, child) => total + requestedInSubtree(child, requestedRefs),
    0,
  );
}

function RequestedReviewIndicator({ count = 1 }: { count?: number }) {
  const label = count === 1 ? "Review requested from you" : `${count} reviews requested from you`;
  return (
    <span title={label} className="inline-flex">
      <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label={label} />
    </span>
  );
}

function nodeKey(node: TreeNode): string {
  if (node.kind === "leaf") return refToParam(node.ref);
  return node.kind === "planned" ? `planned:${node.id}` : node.id;
}

/** Siblings paired with unique keys: nav.yml may list a page twice in one section. */
function keyed(nodes: TreeNode[]): [string, TreeNode][] {
  const seen = new Map<string, number>();
  return nodes.map((node) => {
    const base = nodeKey(node);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return [n === 0 ? base : `${base}#${n}`, node];
  });
}

function Node({
  node,
  depth,
  reviewByRef,
  requestedRefs,
  requestsByPlacement,
}: {
  node: TreeNode;
  depth: number;
  reviewByRef: Map<string, ReviewState>;
  requestedRefs: Set<string>;
  requestsByPlacement: Map<string, ContentRequest[]>;
}) {
  const { isOpen, toggle } = useExpansion();
  const { openTab, activeToken } = useWorkspaceTabs();
  const { isAllowlisted } = useAuth();

  if (node.kind === "planned") {
    return (
      <TreeRow
        depth={depth}
        icon={<CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        label={`${node.id} · ${node.title}`}
        muted
      />
    );
  }

  if (node.kind === "leaf") {
    const token = refToParam(node.ref);
    const reviewState = reviewByRef.get(refKey(node.ref)) ?? ReviewState.NONE;
    return (
      <TreeRow
        depth={depth}
        icon={<LeafIcon status={{ frontmatterStatus: node.frontmatterStatus, reviewState }} />}
        label={node.label}
        trailing={requestedRefs.has(refKey(node.ref)) ? <RequestedReviewIndicator /> : undefined}
        // The active tab may be any of this item's views (rendered/md/script);
        // compare on the group key so the row stays highlighted across them.
        selected={activeToken !== null && refTokenOf(activeToken) === token}
        onSelect={() => openTab(node.ref)}
      />
    );
  }

  const open = isOpen(node.id);
  const requests = node.request ? (requestsByPlacement.get(placementKey(node.request)) ?? []) : [];
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
          requestedCount > 0 ? <RequestedReviewIndicator count={requestedCount} /> : undefined
        }
        action={
          isAllowlisted && node.request ? <RequestContentButton target={node.request} /> : undefined
        }
        onToggle={() => toggle(node.id)}
      />
      {open &&
        keyed(node.children).map(([key, child]) => (
          <Node
            key={key}
            node={child}
            depth={depth + 1}
            reviewByRef={reviewByRef}
            requestedRefs={requestedRefs}
            requestsByPlacement={requestsByPlacement}
          />
        ))}
      {open &&
        requests.map((r) => (
          <TreeRow
            key={r.id}
            depth={depth + 1}
            icon={<MessageSquarePlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            label={`${requestStatusLabel(r.status)} · ${r.title}`}
            muted
          />
        ))}
    </>
  );
}

export default function ReviewTree() {
  const [mode, setMode] = useState<TreeMode>(loadTreeMode);
  const { tree, isLoading } = useReviewTree(mode);
  const { isAllowlisted } = useAuth();
  const { data } = useQuery(listDrafts, {});
  const { data: requestData } = useQuery(
    listReviewRequests,
    { mine: true, openOnly: true },
    { enabled: isAllowlisted },
  );
  const { openOverview, activeToken } = useWorkspaceTabs();
  const contentRequests = useOpenContentRequests();
  const requestsByPlacement = useMemo(() => {
    const map = new Map<string, ContentRequest[]>();
    for (const r of contentRequests) {
      const key = placementKey(r);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  }, [contentRequests]);

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

  const overviewSelected = activeToken !== null && isOverviewGroup(refTokenOf(activeToken));

  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2" aria-label="Review">
      {isAllowlisted && (
        <TreeRow
          depth={0}
          icon={<LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          label="Overview"
          selected={overviewSelected}
          onSelect={() => openOverview()}
        />
      )}
      <p className="mt-2 flex items-center gap-1.5 px-2 py-1 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
        <Files className="h-3.5 w-3.5 text-primary/80" aria-hidden="true" />
        Content
        {HAS_NAV && (
          <TreeModeToggle
            mode={mode}
            onChange={(next) => {
              setMode(next);
              try {
                window.localStorage.setItem(TREE_MODE_KEY, next);
              } catch {
                // storage may be unavailable (private mode etc.)
              }
            }}
          />
        )}
      </p>
      {isLoading ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
      ) : (
        keyed(tree).map(([key, node]) => (
          <Node
            key={key}
            node={node}
            depth={0}
            reviewByRef={reviewByRef}
            requestedRefs={requestedRefs}
            requestsByPlacement={requestsByPlacement}
          />
        ))
      )}
    </nav>
  );
}
