// Build the review workspace's left-nav tree from the build-time content. Docs
// come from `docNav` (project → bucket → page), or in "nav" mode from the
// project's curated nav.yml (`projectNav`) when it ships one; blogs from
// `blogsBySeries()` (series → post, plus standalone). Leaves the viewer may not open are pruned,
// along with any branch they leave empty. Each leaf carries the ContentRef the tab
// system opens, plus frontmatter authoring status for the tree adornment.
import { useMemo } from "react";
import { blogsBySeries, findDoc } from "../../../content";
import { docNav, projectNav } from "../../../doc-nav";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { type DiataxisKey, diataxisKeyOf } from "../../../graph";
import { useAuth } from "../../../lib/auth-context";
import { blogRef, docRef } from "../../../lib/content-ref";
import { useContentVisibility } from "../../../lib/content-visibility";
import { treeNodeId } from "./expansion-context";
import { navBranches } from "./nav-tree";

/** A selectable leaf: the page a tab opens. */
export interface TreeLeaf {
  kind: "leaf";
  label: string;
  ref: ContentRef;
  /** Git frontmatter authoring status (idea | draft | ready). */
  frontmatterStatus?: string;
}

/** An expandable branch with a stable id and children. */
export interface TreeBranch {
  kind: "branch";
  id: string;
  label: string;
  role: "project" | "axis" | "section" | "blog" | "series";
  /** Singular Diátaxis key when `role === "axis"`. */
  axis?: DiataxisKey;
  children: TreeNode[];
}

/** A nav.yml backlog slot with no page yet: shown, never opened. */
export interface TreePlanned {
  kind: "planned";
  id: string;
  title: string;
}

export type TreeNode = TreeBranch | TreeLeaf | TreePlanned;

/** "files" = Diátaxis folders; "nav" = the emitted site's curated order. */
export type TreeMode = "files" | "nav";

/** Drop leaves `keep` rejects, then any branch left with no children. */
function prune(
  nodes: TreeNode[],
  keep: (leaf: TreeLeaf) => boolean,
  keepPlanned: boolean,
): TreeNode[] {
  return nodes.flatMap((node): TreeNode[] => {
    if (node.kind === "leaf") return keep(node) ? [node] : [];
    if (node.kind === "planned") return keepPlanned ? [node] : [];
    const children = prune(node.children, keep, keepPlanned);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

function bucketBranches(group: (typeof docNav)[number]): TreeNode[] {
  return group.buckets.map((bucket) => ({
    kind: "branch",
    id: treeNodeId.bucket(group.project, bucket.bucket),
    label: bucket.label,
    role: "axis",
    // Folder names are plural (`tutorials`); icons key on singular Diátaxis.
    axis: diataxisKeyOf(bucket.bucket) ?? undefined,
    children: bucket.items.map((item) => {
      const page = findDoc(item.project, item.bucket, item.slug);
      return {
        kind: "leaf" as const,
        label: item.label,
        ref: docRef(item.project, item.bucket, item.slug),
        frontmatterStatus: page?.frontmatter.status,
      };
    }),
  }));
}

/**
 * The workspace tree, narrowed to what this viewer may open. `isLoading` mirrors
 * the visibility resolution so the tree can show a spinner rather than a flash.
 */
export function useReviewTree(mode: TreeMode): { tree: TreeNode[]; isLoading: boolean } {
  const { isVisible, isLoading } = useContentVisibility();
  // Backlog slots are reviewer-only; the emitted site drops them altogether.
  const { isAllowlisted } = useAuth();

  const tree = useMemo<TreeNode[]>(() => {
    const docBranches: TreeNode[] = docNav.map((group) => ({
      kind: "branch",
      id: treeNodeId.project(group.project),
      label: group.projectLabel,
      role: "project",
      children:
        mode === "nav" && projectNav[group.project]
          ? navBranches(
              group.project,
              projectNav[group.project],
              (bucket, slug) => findDoc(group.project, bucket, slug)?.frontmatter.status,
            )
          : bucketBranches(group),
    }));

    const { series, standalone } = blogsBySeries();
    const blogChildren: TreeNode[] = [
      ...series.map((group) => ({
        kind: "branch" as const,
        id: treeNodeId.series(group.series),
        label: group.series,
        role: "series" as const,
        children: group.posts.map((post) => ({
          kind: "leaf" as const,
          label: post.frontmatter.title ?? post.slug,
          ref: blogRef(post.slug),
          frontmatterStatus: post.frontmatter.status,
        })),
      })),
      ...standalone.map((post) => ({
        kind: "leaf" as const,
        label: post.frontmatter.title ?? post.slug,
        ref: blogRef(post.slug),
        frontmatterStatus: post.frontmatter.status,
      })),
    ];

    const blogBranch: TreeBranch = {
      kind: "branch",
      id: treeNodeId.blogRoot(),
      label: "Blog",
      role: "blog",
      children: blogChildren,
    };

    return prune([...docBranches, blogBranch], (leaf) => isVisible(leaf.ref), isAllowlisted);
  }, [isVisible, isAllowlisted, mode]);

  return { tree, isLoading };
}
