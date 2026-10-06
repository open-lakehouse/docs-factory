// The git-owned release flow end to end against Postgres (ADR-0002): derived
// RELEASED, private content without approvals, page-level threads, and content
// requests. Opt-in like register-version.test.ts: set REVIEW_TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createClient, createRouterTransport } from "@connectrpc/connect";
import { viewer } from "../auth/provider.js";
import { closeDb, db } from "../db.js";
import {
  CommentScope,
  ContentArea,
  ContentRequestStatus,
  Requirement,
  ReviewState,
  Role,
} from "../gen/docs_factory/review/v1/messages_pb.js";
import {
  RegisterVersionRequestSchema,
  ReviewService,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import { registerReviewService } from "./review.js";

const testUrl = process.env.REVIEW_TEST_DATABASE_URL;

const clientAs = (login: string, role: Role) =>
  createClient(
    ReviewService,
    createRouterTransport((router) =>
      registerReviewService(router, {
        async verify() {
          return viewer(login, role, { userId: login });
        },
      }),
    ),
  );
const reviewer = clientAs("flow-reviewer", Role.REVIEWER);
const maintainer = clientAs("flow-maintainer", Role.MAINTAINER);

async function code(p: Promise<unknown>): Promise<Code | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return ConnectError.from(e).code;
  }
}

describe.skipIf(!testUrl)("review flow (Postgres)", () => {
  let savedEnv: Record<string, string | undefined>;
  const slug = `flow-test-${randomUUID()}`;
  const ref = { area: ContentArea.BLOGS, slug };

  const register = (frontmatterStatus: string, contentHash = "body-v1", withSection = true) =>
    reviewer.registerVersion(
      create(RegisterVersionRequestSchema, {
        ref,
        contentHash,
        gitSha: contentHash,
        title: "Flow test",
        frontmatterStatus,
        sections: withSection
          ? [{ anchorSlug: "intro", fingerprint: "intro", headingText: "Intro", text: "Text" }]
          : [],
      }),
    );
  const state = async () =>
    (await reviewer.listDrafts({})).drafts.find((d) => d.ref?.slug === slug);

  beforeAll(async () => {
    if (!testUrl) throw new Error("REVIEW_TEST_DATABASE_URL is required");
    savedEnv = {};
    for (const key of [
      "DATABASE_URL",
      "NODE_ENV",
      "OIDC_ALLOWED_REPO",
      "OIDC_ALLOWED_ENVIRONMENTS",
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.DATABASE_URL = testUrl;
    process.env.NODE_ENV = "test";
    const dir = new URL("../../db/migrations/", import.meta.url);
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await db().begin(async (tx) => {
        await tx`set local client_min_messages = warning`;
        await tx.unsafe(readFileSync(new URL(file, dir), "utf8"));
      });
    }
    for (const login of ["flow-reviewer", "flow-maintainer"]) {
      await db()`
        insert into user_identity (user_id, github_login) values (${login}, ${login})
        on conflict do nothing`;
    }
  });

  afterAll(async () => {
    const sql = db();
    for (const t of ["comment", "content_event", "content_approval", "review_state"]) {
      await sql`delete from ${sql(t)} where area = 'blogs' and slug = ${slug}`;
    }
    await sql`delete from content_version where area = 'blogs' and slug = ${slug}`;
    await sql`delete from content_request where requested_by_user_id = 'flow-reviewer'`;
    await closeDb();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("private content is reviewable but has no approval axis", async () => {
    await register("private");
    expect(await code(reviewer.recordApproval({ ref }))).toBe(Code.FailedPrecondition);
    expect(await code(maintainer.transitionReview({ ref, toState: ReviewState.APPROVED }))).toBe(
      Code.FailedPrecondition,
    );
    await reviewer.requestReview({
      ref,
      reviewers: [{ userId: "flow-maintainer" }],
      requirement: Requirement.REQUIRED,
    });
    expect((await state())?.reviewState).toBe(ReviewState.NEEDS_REVIEW);
    await maintainer.markReviewed({ ref });
    expect((await state())?.reviewState).toBe(ReviewState.NONE);
  });

  test("an approved draft awaits ready; ready on main derives RELEASED", async () => {
    await register("draft", "body-v2");
    expect(await code(reviewer.markReviewed({ ref }))).toBe(Code.FailedPrecondition);
    await reviewer.recordApproval({ ref });
    expect((await state())?.reviewState).toBe(ReviewState.APPROVED);
    await register("ready", "body-v2");
    const released = await state();
    expect(released?.reviewState).toBe(ReviewState.RELEASED);
    expect(released?.readyWithoutApproval).toBe(false);
    await reviewer.dismissApproval({ ref });
    expect((await state())?.readyWithoutApproval).toBe(true);
  });

  test("a page-level thread survives its sections disappearing", async () => {
    const { comment } = await reviewer.createComment({
      ref,
      anchorSlug: "",
      anchorFingerprint: "",
      bodyMd: "The whole page needs a tighter intro.",
      scope: CommentScope.DOCUMENT,
    });
    expect(comment?.scope).toBe(CommentScope.DOCUMENT);
    const reply = await maintainer.createComment({
      ref,
      anchorSlug: "",
      anchorFingerprint: "",
      parentId: comment?.id,
      bodyMd: "Agreed.",
    });
    expect(reply.comment?.scope).toBe(CommentScope.DOCUMENT);
    expect(
      await code(
        reviewer.createComment({
          ref,
          anchorSlug: "intro",
          anchorFingerprint: "intro",
          bodyMd: "x",
          scope: CommentScope.DOCUMENT,
        }),
      ),
    ).toBe(Code.InvalidArgument);

    await register("ready", "body-v3", false);
    const { threads, orphanedThreads } = await reviewer.listComments({ ref });
    expect(threads.map((t) => t.root?.id)).toContain(comment?.id);
    expect(orphanedThreads.map((t) => t.root?.id)).not.toContain(comment?.id);
  });

  test("content requests: reviewers file, maintainers triage, done needs a slot", async () => {
    const { request } = await reviewer.createContentRequest({
      area: ContentArea.DOCS,
      project: "unitycatalog",
      placement: "Govern data",
      diataxis: "how-to",
      title: "Row filters",
    });
    const id = request?.id ?? "";
    expect(request?.status).toBe(ContentRequestStatus.OPEN);
    expect(
      await code(reviewer.updateContentRequest({ id, status: ContentRequestStatus.ACCEPTED })),
    ).toBe(Code.PermissionDenied);
    await maintainer.updateContentRequest({ id, status: ContentRequestStatus.ACCEPTED });
    expect(
      await code(reviewer.updateContentRequest({ id, status: ContentRequestStatus.DONE })),
    ).toBe(Code.FailedPrecondition);
    const done = await reviewer.updateContentRequest({
      id,
      status: ContentRequestStatus.DONE,
      plannedId: "H40",
      prUrl: "https://github.com/o/r/pull/1",
    });
    expect(done.request).toMatchObject({ status: ContentRequestStatus.DONE, plannedId: "H40" });
    const { requests } = await reviewer.listContentRequests({
      project: "unitycatalog",
      statuses: [ContentRequestStatus.DONE],
    });
    expect(requests.map((r) => r.id)).toContain(id);
  });
});
