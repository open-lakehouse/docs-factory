// Build the review workspace's left-nav tree from the build-time content. Docs
// come from `docNav` (project → bucket → page); blogs from `blogsBySeries()`
// (series → post, plus standalone). Leaves the viewer may not open are pruned,
// along with any branch they leave empty. Each leaf carries the ContentRef the tab
// system opens, plus frontmatter authoring status for the tree adornment.
import { useMemo } from "react";
import { blogsBySeries, findDoc } from "../../../content";
import { docNav } from "../../../doc-nav";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { type DiataxisKey, diataxisKeyOf } from "../../../graph";
import { blogRef, docRef } from "../../../lib/content-ref";
import { useContentVisibility } from "../../../lib/content-visibility";
import { treeNodeId } from "./expansion-context";

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
  role: "project" | "axis" | "blog" | "series";
  /** Singular Diátaxis key when `role === "axis"`. */
  axis?: DiataxisKey;
  children: TreeNode[];
}

export type TreeNode = TreeBranch | TreeLeaf;

/** Drop leaves `keep` rejects, then any branch left with no children. */
function prune(nodes: TreeNode[], keep: (leaf: TreeLeaf) => boolean): TreeNode[] {
  return nodes.flatMap((node): TreeNode[] => {
    if (node.kind === "leaf") return keep(node) ? [node] : [];
    const children = prune(node.children, keep);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

/**
 * The workspace tree, narrowed to what this viewer may open. `isLoading` mirrors
 * the visibility resolution so the tree can show a spinner rather than a flash.
 */
export function useReviewTree(): { tree: TreeNode[]; isLoading: boolean } {
  const { isVisible, isLoading } = useContentVisibility();

  const tree = useMemo<TreeNode[]>(() => {
    const docBranches: TreeNode[] = docNav.map((group) => ({
      kind: "branch",
      id: treeNodeId.project(group.project),
      label: group.projectLabel,
      role: "project",
      children: group.buckets.map((bucket) => ({
        kind: "branch",
        id: treeNodeId.bucket(group.project, bucket.bucket),
        label: bucket.label,
        role: "axis" as const,
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
      })),
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

    return prune([...docBranches, blogBranch], (leaf) => isVisible(leaf.ref));
  }, [isVisible]);

  return { tree, isLoading };
}
