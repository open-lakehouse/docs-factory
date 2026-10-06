import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { create } from "@bufbuild/protobuf";
import type { ReviewClient } from "./client.js";
import {
  ApprovalSchema,
  ContentArea,
  ContentRefSchema,
  DraftSummarySchema,
  ReviewState,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { checkReady, readyFlips, toPageStatus } from "./status.js";

const page = (status: string, title = "Create tables") =>
  `---\ntitle: ${title}\ndiataxis: how-to\nproject: unitycatalog\nstatus: ${status}\n---\n\nBody.\n`;
const blog = (status: string) =>
  `---\ntitle: Post\nslug: post\nstatus: ${status}\ntags: []\nauthor: A\ntarget: delta\n---\n\nBody.\n`;

const FLIPPED = "content/unitycatalog/how-to/002-create-tables/index.md";
const ALREADY = "content/unitycatalog/how-to/already/index.md";
const STILL_DRAFT = "content/unitycatalog/how-to/wip/index.md";
const BLOG = "blogs/post/index.md";
const NEW_READY = "content/unitycatalog/explanation/new/index.md";

let repo: string;
let base: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
function write(path: string, text: string) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}
const commit = (msg: string) => {
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-gpg-sign", "-m", msg);
};

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "review-feedback-status-"));
  git("init", "-q");
  write(FLIPPED, page("draft"));
  write(ALREADY, page("ready", "Already"));
  write(STILL_DRAFT, page("draft", "WIP"));
  write(BLOG, blog("draft"));
  commit("base");
  base = git("rev-parse", "HEAD");
  write(FLIPPED, page("ready"));
  write(ALREADY, page("ready", "Already, edited"));
  write(STILL_DRAFT, page("draft", "WIP, edited"));
  write(BLOG, blog("ready"));
  write(NEW_READY, page("ready", "New"));
  commit("flip");
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("readyFlips", () => {
  test("finds pages moved to ready, including new and blog pages", () => {
    const flips = readyFlips(repo, base).map((f) => f.path);
    expect(flips.sort()).toEqual([BLOG, NEW_READY, FLIPPED].sort());
  });

  test("maps a folder-mode page through its order prefix", () => {
    const flip = readyFlips(repo, base).find((f) => f.path === FLIPPED);
    expect(flip?.ref).toMatchObject({
      area: ContentArea.DOCS,
      project: "unitycatalog",
      bucket: "how-to",
      slug: "create-tables",
    });
  });
});

describe("checkReady", () => {
  const ref = create(ContentRefSchema, {
    area: ContentArea.DOCS,
    project: "unitycatalog",
    bucket: "how-to",
    slug: "create-tables",
  });
  const client = {
    listDrafts: async () => ({
      drafts: [
        create(DraftSummarySchema, {
          ref,
          title: "Create tables",
          reviewState: ReviewState.APPROVED,
          approvals: [create(ApprovalSchema, { approverLogin: "alice", approverUserId: "u1" })],
        }),
      ],
    }),
  } as unknown as ReviewClient;

  test("approved pages pass; unknown or unapproved pages warn", async () => {
    const checks = await checkReady(client, repo, base);
    const byPath = new Map(checks.map((c) => [c.path, c]));
    expect(byPath.get(FLIPPED)).toMatchObject({ approved: true, approvers: ["alice"] });
    expect(byPath.get(BLOG)?.approved).toBe(false);
    expect(byPath.get(NEW_READY)?.approved).toBe(false);
  });
});

test("toPageStatus tells an agent to set ready once approved", () => {
  const ref = create(ContentRefSchema, { area: ContentArea.BLOGS, slug: "post" });
  const d = create(DraftSummarySchema, {
    ref,
    title: "Post",
    frontmatterStatus: "draft",
    reviewState: ReviewState.APPROVED,
  });
  const s = toPageStatus({ ...d, ref });
  expect(s.state).toBe("approved");
  expect(s.next).toContain("set `status: ready`");
  const released = toPageStatus({
    ...create(DraftSummarySchema, {
      ref,
      reviewState: ReviewState.RELEASED,
      readyWithoutApproval: true,
    }),
    ref,
  });
  expect(released.next).toContain("released without an approval");
});
