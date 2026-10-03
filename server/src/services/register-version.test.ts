import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { create } from "@bufbuild/protobuf";
import { createClient, createRouterTransport } from "@connectrpc/connect";
import { viewer } from "../auth/provider.js";
import { db } from "../db.js";
import { ContentArea, Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import {
  type RegisterVersionRequest,
  RegisterVersionRequestSchema,
  ReviewService,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import { registerReviewService } from "./review.js";

// Never fall back to DATABASE_URL: these tests migrate and write a dedicated test database.
const testUrl = process.env.REVIEW_TEST_DATABASE_URL;
const client = createClient(
  ReviewService,
  createRouterTransport((router) =>
    registerReviewService(router, {
      async verify() {
        return viewer("registration-test", Role.REVIEWER, { userId: "registration-test" });
      },
    }),
  ),
);

describe.skipIf(!testUrl)("RegisterVersion (Postgres)", () => {
  let request: RegisterVersionRequest;
  let slug: string;
  let savedEnv: Record<string, string | undefined>;

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
  });

  beforeEach(() => {
    slug = `registration-test-${randomUUID()}`;
    request = create(RegisterVersionRequestSchema, {
      ref: { area: ContentArea.BLOGS, slug },
      contentHash: "body-v1",
      gitSha: "git-v1",
      title: "Registration test",
      frontmatterStatus: "draft",
      sections: [
        {
          anchorSlug: "overview",
          fingerprint: "overview",
          headingText: "Overview",
          level: 2,
          ordinal: 0,
          text: "Original section text",
        },
      ],
      snippets: [
        {
          path: "snippets/example.py",
          region: "example",
          startLine: 1,
          endLine: 2,
          fileHash: "source-v1",
        },
      ],
      sourceFiles: [
        { path: "snippets/example.py", text: "print('original')", fileHash: "source-v1" },
      ],
    });
  });

  afterEach(async () => {
    const sql = db();
    await sql`delete from comment where area = 'blogs' and slug = ${slug}`;
    await sql`delete from content_version where area = 'blogs' and slug = ${slug}`;
  });

  afterAll(async () => {
    await db().end();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function register() {
    const result = await client.registerVersion(request);
    assert(result.version);
    return { ...result, version: result.version };
  }

  async function addThread() {
    const { comment } = await client.createComment({
      ref: request.ref,
      anchorSlug: "overview",
      anchorFingerprint: "overview",
      bodyMd: "Keep this feedback",
    });
    assert(comment);
    await client.createComment({
      ref: request.ref,
      anchorSlug: "overview",
      anchorFingerprint: "overview",
      parentId: comment.id,
      bodyMd: "Keep this reply",
    });
    return comments();
  }

  async function comments() {
    const rows = await db()`
      select id, section_id, authored_version_id, parent_id, body_md, orphaned
      from comment where area = 'blogs' and slug = ${slug}
      order by id
    `;
    return Array.from(rows);
  }

  test("unchanged content with comments keeps the version and section identities", async () => {
    const first = await register();
    const before = await addThread();
    const sql = db();
    await expect(
      Promise.resolve(sql`delete from content_section where version_id = ${first.version.id}`),
    ).rejects.toMatchObject({ code: "23503", constraint_name: "comment_section_id_fkey" });

    request.gitSha = "git-v2";
    request.title = "Updated title";
    request.frontmatterStatus = "ready";
    request.sections[0].text = "Refreshed section text";
    request.sourceFiles[0].text = "print('refreshed')";
    const second = await register();

    expect(second.version.id).toBe(first.version.id);
    expect(second.version.gitSha).toBe("git-v2");
    expect(second.version.title).toBe("Updated title");
    expect(second.orphanedThreadCount).toBe(0);
    expect(await comments()).toEqual(before);
    const [section] = await sql`
      select id, plain_text from content_section where version_id = ${first.version.id}
    `;
    expect(section.id).toBe(before[0].section_id);
    expect(section.plain_text).toBe("Refreshed section text");
    const [source] = await sql`
      select text from content_source where version_id = ${first.version.id}
    `;
    expect(source.text).toBe("print('refreshed')");
  });

  test("a changed body creates a new version without losing comment provenance", async () => {
    const first = await register();
    const before = await addThread();
    request.contentHash = "body-v2";
    request.gitSha = "git-v2";
    const second = await register();

    expect(second.version.id).not.toBe(first.version.id);
    expect(await comments()).toEqual(before);
    const [{ n }] = await db()`
      select count(*)::int as n from content_section
      where version_id in (${first.version.id}, ${second.version.id})
    `;
    expect(n).toBe(2);
  });

  test("removed sections detach references and retain the thread and its replies", async () => {
    const first = await register();
    const before = await addThread();
    request.sections = [];
    const result = await register();

    expect(result.orphanedThreadCount).toBe(1);
    const after = await comments();
    expect(after).toEqual(
      before.map((c) => ({ ...c, section_id: null, orphaned: c.parent_id === null })),
    );
    const [{ n }] = await db()`
      select count(*)::int as n from content_section where version_id = ${first.version.id}
    `;
    expect(n).toBe(0);
  });

  test("a failed refresh rolls back metadata, sections, snippets, and sources", async () => {
    const first = await register();
    request.gitSha = "git-failed";
    request.title = "Failed refresh";
    request.sections[0].text = "Failed section text";
    request.snippets = [];
    request.sourceFiles.push(request.sourceFiles[0]);

    await expect(client.registerVersion(request)).rejects.toThrow();

    const sql = db();
    const [version] = await sql`
      select git_sha, title from content_version where id = ${first.version.id}
    `;
    expect(version).toEqual({ git_sha: "git-v1", title: "Registration test" });
    const [section] = await sql`
      select plain_text from content_section where version_id = ${first.version.id}
    `;
    expect(section.plain_text).toBe("Original section text");
    const [{ n }] = await sql`
      select count(*)::int as n from content_snippet where version_id = ${first.version.id}
    `;
    expect(n).toBe(1);
    const [source] = await sql`
      select text from content_source where version_id = ${first.version.id}
    `;
    expect(source.text).toBe("print('original')");
  });

  test("a failed first registration leaves no partial version", async () => {
    request.sourceFiles.push(request.sourceFiles[0]);
    await expect(client.registerVersion(request)).rejects.toThrow();
    const [{ n }] = await db()`
      select count(*)::int as n from content_version
      where area = 'blogs' and slug = ${slug}
    `;
    expect(n).toBe(0);
  });

  test("a failed section removal restores comment references", async () => {
    const first = await register();
    const before = await addThread();
    request.sections = [];
    request.sourceFiles.push(request.sourceFiles[0]);

    await expect(client.registerVersion(request)).rejects.toThrow();

    expect(await comments()).toEqual(before);
    const [section] = await db()`
      select id from content_section where version_id = ${first.version.id}
    `;
    expect(section.id).toBe(before[0].section_id);
  });
});
