import { describe, expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import type { FeedbackThread } from "./feedback.js";
import { formatThread } from "./format.js";
import { ContentRefSchema } from "./gen/docs_factory/review/v1/messages_pb.js";

function thread(suggestion: FeedbackThread["suggestion"]): FeedbackThread {
  return {
    id: "t1",
    ref: create(ContentRefSchema, { slug: "p" }),
    page: "blogs/p",
    title: "P",
    state: "open",
    orphaned: false,
    anchor: {
      scope: "section",
      heading: "intro",
      fingerprint: "intro",
      quote: "short-lived tokens",
    },
    comments: [{ id: "t1", author: "@alice", viaAgent: false, body: "" }],
    suggestion,
  };
}

describe("formatThread suggestion", () => {
  test("a rewrite shows the literal source and a diff", () => {
    const out = formatThread(
      thread({
        original: "short-lived tokens",
        replacement: "scoped credentials",
        state: "open",
        match: { startLine: 4, endLine: 4, source: "short-lived tokens" },
      }),
    );
    expect(out).toContain("suggestion (open): replace the anchored passage");
    expect(out).toContain("source match at line 4");
    expect(out).toContain("```diff\n- short-lived tokens\n+ scoped credentials\n```");
  });

  test("a deletion says delete and has no + side", () => {
    const out = formatThread(
      thread({ original: "short-lived tokens", replacement: "", state: "open" }),
    );
    expect(out).toContain("delete the anchored passage");
    expect(out).toContain("> _(suggestion only)_");
    expect(out).toContain("no literal source match");
    expect(out).toContain("```diff\n- short-lived tokens\n```");
  });
});

test("a page-level thread names the whole page as its anchor", () => {
  const t = thread(undefined);
  const out = formatThread({ ...t, anchor: { scope: "document", heading: "", fingerprint: "" } });
  expect(out).toContain("- anchor: the whole page");
});
