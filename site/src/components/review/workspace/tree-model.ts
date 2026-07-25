// Build the review workspace's left-nav tree from the same build-time content
// the site already knows about — no RPC. Docs come from the viewer-aware doc nav
// (`useVisibleDocNav`, project → bucket → page); blogs from `blogsBySeries()`
// (series → post, plus standalone). Each leaf carries the ContentRef the tab
// system opens, plus frontmatter authoring status for the tree adornment.
import { useMemo } from "react";
import type { ContentRef } from "../../../gen/docs_factory/review/v1/messages_pb";
import { blogRef, docRef } from "../../../lib/content-ref";
import { blogsBySeries, findDoc } from "../../../content";
import { useVisibleDocNav } from "../../../sidebar";
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
  children: TreeNode[];
}

export type TreeNode = TreeBranch | TreeLeaf;

/**
 * The full workspace tree, viewer-narrowed (anonymous viewers can't reach the
 * workspace, but the doc nav is filtered anyway). `isLoading` mirrors the doc
 * visibility resolution so the tree can show a spinner rather than a flash.
 */
export function useReviewTree(): { tree: TreeNode[]; isLoading: boolean } {
  const { nav, isLoading } = useVisibleDocNav();

  const tree = useMemo<TreeNode[]>(() => {
    const docBranches: TreeNode[] = nav.map((group) => ({
      kind: "branch",
      id: treeNodeId.project(group.project),
      label: group.projectLabel,
      children: group.buckets.map((bucket) => ({
        kind: "branch",
        id: treeNodeId.bucket(group.project, bucket.bucket),
        label: bucket.label,
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
      children: blogChildren,
    };

    return [...docBranches, blogBranch];
  }, [nav]);

  return { tree, isLoading };
}
