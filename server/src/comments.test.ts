// Unit tests for thread assembly. Run with `bun test`.
//
// assembleThreads is pure — it maps a flat comment list + resolutions into
// Thread messages. These cover N-level nesting: replies are emitted as a flat
// list in depth-first pre-order, each carrying its parent_id, and roots split
// into resolved/orphaned buckets.
import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { hashLine } from "./anchor.js";
import {
  assembleThreads,
  type CommentRow,
  commentFromRow,
  type ResolutionRow,
  suggestionError,
} from "./comments.js";
import {
  CodeSelectorSchema,
  ContentRefSchema,
  SuggestionSchema,
  SuggestionState,
  TextSelectorSchema,
} from "./gen/docs_factory/review/v1/messages_pb.js";

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
    const comments: CommentRow[] = [row("r", null), row("a", "r"), row("a1", "a"), row("b", "r")];
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

describe("suggestionError", () => {
  const selector = create(TextSelectorSchema, { quote: "short-lived tokens" });
  const suggestion = (original: string, replacement: string) =>
    create(SuggestionSchema, { original, replacement });

  test("accepts a rewrite or a deletion of the selected prose", () => {
    expect(
      suggestionError({
        selector,
        suggestion: suggestion("Short-lived  tokens", "scoped credentials"),
      }),
    ).toBeUndefined();
    expect(
      suggestionError({ selector, suggestion: suggestion("short-lived tokens", "") }),
    ).toBeUndefined();
  });

  test("rejects a suggestion that doesn't restate its anchor", () => {
    expect(suggestionError({ selector, suggestion: suggestion("other text", "x") })).toContain(
      "quote",
    );
    expect(suggestionError({ suggestion: suggestion("short-lived tokens", "x") })).toContain(
      "selector",
    );
    expect(
      suggestionError({
        parentId: "r",
        selector,
        suggestion: suggestion("short-lived tokens", "x"),
      }),
    ).toContain("thread");
    expect(
      suggestionError({
        selector,
        suggestion: suggestion("short-lived tokens", "short-lived tokens"),
      }),
    ).toContain("nothing");
  });

  test("checks a code suggestion against the hashed first line", () => {
    const codeSelector = create(CodeSelectorSchema, {
      path: "a.py",
      line: 3,
      endLine: 4,
      lineHash: hashLine("x = 1"),
    });
    expect(
      suggestionError({ codeSelector, suggestion: suggestion("  x = 1\ny = 2", "x = 2") }),
    ).toBeUndefined();
    expect(suggestionError({ codeSelector, suggestion: suggestion("z = 1", "x = 2") })).toContain(
      "source lines",
    );
  });
});

describe("commentFromRow suggestion", () => {
  const ref = create(ContentRefSchema, { slug: "post" });
  test("maps the suggestion columns, keeping an empty replacement", () => {
    const c = commentFromRow(
      row("r", null, {
        selector_quote: "q",
        suggestion_original: "Q",
        suggestion_replacement: "",
        suggestion_state: "applied",
        suggestion_state_by: "system",
        suggestion_state_at: new Date("2026-01-02T00:00:00Z"),
      }),
      ref,
    );
    expect(c.suggestion?.original).toBe("Q");
    expect(c.suggestion?.replacement).toBe("");
    expect(c.suggestion?.state).toBe(SuggestionState.APPLIED);
    expect(c.suggestion?.stateByLogin).toBe("system");
  });
  test("leaves suggestion unset for a plain comment", () => {
    expect(commentFromRow(row("r", null), ref).suggestion).toBeUndefined();
  });
});
