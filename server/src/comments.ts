// Comment/thread mapping + assembly helpers used by the comment RPCs.
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  CommentSchema,
  ThreadSchema,
  ContentRefSchema,
  type Comment,
  type Thread,
  type ContentRef,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { areaFromDb } from "./db-map.js";

/** A DB comment row (snake_case columns). */
export interface CommentRow {
  id: number | string;
  area: string;
  slug: string;
  project?: string | null;
  bucket?: string | null;
  anchor_slug: string;
  anchor_fingerprint: string;
  parent_id: number | string | null;
  author_login: string;
  body_md: string;
  created_at: Date;
  edited_at: Date | null;
  orphaned: boolean;
}

export interface ResolutionRow {
  thread_root_id: number | string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: Date | null;
}

function commentFromRow(row: CommentRow, ref: ContentRef): Comment {
  return create(CommentSchema, {
    id: String(row.id),
    ref,
    anchorSlug: row.anchor_slug,
    anchorFingerprint: row.anchor_fingerprint,
    parentId: row.parent_id != null ? String(row.parent_id) : undefined,
    authorLogin: row.author_login,
    bodyMd: row.body_md,
    createdAt: timestampFromDate(row.created_at),
    editedAt: row.edited_at ? timestampFromDate(row.edited_at) : undefined,
    orphaned: row.orphaned,
  });
}

/**
 * Assemble threads from a flat comment list + resolutions for one content ref.
 * Roots (parent_id null) become Thread.root; replies attach to their root in
 * created_at order. Returns non-orphaned and orphaned threads separately.
 */
export function assembleThreads(
  ref: { area: string; slug: string; project?: string | null; bucket?: string | null },
  comments: CommentRow[],
  resolutions: ResolutionRow[],
): { threads: Thread[]; orphaned: Thread[] } {
  const protoRef = create(ContentRefSchema, {
    area: areaFromDb(ref.area),
    slug: ref.slug,
    project: ref.project ?? undefined,
    bucket: ref.bucket ?? undefined,
  });
  const resById = new Map(resolutions.map((r) => [String(r.thread_root_id), r]));
  const repliesByParent = new Map<string, CommentRow[]>();
  const roots: CommentRow[] = [];
  for (const c of comments) {
    if (c.parent_id == null) roots.push(c);
    else {
      const key = String(c.parent_id);
      (repliesByParent.get(key) ?? repliesByParent.set(key, []).get(key)!).push(c);
    }
  }

  const threads: Thread[] = [];
  const orphaned: Thread[] = [];
  for (const root of roots) {
    const res = resById.get(String(root.id));
    const thread = create(ThreadSchema, {
      root: commentFromRow(root, protoRef),
      replies: (repliesByParent.get(String(root.id)) ?? []).map((r) =>
        commentFromRow(r, protoRef),
      ),
      resolved: res?.resolved ?? false,
      resolvedBy: res?.resolved_by ?? undefined,
      resolvedAt: res?.resolved_at ? timestampFromDate(res.resolved_at) : undefined,
    });
    (root.orphaned ? orphaned : threads).push(thread);
  }
  return { threads, orphaned };
}
