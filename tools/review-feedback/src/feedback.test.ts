import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "@bufbuild/protobuf";
import type { ReviewClient } from "./client.js";
import { agentState, listFeedback, matchesState } from "./feedback.js";
import {
  CommentSchema,
  CommentScope,
  type ContentRef,
  ThreadSchema,
} from "./gen/docs_factory/review/v1/messages_pb.js";

const comment = (id: string, viaAgent = false) => create(CommentSchema, { id, viaAgent });

describe("agentState", () => {
  test("a reviewer's thread with no agent reply is open", () => {
    expect(agentState(create(ThreadSchema, { root: comment("r") }))).toBe("open");
  });

  test("an agent reply as the newest comment hands the thread back to the reviewer", () => {
    const t = create(ThreadSchema, { root: comment("r"), replies: [comment("a", true)] });
    expect(agentState(t)).toBe("awaiting-reviewer");
  });

  test("a human reply after the agent's reopens it", () => {
    const t = create(ThreadSchema, {
      root: comment("r"),
      replies: [comment("a", true), comment("h")],
    });
    expect(agentState(t)).toBe("open");
  });

  test("resolution wins", () => {
    const t = create(ThreadSchema, {
      root: comment("r"),
      replies: [comment("a", true)],
      resolved: true,
    });
    expect(agentState(t)).toBe("resolved");
  });
});

test("matchesState filters", () => {
  expect(matchesState("open", "open")).toBe(true);
  expect(matchesState("awaiting-reviewer", "open")).toBe(false);
  expect(matchesState("awaiting-reviewer", "awaiting")).toBe(true);
  expect(matchesState("awaiting-reviewer", "unresolved")).toBe(true);
  expect(matchesState("resolved", "unresolved")).toBe(false);
  expect(matchesState("resolved", "all")).toBe(true);
});

test("listFeedback surfaces threads on a checkout's planned slots", async () => {
  const repo = mkdtempSync(join(tmpdir(), "rf-planned-"));
  mkdirSync(join(repo, "content/uc"), { recursive: true });
  writeFileSync(
    join(repo, "content/uc/nav.yml"),
    "nav:\n  - section: Use\n    items:\n      - planned: T06\n        title: Agent tool\n",
  );
  const client = {
    listDrafts: async () => ({ drafts: [] }),
    listComments: async ({ ref }: { ref: ContentRef }) => ({
      threads:
        ref.slug === "planned/uc/T06"
          ? [
              create(ThreadSchema, {
                root: create(CommentSchema, {
                  id: "c1",
                  bodyMd: "Use the minimal env",
                  scope: CommentScope.DOCUMENT,
                }),
              }),
            ]
          : [],
      orphanedThreads: [],
    }),
  } as unknown as ReviewClient;

  const [t, ...rest] = await listFeedback(client, { repoRoot: repo });
  expect(rest).toEqual([]);
  expect(t.planned).toEqual({ project: "uc", id: "T06" });
  expect(t.title).toBe("T06 · Agent tool");
  expect(t.location).toMatchObject({ path: "content/uc/nav.yml", startLine: 4 });
  expect(await listFeedback(client, { repoRoot: repo, area: "blogs" })).toEqual([]);
});
