// Comment/thread mapping + assembly helpers used by the comment RPCs.
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  CommentSchema,
  ThreadSchema,
  ContentRefSchema,
  RecentCommentSchema,
  TextSelectorSchema,
  CodeSelectorSchema,
  type Comment,
  type Thread,
  type ContentRef,
  type RecentComment,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { areaFromDb } from "./db-map.js";

/** A DB comment row (snake_case columns). */
export interface CommentRow {
  id: string; // uuid
  area: string;
  slug: string;
  project?: string | null;
  bucket?: string | null;
  anchor_slug: string;
  anchor_fingerprint: string;
  parent_id: string | null; // uuid
  author_login: string;
  author_name: string | null;
  body_md: string;
  // Frozen git provenance. authored_version_id is the content_version this
  // comment was written against; authored_git_sha is joined from that version.
  authored_version_id: string | null; // uuid
  authored_git_sha: string | null;
  created_at: Date;
  edited_at: Date | null;
  orphaned: boolean;
  // Prose text-quote selector (null unless the comment pins to a range).
  selector_quote: string | null;
  selector_prefix: string | null;
  selector_suffix: string | null;
  selector_start: number | null;
  // Code source selector (null unless the comment pins to snippet source).
  code_path: string | null;
  code_region: string | null;
  code_line: number | null;
  code_end_line: number | null;
  code_line_hash: string | null;
  code_file_hash: string | null;
}

export interface ResolutionRow {
  thread_root_id: string; // uuid
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: Date | null;
}

export function commentFromRow(row: CommentRow, ref: ContentRef): Comment {
  return create(CommentSchema, {
    id: row.id,
    ref,
    anchorSlug: row.anchor_slug,
    anchorFingerprint: row.anchor_fingerprint,
    parentId: row.parent_id ?? undefined,
    authorLogin: row.author_login,
    authorName: row.author_name ?? undefined,
    bodyMd: row.body_md,
    createdAt: timestampFromDate(row.created_at),
    editedAt: row.edited_at ? timestampFromDate(row.edited_at) : undefined,
    orphaned: row.orphaned,
    authoredVersionId: row.authored_version_id ?? undefined,
    authoredGitSha: row.authored_git_sha ?? undefined,
    // At most one fine-grained selector; prose takes precedence if both were
    // somehow set (they never are — create writes exactly one branch).
    selector:
      row.selector_quote != null
        ? create(TextSelectorSchema, {
            quote: row.selector_quote,
            prefix: row.selector_prefix ?? "",
            suffix: row.selector_suffix ?? "",
            start: row.selector_start ?? 0,
          })
        : undefined,
    codeSelector:
      row.code_path != null
        ? create(CodeSelectorSchema, {
            path: row.code_path,
            region: row.code_region ?? "",
            line: row.code_line ?? 0,
            endLine: row.code_end_line ?? row.code_line ?? 0,
            lineHash: row.code_line_hash ?? "",
            fileHash: row.code_file_hash ?? "",
          })
        : undefined,
  });
}

/**
 * A comment row for the recent-comments feed: a CommentRow plus the joined
 * context columns (latest-version title, the anchor's heading text, and whether
 * the owning thread is resolved).
 */
export interface RecentCommentRow extends CommentRow {
  content_title: string | null;
  heading_text: string | null;
  resolved: boolean;
}

/**
 * Map a recent-comment row into a RecentComment message. Pure — the SQL that
 * produces the row lives in the listRecentComments handler; this is the wire
 * mapping, kept here (and unit-tested) alongside commentFromRow.
 */
export function recentCommentFromRow(row: RecentCommentRow): RecentComment {
  const ref = create(ContentRefSchema, {
    area: areaFromDb(row.area),
    slug: row.slug,
    project: row.project ?? undefined,
    bucket: row.bucket ?? undefined,
  });
  return create(RecentCommentSchema, {
    comment: commentFromRow(row, ref),
    ref,
    anchorSlug: row.anchor_slug,
    headingText: row.heading_text ?? "",
    resolved: row.resolved,
    contentTitle: row.content_title ?? "",
  });
}

/**
 * Assemble threads from a flat comment list + resolutions for one content ref.
 * Roots (parent_id null) become Thread.root. Replies form an N-level tree via
 * parent_id; `Thread.replies` stays a flat list on the wire but is emitted in
 * depth-first pre-order (a parent immediately precedes its subtree, siblings in
 * created_at order), and every reply Comment carries its parent_id so the client
 * can reconstruct the nesting and indentation. Returns non-orphaned and orphaned
 * threads separately.
 */
export function assembleThreads(
  ref: { area: string; slug: string; project?: string | null; bucket?: string | null },
  comments: CommentRow[],
  resolutions: ResolutionRow[],
  // Per-thread-root read watermark for the current viewer. A thread is unread
  // when any of its comments was created after this timestamp; a root absent
  // from the map is fully unread. Omitted entirely for an anonymous viewer, in
  // which case no thread carries unread state.
  seenByRoot?: Map<string, Date>,
): { threads: Thread[]; orphaned: Thread[] } {
  const protoRef = create(ContentRefSchema, {
    area: areaFromDb(ref.area),
    slug: ref.slug,
    project: ref.project ?? undefined,
    bucket: ref.bucket ?? undefined,
  });
  const resById = new Map(resolutions.map((r) => [r.thread_root_id, r]));

  // Children keyed by parent id, each list in creation order. The caller orders
  // rows by id asc — UUIDv7 ids are time-ordered, so id order == creation order
  // but uses the primary-key index directly (no created_at sort), and it's a
  // strict total order even for rows sharing a transaction timestamp. So push
  // preserves the intended sibling order.
  const childrenByParent = new Map<string, CommentRow[]>();
  const roots: CommentRow[] = [];
  for (const c of comments) {
    if (c.parent_id == null) roots.push(c);
    else {
      const list = childrenByParent.get(c.parent_id);
      if (list) list.push(c);
      else childrenByParent.set(c.parent_id, [c]);
    }
  }

  // Depth-first pre-order flattening of a root's descendant subtree. Guards
  // against cycles (a comment can't be its own ancestor) with a visited set.
  const flattenReplies = (root: CommentRow): Comment[] => {
    const out: Comment[] = [];
    const visited = new Set<string>([root.id]);
    const walk = (parentId: string) => {
      for (const child of childrenByParent.get(parentId) ?? []) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        out.push(commentFromRow(child, protoRef));
        walk(child.id);
      }
    };
    walk(root.id);
    return out;
  };

  // Count comments in a root's subtree (incl. the root) created after `seen`.
  // A null watermark means the viewer never opened the thread → all unread.
  // Reuses the same cycle-safe DFS shape as flattenReplies.
  const unreadCount = (root: CommentRow, seen: Date | null): number => {
    let count = 0;
    const visited = new Set<string>();
    const consider = (c: CommentRow) => {
      if (visited.has(c.id)) return;
      visited.add(c.id);
      if (seen == null || c.created_at > seen) count += 1;
      for (const child of childrenByParent.get(c.id) ?? []) consider(child);
    };
    consider(root);
    return count;
  };

  const threads: Thread[] = [];
  const orphaned: Thread[] = [];
  for (const root of roots) {
    const res = resById.get(root.id);
    // seenByRoot present == an identified viewer we track read-state for. `has`
    // distinguishes "opened before" (watermark) from "never opened" (fully
    // unread) — a missing key is not the same as a zero timestamp.
    const unread = seenByRoot
      ? unreadCount(root, seenByRoot.has(root.id) ? (seenByRoot.get(root.id) ?? null) : null)
      : 0;
    const thread = create(ThreadSchema, {
      root: commentFromRow(root, protoRef),
      replies: flattenReplies(root),
      resolved: res?.resolved ?? false,
      resolvedBy: res?.resolved_by ?? undefined,
      resolvedAt: res?.resolved_at ? timestampFromDate(res.resolved_at) : undefined,
      hasUnread: unread > 0,
      unreadCount: unread,
    });
    (root.orphaned ? orphaned : threads).push(thread);
  }
  return { threads, orphaned };
}
