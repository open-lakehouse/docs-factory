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
  ContentArea,
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
    listRecentComments: async () => ({ comments: [] }),
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

test("listFeedback surfaces threads on the estate model at their declaration", async () => {
  const repo = mkdtempSync(join(tmpdir(), "rf-model-"));
  mkdirSync(join(repo, "architecture/model"), { recursive: true });
  writeFileSync(
    join(repo, "architecture/model/assets.likec4"),
    'model {\n  extend lakehouse {\n    table = asset "Table"\n  }\n}\n',
  );
  const modelRef = { area: ContentArea.MODEL, slug: "element/lakehouse.table" };
  const client = {
    listDrafts: async () => ({ drafts: [] }),
    listRecentComments: async () => ({ comments: [{ ref: modelRef }] }),
    listComments: async ({ ref }: { ref: ContentRef }) => ({
      threads:
        ref.slug === modelRef.slug
          ? [
              create(ThreadSchema, {
                root: create(CommentSchema, {
                  id: "m1",
                  bodyMd: "Tag this #public",
                  scope: CommentScope.DOCUMENT,
                }),
              }),
            ]
          : [],
      orphanedThreads: [],
    }),
  } as unknown as ReviewClient;

  const [t, ...rest] = await listFeedback(client, { repoRoot: repo, area: "model" });
  expect(rest).toEqual([]);
  expect(t.page).toBe("model/element/lakehouse.table");
  expect(t.model).toEqual({ kind: "element", id: "lakehouse.table" });
  expect(t.location).toMatchObject({ path: "architecture/model/assets.likec4", startLine: 3 });
  expect(await listFeedback(client, { repoRoot: repo, area: "docs" })).toEqual([]);
});
