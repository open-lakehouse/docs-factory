// ReviewService registration. Implemented so far:
//   - GetViewer       (Phase 0/2) — the resolved viewer (from the interceptor).
//   - RegisterVersion (Phase 1)   — build-time content version + section upsert.
//   - ListDrafts      (Phase 2)   — published to all; unpublished to allowlist.
//   - GetDraftContent (Phase 2)   — allowlist-gated draft access.
//   - ManageAllowlist (Phase 2)   — maintainer-only reviewer management.
// Omitted RPCs auto-respond `unimplemented`.
//
// Auth: an interceptor resolves the viewer once per request; RPCs read it via
// getViewer(ctx) and enforce with requireAllowlisted / requireMaintainer.
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb.js";
import {
  GetViewerResponseSchema,
  ListDraftsResponseSchema,
  GetDraftContentResponseSchema,
  ListCommentsResponseSchema,
  CreateCommentResponseSchema,
  ResolveThreadResponseSchema,
  UnresolveThreadResponseSchema,
  GetSourceFileResponseSchema,
  TransitionReviewResponseSchema,
  ReleaseContentResponseSchema,
  ManageAllowlistRequest_Action,
  ManageAllowlistResponseSchema,
  RegisterVersionResponseSchema,
  type ListDraftsRequest,
  type GetDraftContentRequest,
  type ListCommentsRequest,
  type CreateCommentRequest,
  type ResolveThreadRequest,
  type UnresolveThreadRequest,
  type GetSourceFileRequest,
  type TransitionReviewRequest,
  type ReleaseContentRequest,
  type ManageAllowlistRequest,
  type RegisterVersionRequest,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import {
  AllowlistEntrySchema,
  DraftSummarySchema,
  ContentRefSchema,
  ThreadSchema,
  SnippetRefSchema,
  ReviewState,
} from "../gen/docs_factory/review/v1/messages_pb.js";
import type { AuthProvider } from "../auth/provider.js";
import {
  authInterceptor,
  getViewer,
  requireAllowlisted,
  requireMaintainer,
} from "../auth/context.js";
import { db } from "../db.js";
import {
  areaToDb,
  areaFromDb,
  contentVersionFromRow,
  type ContentVersionRow,
} from "../db-map.js";
import { roleFromDb } from "../allowlist.js";
import { reanchorThreads, reanchorCodeThreads } from "../anchor.js";
import { assembleThreads, type CommentRow, type ResolutionRow } from "../comments.js";

const PUBLISHED = "published";
const REVIEW_STATE_BY_DB: Record<string, ReviewState> = {
  none: ReviewState.NONE,
  "in-review": ReviewState.IN_REVIEW,
  "changes-requested": ReviewState.CHANGES_REQUESTED,
  approved: ReviewState.APPROVED,
  released: ReviewState.RELEASED,
};
const DB_BY_REVIEW_STATE: Record<number, string> = {
  [ReviewState.NONE]: "none",
  [ReviewState.IN_REVIEW]: "in-review",
  [ReviewState.CHANGES_REQUESTED]: "changes-requested",
  [ReviewState.APPROVED]: "approved",
  [ReviewState.RELEASED]: "released",
};
// Allowed transitions. RELEASED is terminal and maintainer-only (enforced below).
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  none: ["in-review"],
  "in-review": ["changes-requested", "approved"],
  "changes-requested": ["in-review"],
  approved: ["released", "in-review"],
  released: [],
};

export function registerReviewService(router: ConnectRouter, auth: AuthProvider): void {
  router.service(
    ReviewService,
    {
      async getViewer(_req, ctx) {
        return create(GetViewerResponseSchema, { viewer: getViewer(ctx) });
      },

      async listDrafts(req: ListDraftsRequest, ctx) {
        const viewer = getViewer(ctx);
        const sql = db();
        const areaFilter =
          req.area !== undefined && req.area !== 0 ? areaToDb(req.area) : null;

        // Every (area, slug) with either a registered version OR standalone
        // review activity (a review_state or a comment). Transitions and
        // comments persist independent of version registration, so a draft can
        // have a review state before RegisterVersion ever ran; keying off
        // content_version alone would hide it and strand the state at NONE.
        // Metadata (title/project/bucket/frontmatter) comes from the latest
        // version when registered, else null. Unregistered rows have a null
        // frontmatter_status and so are visible only to allowlisted viewers —
        // which is fine, since only they can produce review activity.
        const rows = await sql<
          {
            area: string;
            slug: string;
            project: string | null;
            bucket: string | null;
            title: string | null;
            frontmatter_status: string | null;
            review_state: string | null;
            open_comments: number;
          }[]
        >`
          with latest as (
            select distinct on (area, slug) *
            from content_version
            order by area, slug, created_at desc
          ),
          keys as (
            select area, slug from content_version
            union
            select area, slug from review_state
            union
            select area, slug from comment
          )
          select k.area, k.slug, l.project, l.bucket, l.title, l.frontmatter_status,
            (select rs.state from review_state rs
              where rs.area = k.area and rs.slug = k.slug
              order by rs.created_at desc limit 1) as review_state,
            (select count(*)::int from comment c
              left join comment_resolution cr on cr.thread_root_id = c.id
              where c.area = k.area and c.slug = k.slug
                and c.parent_id is null and c.orphaned = false
                and coalesce(cr.resolved, false) = false) as open_comments
          from keys k
          left join latest l on l.area = k.area and l.slug = k.slug
          where (${areaFilter}::text is null or k.area = ${areaFilter})
            and (${viewer.isAllowlisted} or l.frontmatter_status = ${PUBLISHED})
          order by k.area, l.project nulls first, l.bucket nulls first, k.slug
        `;

        const drafts = rows.map((r) =>
          create(DraftSummarySchema, {
            ref: create(ContentRefSchema, {
              area: areaFromDb(r.area),
              slug: r.slug,
              project: r.project ?? undefined,
              bucket: r.bucket ?? undefined,
            }),
            title: r.title ?? r.slug,
            frontmatterStatus: r.frontmatter_status ?? "",
            reviewState: REVIEW_STATE_BY_DB[r.review_state ?? "none"] ?? ReviewState.NONE,
            openCommentCount: r.open_comments,
          }),
        );
        return create(ListDraftsResponseSchema, { drafts });
      },

      async getDraftContent(req: GetDraftContentRequest, ctx) {
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const [row] = await sql<ContentVersionRow[]>`
          select * from content_version
          where area = ${area} and slug = ${req.ref.slug}
          order by created_at desc limit 1
        `;
        if (!row) throw new ConnectError("content not found", Code.NotFound);

        // Published content is public; unpublished requires allowlist.
        if (row.frontmatter_status !== PUBLISHED) requireAllowlisted(ctx);

        // The rendered HTML lives in the SPA bundle; this RPC authorizes access
        // and returns the version. Body delivery is wired when the bundle is
        // split into public/gated (plan Option A); until then the client gates
        // the route on this call succeeding.
        return create(GetDraftContentResponseSchema, {
          html: "",
          version: contentVersionFromRow(row, req.ref),
        });
      },

      async listComments(req: ListCommentsRequest, ctx) {
        // Comments are a reviewer artifact: allowlist-only, for all content.
        requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const rows = await sql<CommentRow[]>`
          select id, area, slug, anchor_slug, anchor_fingerprint, parent_id,
                 author_login, body_md, created_at, edited_at, orphaned,
                 selector_quote, selector_prefix, selector_suffix, selector_start,
                 code_path, code_region, code_line, code_end_line, code_line_hash, code_file_hash
          from comment
          where area = ${area} and slug = ${req.ref.slug}
          order by created_at asc
        `;
        const rootIds = rows.filter((r) => r.parent_id == null).map((r) => r.id);
        const resolutions = rootIds.length
          ? await sql<ResolutionRow[]>`
              select thread_root_id, resolved, resolved_by, resolved_at
              from comment_resolution where thread_root_id in ${sql(rootIds)}
            `
          : [];
        const { threads, orphaned } = assembleThreads(
          { area, slug: req.ref.slug, project: req.ref.project, bucket: req.ref.bucket },
          rows,
          resolutions,
        );
        return create(ListCommentsResponseSchema, { threads, orphanedThreads: orphaned });
      },

      async createComment(req: CreateCommentRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        if (!req.bodyMd.trim()) {
          throw new ConnectError("body_md is required", Code.InvalidArgument);
        }
        const sql = db();
        const area = areaToDb(req.ref.area);

        // Resolve section_id from the latest version's section with this anchor
        // (nullable — a comment can be posted even if the anchor is unknown).
        const [section] = await sql<{ id: string }[]>`
          select cs.id from content_section cs
          join content_version cv on cv.id = cs.version_id
          where cv.area = ${area} and cv.slug = ${req.ref.slug}
            and cs.anchor_slug = ${req.anchorSlug}
          order by cv.created_at desc limit 1
        `;

        // A comment carries at most one fine-grained selector. Prose ranges pin
        // within a section; code selectors pin to snippet source. Both null =
        // a heading-level comment (the original behavior).
        const sel = req.selector;
        const code = req.codeSelector;

        const [row] = await sql<CommentRow[]>`
          insert into comment
            (area, slug, section_id, anchor_slug, anchor_fingerprint, parent_id,
             author_user_id, author_login, body_md, orphaned,
             selector_quote, selector_prefix, selector_suffix, selector_start,
             code_path, code_region, code_line, code_end_line, code_line_hash, code_file_hash)
          values
            (${area}, ${req.ref.slug}, ${section?.id ?? null}, ${req.anchorSlug},
             ${req.anchorFingerprint}, ${req.parentId ?? null},
             ${viewer.login ?? "unknown"}, ${viewer.login ?? "unknown"}, ${req.bodyMd}, false,
             ${sel?.quote ?? null}, ${sel?.prefix ?? null}, ${sel?.suffix ?? null},
             ${sel ? sel.start : null},
             ${code?.path ?? null}, ${code?.region ?? null}, ${code ? code.line : null},
             ${code ? code.endLine : null}, ${code?.lineHash ?? null}, ${code?.fileHash ?? null})
          returning id, area, slug, anchor_slug, anchor_fingerprint, parent_id,
                    author_login, body_md, created_at, edited_at, orphaned,
                    selector_quote, selector_prefix, selector_suffix, selector_start,
                    code_path, code_region, code_line, code_end_line, code_line_hash, code_file_hash
        `;
        const { threads } = assembleThreads(
          { area, slug: req.ref.slug, project: req.ref.project, bucket: req.ref.bucket },
          [row],
          [],
        );
        return create(CreateCommentResponseSchema, {
          comment: threads[0]?.root ?? undefined,
        });
      },

      async resolveThread(req: ResolveThreadRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        return create(ResolveThreadResponseSchema, {
          thread: await setResolved(req.threadRootId, true, viewer.login ?? "unknown"),
        });
      },

      async unresolveThread(req: UnresolveThreadRequest, ctx) {
        requireAllowlisted(ctx);
        return create(UnresolveThreadResponseSchema, {
          thread: await setResolved(req.threadRootId, false, null),
        });
      },

      async getSourceFile(req: GetSourceFileRequest, ctx) {
        // Full snippet source is a reviewer artifact: allowlist-only.
        requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        if (!req.path) throw new ConnectError("path is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);

        // The source text + snippet regions of the latest registered version.
        const [ver] = await sql<{ id: string }[]>`
          select id from content_version
          where area = ${area} and slug = ${req.ref.slug}
          order by created_at desc limit 1
        `;
        if (!ver) throw new ConnectError("content not found", Code.NotFound);

        const [src] = await sql<{ text: string; file_hash: string }[]>`
          select text, file_hash from content_source
          where version_id = ${ver.id} and path = ${req.path}
        `;
        if (!src) throw new ConnectError("source file not found", Code.NotFound);

        const snippetRows = await sql<
          { path: string; region: string; start_line: number; end_line: number; file_hash: string }[]
        >`
          select path, region, start_line, end_line, file_hash
          from content_snippet
          where version_id = ${ver.id} and path = ${req.path}
          order by start_line asc
        `;

        return create(GetSourceFileResponseSchema, {
          path: req.path,
          text: src.text,
          fileHash: src.file_hash,
          snippets: snippetRows.map((s) =>
            create(SnippetRefSchema, {
              path: s.path,
              region: s.region,
              startLine: s.start_line,
              endLine: s.end_line,
              fileHash: s.file_hash,
            }),
          ),
        });
      },

      async transitionReview(req: TransitionReviewRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        const state = await transition(req.ref, req.toState, req.note, ctx, viewer.login);
        return create(TransitionReviewResponseSchema, { state });
      },

      async releaseContent(req: ReleaseContentRequest, ctx) {
        // Release is maintainer-only and terminal.
        const viewer = requireMaintainer(ctx);
        const state = await transition(req.ref, ReviewState.RELEASED, req.note, ctx, viewer.login);
        return create(ReleaseContentResponseSchema, { state });
      },

      async manageAllowlist(req: ManageAllowlistRequest, ctx) {
        requireMaintainer(ctx);
        const actor = getViewer(ctx).login ?? "unknown";
        const sql = db();
        if (!req.entry) throw new ConnectError("entry is required", Code.InvalidArgument);
        const { githubLogin, email } = req.entry;
        if (!githubLogin && !email) {
          throw new ConnectError("entry needs a github_login or email", Code.InvalidArgument);
        }

        if (req.action === ManageAllowlistRequest_Action.ADD) {
          const role = req.entry.role === 3 ? "maintainer" : "reviewer";
          await sql`
            insert into reviewer_allowlist (github_login, email, role, added_by)
            values (${githubLogin ?? null}, ${email ?? null}, ${role}, ${actor})
            on conflict (lower(github_login)) do update set role = excluded.role
          `;
        } else if (req.action === ManageAllowlistRequest_Action.REMOVE) {
          await sql`
            delete from reviewer_allowlist
            where (${githubLogin ?? null}::text is not null and lower(github_login) = lower(${githubLogin ?? null}))
               or (${email ?? null}::text is not null and lower(email) = lower(${email ?? null}))
          `;
        } else {
          throw new ConnectError("unknown allowlist action", Code.InvalidArgument);
        }

        const entries = await sql<{ github_login: string | null; email: string | null; role: string }[]>`
          select github_login, email, role from reviewer_allowlist order by created_at
        `;
        return create(ManageAllowlistResponseSchema, {
          entries: entries.map((e) =>
            create(AllowlistEntrySchema, {
              githubLogin: e.github_login ?? undefined,
              email: e.email ?? undefined,
              role: roleFromDb(e.role),
            }),
          ),
        });
      },

      async registerVersion(req: RegisterVersionRequest) {
        assertBuildSecret(req.buildSecret);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const area = areaToDb(req.ref.area);
        const { slug, project, bucket } = req.ref;
        const sql = db();

        const [row] = await sql<ContentVersionRow[]>`
          insert into content_version
            (area, slug, project, bucket, content_hash, git_sha, title, frontmatter_status)
          values
            (${area}, ${slug}, ${project ?? null}, ${bucket ?? null},
             ${req.contentHash}, ${req.gitSha}, ${req.title}, ${req.frontmatterStatus})
          on conflict (area, slug, content_hash) do update
            set git_sha = excluded.git_sha,
                title = excluded.title,
                frontmatter_status = excluded.frontmatter_status
          returning *
        `;

        await sql`delete from content_section where version_id = ${row.id}`;
        if (req.sections.length > 0) {
          await sql`
            insert into content_section
              ${sql(
                req.sections.map((s) => ({
                  version_id: row.id,
                  anchor_slug: s.anchorSlug,
                  fingerprint: s.fingerprint,
                  heading_text: s.headingText,
                  heading_level: s.level,
                  ordinal: s.ordinal,
                  plain_text: s.text,
                  char_len: s.charLen,
                })),
              )}
          `;
        }

        // Replace the version's resolved snippet refs + source files (used to
        // re-anchor code comments and to back the full-source review pane).
        await sql`delete from content_snippet where version_id = ${row.id}`;
        if (req.snippets.length > 0) {
          await sql`
            insert into content_snippet
              ${sql(
                req.snippets.map((s) => ({
                  version_id: row.id,
                  path: s.path,
                  region: s.region,
                  start_line: s.startLine,
                  end_line: s.endLine,
                  file_hash: s.fileHash,
                })),
              )}
          `;
        }
        await sql`delete from content_source where version_id = ${row.id}`;
        if (req.sourceFiles.length > 0) {
          await sql`
            insert into content_source
              ${sql(
                req.sourceFiles.map((f) => ({
                  version_id: row.id,
                  path: f.path,
                  text: f.text,
                  file_hash: f.fileHash,
                })),
              )}
          `;
        }

        // Re-anchor open threads against the new version. Prose threads match by
        // quote/fingerprint against the section set; code threads match by
        // region/line-hash against the snippet set. Both retain unmatched
        // threads as orphaned (never deleted).
        const orphanedProse = await reanchorThreads(
          sql,
          area,
          slug,
          req.sections.map((s) => ({
            anchorSlug: s.anchorSlug,
            fingerprint: s.fingerprint,
            text: s.text,
          })),
        );
        const orphanedCode = await reanchorCodeThreads(
          sql,
          area,
          slug,
          req.snippets.map((s) => ({
            path: s.path,
            region: s.region,
            startLine: s.startLine,
            endLine: s.endLine,
            fileHash: s.fileHash,
          })),
          req.sourceFiles.map((f) => ({ path: f.path, text: f.text, fileHash: f.fileHash })),
        );

        return create(RegisterVersionResponseSchema, {
          version: contentVersionFromRow(row, req.ref),
          orphanedThreadCount: orphanedProse + orphanedCode,
        });
      },
    },
    { interceptors: [authInterceptor(auth)] },
  );
}

/** Set a thread's resolution and return the reassembled Thread. */
async function setResolved(threadRootId: string, resolved: boolean, by: string | null) {
  const sql = db();
  const [root] = await sql<CommentRow[]>`
    select id, area, slug, anchor_slug, anchor_fingerprint, parent_id,
           author_login, body_md, created_at, edited_at, orphaned,
           selector_quote, selector_prefix, selector_suffix, selector_start,
           code_path, code_region, code_line, code_end_line, code_line_hash, code_file_hash
    from comment where id = ${threadRootId} and parent_id is null
  `;
  if (!root) throw new ConnectError("thread not found", Code.NotFound);
  await sql`
    insert into comment_resolution (thread_root_id, resolved, resolved_by, resolved_at)
    values (${threadRootId}, ${resolved}, ${by}, ${resolved ? sql`now()` : null})
    on conflict (thread_root_id) do update
      set resolved = excluded.resolved,
          resolved_by = excluded.resolved_by,
          resolved_at = excluded.resolved_at
  `;
  const replies = await sql<CommentRow[]>`
    select id, area, slug, anchor_slug, anchor_fingerprint, parent_id,
           author_login, body_md, created_at, edited_at, orphaned,
           selector_quote, selector_prefix, selector_suffix, selector_start,
           code_path, code_region, code_line, code_end_line, code_line_hash, code_file_hash
    from comment where parent_id = ${threadRootId} order by created_at asc
  `;
  const resolutions = await sql<ResolutionRow[]>`
    select thread_root_id, resolved, resolved_by, resolved_at
    from comment_resolution where thread_root_id = ${threadRootId}
  `;
  const { threads, orphaned } = assembleThreads(
    { area: root.area, slug: root.slug },
    [root, ...replies],
    resolutions,
  );
  return [...threads, ...orphaned][0] ?? create(ThreadSchema, {});
}

/**
 * Validate + append a review-state transition. Returns the new state. Enforces
 * the state machine and that RELEASED is only reachable by a maintainer. The
 * caller has already done the allowlist/maintainer auth check for the entry
 * point; this re-checks RELEASED so no path can release without maintainer.
 */
async function transition(
  ref: { area: number; slug: string } | undefined,
  toState: ReviewState,
  note: string | undefined,
  ctx: Parameters<typeof getViewer>[0],
  actorLogin: string | undefined,
): Promise<ReviewState> {
  if (!ref) throw new ConnectError("ref is required", Code.InvalidArgument);
  const toDb = DB_BY_REVIEW_STATE[toState];
  if (!toDb || toDb === "none") {
    throw new ConnectError("invalid target review state", Code.InvalidArgument);
  }
  if (toDb === "released") requireMaintainer(ctx);

  const sql = db();
  const area = areaToDb(ref.area);
  const [current] = await sql<{ state: string }[]>`
    select state from review_state
    where area = ${area} and slug = ${ref.slug}
    order by created_at desc limit 1
  `;
  const from = current?.state ?? "none";
  if (from === toDb) return toState; // idempotent no-op
  if (!(ALLOWED_TRANSITIONS[from] ?? []).includes(toDb)) {
    throw new ConnectError(
      `illegal transition ${from} -> ${toDb}`,
      Code.FailedPrecondition,
    );
  }

  // Stamp against the latest version for provenance (nullable if unregistered).
  const [ver] = await sql<{ id: string }[]>`
    select id from content_version
    where area = ${area} and slug = ${ref.slug}
    order by created_at desc limit 1
  `;
  await sql`
    insert into review_state (area, slug, state, version_id, actor_user_id, note)
    values (${area}, ${ref.slug}, ${toDb}, ${ver?.id ?? null},
            ${actorLogin ?? "unknown"}, ${note ?? null})
  `;
  return toState;
}

/** Reject unless the request's build secret matches BUILD_SECRET (which must be set). */
function assertBuildSecret(provided: string): void {
  const expected = process.env.BUILD_SECRET;
  if (!expected) {
    throw new ConnectError("BUILD_SECRET is not configured on the server", Code.FailedPrecondition);
  }
  if (provided !== expected) {
    throw new ConnectError("invalid build secret", Code.PermissionDenied);
  }
}
