// Unit tests for thread assembly. Run with `bun test`.
//
// assembleThreads is pure — it maps a flat comment list + resolutions into
// Thread messages. These cover N-level nesting: replies are emitted as a flat
// list in depth-first pre-order, each carrying its parent_id, and roots split
// into resolved/orphaned buckets.
import { expect, test, describe } from "bun:test";
import { assembleThreads, type CommentRow, type ResolutionRow } from "./comments.js";

/** Minimal CommentRow factory — only the fields assembleThreads reads. */
function row(id: string, parentId: string | null, extra: Partial<CommentRow> = {}): CommentRow {
  return {
    id,
    area: "blogs",
    slug: "post",
    anchor_slug: "intro",
    anchor_fingerprint: "intro",
    parent_id: parentId,
    author_login: "alice",
    author_name: null,
    body_md: `body ${id}`,
    authored_version_id: null,
    authored_git_sha: null,
    created_at: new Date(`2026-01-01T00:00:0${id.length}Z`),
    edited_at: null,
    orphaned: false,
    selector_quote: null,
    selector_prefix: null,
    selector_suffix: null,
    selector_start: null,
    code_path: null,
    code_region: null,
    code_line: null,
    code_end_line: null,
    code_line_hash: null,
    code_file_hash: null,
    ...extra,
  };
}

const ref = { area: "blogs", slug: "post" };

describe("assembleThreads nesting", () => {
  test("flattens an N-level tree in depth-first pre-order", () => {
    // r
    // ├─ a
    // │  └─ a1
    // └─ b
    const comments: CommentRow[] = [
      row("r", null),
      row("a", "r"),
      row("a1", "a"),
      row("b", "r"),
    ];
    const { threads, orphaned } = assembleThreads(ref, comments, []);
    expect(orphaned).toHaveLength(0);
    expect(threads).toHaveLength(1);
    const t = threads[0]!;
    expect(t.root?.id).toBe("r");
    // Pre-order: a, a1 (a's child), then b.
    expect(t.replies.map((c) => c.id)).toEqual(["a", "a1", "b"]);
    // Every reply carries its parent_id so the client can rebuild nesting.
    const byId = new Map(t.replies.map((c) => [c.id, c.parentId]));
    expect(byId.get("a")).toBe("r");
    expect(byId.get("a1")).toBe("a");
    expect(byId.get("b")).toBe("r");
  });

  test("separates orphaned roots and applies resolution to the root", () => {
    const comments: CommentRow[] = [
      row("r", null),
      row("child", "r"),
      row("orph", null, { orphaned: true }),
    ];
    const resolutions: ResolutionRow[] = [
      { thread_root_id: "r", resolved: true, resolved_by: "bob", resolved_at: new Date() },
    ];
    const { threads, orphaned } = assembleThreads(ref, comments, resolutions);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.resolved).toBe(true);
    expect(threads[0]!.replies.map((c) => c.id)).toEqual(["child"]);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]!.root?.id).toBe("orph");
  });

  test("tolerates a cycle without infinite recursion", () => {
    // Pathological input (should never happen given the DB tree): a<->b cycle.
    const comments: CommentRow[] = [
      row("r", null),
      row("a", "r"),
      row("b", "a"),
      { ...row("a", "b") }, // duplicate id with a back-edge parent
    ];
    const { threads } = assembleThreads(ref, comments, []);
    // Visited-set guard means we terminate; each id appears at most once.
    const ids = threads[0]!.replies.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("assembleThreads unread watermark", () => {
  const at = (iso: string) => new Date(iso);
  // A root + two replies at increasing times.
  const tree: CommentRow[] = [
    row("r", null, { created_at: at("2026-01-01T00:00:00Z") }),
    row("a", "r", { created_at: at("2026-01-02T00:00:00Z") }),
    row("a1", "a", { created_at: at("2026-01-03T00:00:00Z") }),
  ];

  test("no seenByRoot map → threads carry no unread state", () => {
    const { threads } = assembleThreads(ref, tree, []);
    expect(threads[0]!.hasUnread).toBe(false);
    expect(threads[0]!.unreadCount).toBe(0);
  });

  test("root absent from the map → whole thread is unread", () => {
    const { threads } = assembleThreads(ref, tree, [], new Map());
    expect(threads[0]!.hasUnread).toBe(true);
    expect(threads[0]!.unreadCount).toBe(3);
  });

  test("watermark counts only comments created after seen_at", () => {
    const seen = new Map([["r", at("2026-01-02T00:00:00Z")]]);
    const { threads } = assembleThreads(ref, tree, [], seen);
    // r (before) and a (equal, not strictly after) are read; only a1 is unread.
    expect(threads[0]!.unreadCount).toBe(1);
    expect(threads[0]!.hasUnread).toBe(true);
  });

  test("watermark at/after the newest comment → fully read", () => {
    const seen = new Map([["r", at("2026-01-03T00:00:00Z")]]);
    const { threads } = assembleThreads(ref, tree, [], seen);
    expect(threads[0]!.hasUnread).toBe(false);
    expect(threads[0]!.unreadCount).toBe(0);
  });
});
