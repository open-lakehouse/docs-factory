// Comment/thread mapping + assembly helpers used by the comment RPCs.
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  CommentSchema,
  ThreadSchema,
  ContentRefSchema,
  TextSelectorSchema,
  CodeSelectorSchema,
  type Comment,
  type Thread,
  type ContentRef,
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
  body_md: string;
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

function commentFromRow(row: CommentRow, ref: ContentRef): Comment {
  return create(CommentSchema, {
    id: row.id,
    ref,
    anchorSlug: row.anchor_slug,
    anchorFingerprint: row.anchor_fingerprint,
    parentId: row.parent_id ?? undefined,
    authorLogin: row.author_login,
    bodyMd: row.body_md,
    createdAt: timestampFromDate(row.created_at),
    editedAt: row.edited_at ? timestampFromDate(row.edited_at) : undefined,
    orphaned: row.orphaned,
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
): { threads: Thread[]; orphaned: Thread[] } {
  const protoRef = create(ContentRefSchema, {
    area: areaFromDb(ref.area),
    slug: ref.slug,
    project: ref.project ?? undefined,
    bucket: ref.bucket ?? undefined,
  });
  const resById = new Map(resolutions.map((r) => [r.thread_root_id, r]));

  // Children keyed by parent id, each list in created_at order (input is already
  // ordered by created_at asc, so push preserves it).
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

  const threads: Thread[] = [];
  const orphaned: Thread[] = [];
  for (const root of roots) {
    const res = resById.get(root.id);
    const thread = create(ThreadSchema, {
      root: commentFromRow(root, protoRef),
      replies: flattenReplies(root),
      resolved: res?.resolved ?? false,
      resolvedBy: res?.resolved_by ?? undefined,
      resolvedAt: res?.resolved_at ? timestampFromDate(res.resolved_at) : undefined,
    });
    (root.orphaned ? orphaned : threads).push(thread);
  }
  return { threads, orphaned };
}
