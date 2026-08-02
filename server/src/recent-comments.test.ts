// Unit tests for the recent-comments wire mapping. Run with `bun test`.
//
// recentCommentFromRow is pure — it maps a joined DB row into a RecentComment
// message. These cover the deep-link context (ref + anchor + heading), the
// title/heading fallbacks, and that the embedded Comment is populated.
import { describe, expect, test } from "bun:test";
import { type RecentCommentRow, recentCommentFromRow } from "./comments.js";
import { ContentArea } from "./gen/docs_factory/review/v1/messages_pb.js";

/** Minimal RecentCommentRow factory. */
function row(extra: Partial<RecentCommentRow> = {}): RecentCommentRow {
  return {
    id: "0193-comment",
    area: "docs",
    slug: "getting-started",
    project: "delta",
    bucket: "how-to",
    anchor_slug: "install",
    anchor_fingerprint: "install",
    parent_id: null,
    author_login: "alice",
    author_name: "Alice A",
    body_md: "a comment",
    authored_version_id: null,
    authored_git_sha: null,
    created_at: new Date("2026-02-01T00:00:00Z"),
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
    content_title: "Getting started",
    heading_text: "Install",
    resolved: false,
    ...extra,
  };
}

describe("recentCommentFromRow", () => {
  test("maps ref + anchor + heading so the client can deep-link back", () => {
    const rc = recentCommentFromRow(row());
    expect(rc.ref?.area).toBe(ContentArea.DOCS);
    expect(rc.ref?.slug).toBe("getting-started");
    expect(rc.ref?.project).toBe("delta");
    expect(rc.ref?.bucket).toBe("how-to");
    expect(rc.anchorSlug).toBe("install");
    expect(rc.headingText).toBe("Install");
    expect(rc.contentTitle).toBe("Getting started");
    // The embedded comment carries author + body for the feed row.
    expect(rc.comment?.authorLogin).toBe("alice");
    expect(rc.comment?.bodyMd).toBe("a comment");
    expect(rc.comment?.anchorSlug).toBe("install");
  });

  test("blogs have no project/bucket", () => {
    const rc = recentCommentFromRow(
      row({ area: "blogs", slug: "casper-launch", project: null, bucket: null }),
    );
    expect(rc.ref?.area).toBe(ContentArea.BLOGS);
    expect(rc.ref?.project).toBeUndefined();
    expect(rc.ref?.bucket).toBeUndefined();
  });

  test("falls back to empty strings when title/heading are absent", () => {
    // A comment on a since-removed heading (no latest-version section match) and
    // content with no registered version → null joins.
    const rc = recentCommentFromRow(row({ content_title: null, heading_text: null }));
    expect(rc.headingText).toBe("");
    expect(rc.contentTitle).toBe("");
  });

  test("carries the resolved flag through", () => {
    expect(recentCommentFromRow(row({ resolved: true })).resolved).toBe(true);
    expect(recentCommentFromRow(row({ resolved: false })).resolved).toBe(false);
  });
});
