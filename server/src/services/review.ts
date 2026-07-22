// ReviewService registration. Implemented so far:
//   - GetViewer       (Phase 0/2) — the resolved viewer (from the interceptor).
//   - RegisterVersion (Phase 1)   — build-time content version + section upsert.
//   - ListDrafts      (Phase 2)   — public (ready + released) to all; else allowlist.
//   - GetDraftContent (Phase 2)   — allowlist-gated draft access.
//   - ManageAllowlist (Phase 2)   — maintainer-only reviewer management.
// Omitted RPCs auto-respond `unimplemented`.
//
// Auth: an interceptor resolves the viewer once per request; RPCs read it via
// getViewer(ctx) and enforce with requireAllowlisted / requireMaintainer.
import { create } from "@bufbuild/protobuf";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb.js";
import {
  GetViewerResponseSchema,
  ListDraftsResponseSchema,
  GetDraftContentResponseSchema,
  ListCommentsResponseSchema,
  ListRecentCommentsResponseSchema,
  CreateCommentResponseSchema,
  ResolveThreadResponseSchema,
  UnresolveThreadResponseSchema,
  MarkThreadSeenResponseSchema,
  GetSourceFileResponseSchema,
  TransitionReviewResponseSchema,
  ReleaseContentResponseSchema,
  ManageAllowlistRequest_Action,
  ManageAllowlistResponseSchema,
  EraseUserResponseSchema,
  RegisterVersionResponseSchema,
  type ListDraftsRequest,
  type GetDraftContentRequest,
  type ListCommentsRequest,
  type ListRecentCommentsRequest,
  type CreateCommentRequest,
  type ResolveThreadRequest,
  type UnresolveThreadRequest,
  type MarkThreadSeenRequest,
  type GetSourceFileRequest,
  type TransitionReviewRequest,
  type ReleaseContentRequest,
  type ManageAllowlistRequest,
  type EraseUserRequest,
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
import { db, type Sql } from "../db.js";
import {
  areaToDb,
  areaFromDb,
  contentVersionFromRow,
  type ContentVersionRow,
} from "../db-map.js";
import { roleFromDb } from "../allowlist.js";
import { reanchorThreads, reanchorCodeThreads } from "../anchor.js";
import {
  assembleThreads,
  recentCommentFromRow,
  type CommentRow,
  type RecentCommentRow,
  type ResolutionRow,
} from "../comments.js";
import { notifyCommentsChanged } from "../notify.js";

// A page is shown to anonymous (non-allowlisted) viewers only when BOTH hold:
// its git authoring intent is `ready` (frontmatter_status) AND its DB review
// lifecycle has reached `released`. Publication is the intersection of author
// intent and review outcome — neither git nor the DB alone exposes content.
const READY_STATUS = "ready";
const RELEASED_STATE = "released";
// Maximum reply nesting under a thread root (root = depth 0). Keeps the tree
// legible and client indentation bounded; enforced in createComment.
const MAX_REPLY_DEPTH = 4;
// Tombstone login/id for an erased author (see eraseUser). Recent-comment feeds
// skip these — there's no identity to show and the body is "[removed]".
const TOMBSTONE_LOGIN = "deleted-user";
// The "latest comments" feed page size (default + hard cap).
const RECENT_COMMENTS_DEFAULT = 20;
const RECENT_COMMENTS_MAX = 100;
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
            and (
              ${viewer.isAllowlisted}
              or (
                l.frontmatter_status = ${READY_STATUS}
                and (
                  select rs.state from review_state rs
                  where rs.area = k.area and rs.slug = k.slug
                  order by rs.created_at desc limit 1
                ) = ${RELEASED_STATE}
              )
            )
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

        // Public content requires BOTH author intent (frontmatter `ready`) AND a
        // `released` DB review state; anything short of that is allowlist-gated.
        const [latestState] = await sql<{ state: string }[]>`
          select state from review_state
          where area = ${area} and slug = ${req.ref.slug}
          order by created_at desc limit 1
        `;
        const isPublic =
          row.frontmatter_status === READY_STATUS &&
          latestState?.state === RELEASED_STATE;
        if (!isPublic) requireAllowlisted(ctx);

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
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const viewerId = viewer.userId ?? viewer.login;
        const rows = await sql<CommentRow[]>`
          select c.id, c.area, c.slug, c.anchor_slug, c.anchor_fingerprint, c.parent_id,
                 c.author_login, c.author_name, c.body_md, c.created_at, c.edited_at, c.orphaned,
                 c.selector_quote, c.selector_prefix, c.selector_suffix, c.selector_start,
                 c.code_path, c.code_region, c.code_line, c.code_end_line,
                 c.code_line_hash, c.code_file_hash,
                 c.authored_version_id, cv.git_sha as authored_git_sha
          from comment c
          left join content_version cv on cv.id = c.authored_version_id
          where c.area = ${area} and c.slug = ${req.ref.slug}
          order by c.id asc
        `;
        const rootIds = rows.filter((r) => r.parent_id == null).map((r) => r.id);
        const resolutions = rootIds.length
          ? await sql<ResolutionRow[]>`
              select thread_root_id, resolved, resolved_by, resolved_at
              from comment_resolution where thread_root_id in ${sql(rootIds)}
            `
          : [];
        // Per-thread read watermark for this viewer, to compute has_unread.
        const seen =
          viewerId && rootIds.length
            ? await sql<{ thread_root_id: string; seen_at: Date }[]>`
                select thread_root_id, seen_at from comment_seen
                where viewer_id = ${viewerId} and thread_root_id in ${sql(rootIds)}
              `
            : [];
        const seenByRoot = new Map(seen.map((s) => [s.thread_root_id, s.seen_at]));
        const { threads, orphaned } = assembleThreads(
          { area, slug: req.ref.slug, project: req.ref.project, bucket: req.ref.bucket },
          rows,
          resolutions,
          seenByRoot,
        );
        return create(ListCommentsResponseSchema, { threads, orphanedThreads: orphaned });
      },

      async listRecentComments(req: ListRecentCommentsRequest, ctx) {
        // A cross-content reviewer artifact: allowlist-only.
        requireAllowlisted(ctx);
        const sql = db();
        const areaFilter =
          req.area !== undefined && req.area !== 0 ? areaToDb(req.area) : null;
        const limit = Math.min(
          Math.max(req.limit && req.limit > 0 ? req.limit : RECENT_COMMENTS_DEFAULT, 1),
          RECENT_COMMENTS_MAX,
        );

        // Most-recent comments (roots AND replies) across all content, each with
        // the context needed to deep-link back: the latest version's title +
        // project/bucket (so the client can build the right route), the heading
        // text for the comment's anchor, and the thread-root resolution. The
        // section join is against the LATEST version's sections (a comment on a
        // since-removed heading simply gets an empty label). Tombstoned authors
        // are skipped. UUIDv7 ids order-match created_at, giving a stable tiebreak.
        const rows = await sql<RecentCommentRow[]>`
          with latest as (
            select distinct on (area, slug) id, area, slug, project, bucket, title
            from content_version
            order by area, slug, created_at desc
          )
          select c.id, c.area, c.slug,
                 l.project, l.bucket,
                 c.anchor_slug, c.anchor_fingerprint, c.parent_id,
                 c.author_login, c.author_name, c.body_md, c.created_at, c.edited_at, c.orphaned,
                 c.selector_quote, c.selector_prefix, c.selector_suffix, c.selector_start,
                 c.code_path, c.code_region, c.code_line, c.code_end_line,
                 c.code_line_hash, c.code_file_hash,
                 c.authored_version_id, cv.git_sha as authored_git_sha,
                 l.title as content_title,
                 sec.heading_text as heading_text,
                 coalesce(cr.resolved, false) as resolved
          from comment c
          left join latest l on l.area = c.area and l.slug = c.slug
          left join content_version cv on cv.id = c.authored_version_id
          left join content_section sec
            on sec.version_id = l.id and sec.anchor_slug = c.anchor_slug
          left join comment_resolution cr
            on cr.thread_root_id = coalesce(c.parent_id, c.id)
          where c.author_login <> ${TOMBSTONE_LOGIN}
            and (${areaFilter}::text is null or c.area = ${areaFilter})
          order by c.created_at desc, c.id desc
          limit ${limit}
        `;

        const comments = rows.map(recentCommentFromRow);
        return create(ListRecentCommentsResponseSchema, { comments });
      },

      async createComment(req: CreateCommentRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        if (!req.bodyMd.trim()) {
          throw new ConnectError("body_md is required", Code.InvalidArgument);
        }
        const sql = db();
        const area = areaToDb(req.ref.area);

        // Nesting is capped so the reply tree stays legible and indentation
        // bounded. A root is depth 0; a reply is parent.depth + 1. Rejecting at
        // MAX_REPLY_DEPTH keeps at most that many levels of replies under a root.
        let parentId: string | null = req.parentId ?? null;
        if (parentId) {
          const [parent] = await sql<{ id: string; parent_id: string | null }[]>`
            select id, parent_id from comment
            where id = ${parentId} and area = ${area} and slug = ${req.ref.slug}
          `;
          if (!parent) {
            throw new ConnectError("parent comment not found", Code.NotFound);
          }
          const depth = await commentDepth(sql, parent.id);
          if (depth + 1 > MAX_REPLY_DEPTH) {
            throw new ConnectError(
              `reply nesting exceeds the maximum depth of ${MAX_REPLY_DEPTH}`,
              Code.FailedPrecondition,
            );
          }
        }

        // Resolve the latest version for this (area, slug) once: its id both
        // provides section_id (via the anchor) and freezes authored_version_id —
        // the git provenance of what the author was looking at, which survives
        // later re-anchoring (section_id moves; authored_version_id does not).
        const [latest] = await sql<{ id: string }[]>`
          select id from content_version
          where area = ${area} and slug = ${req.ref.slug}
          order by created_at desc limit 1
        `;
        const [section] = latest
          ? await sql<{ id: string }[]>`
              select id from content_section
              where version_id = ${latest.id} and anchor_slug = ${req.anchorSlug}
            `
          : [];

        // A comment carries at most one fine-grained selector. Prose ranges pin
        // within a section; code selectors pin to snippet source. Both null =
        // a heading-level comment (the original behavior).
        const sel = req.selector;
        const code = req.codeSelector;

        const [row] = await sql<CommentRow[]>`
          insert into comment
            (area, slug, section_id, authored_version_id, anchor_slug, anchor_fingerprint, parent_id,
             author_user_id, author_login, author_name, body_md, orphaned,
             selector_quote, selector_prefix, selector_suffix, selector_start,
             code_path, code_region, code_line, code_end_line, code_line_hash, code_file_hash)
          values
            (${area}, ${req.ref.slug}, ${section?.id ?? null}, ${latest?.id ?? null}, ${req.anchorSlug},
             ${req.anchorFingerprint}, ${parentId},
             ${viewer.userId ?? viewer.login ?? "unknown"}, ${viewer.login ?? "unknown"},
             ${viewer.name ?? null}, ${req.bodyMd}, false,
             ${sel?.quote ?? null}, ${sel?.prefix ?? null}, ${sel?.suffix ?? null},
             ${sel ? sel.start : null},
             ${code?.path ?? null}, ${code?.region ?? null}, ${code ? code.line : null},
             ${code ? code.endLine : null}, ${code?.lineHash ?? null}, ${code?.fileHash ?? null})
          returning id, area, slug, anchor_slug, anchor_fingerprint, parent_id,
                    author_login, author_name, body_md, created_at, edited_at, orphaned,
                    selector_quote, selector_prefix, selector_suffix, selector_start,
                    code_path, code_region, code_line, code_end_line, code_line_hash, code_file_hash,
                    authored_version_id,
                    (select git_sha from content_version where id = comment.authored_version_id)
                      as authored_git_sha
        `;
        const { threads } = assembleThreads(
          { area, slug: req.ref.slug, project: req.ref.project, bucket: req.ref.bucket },
          [row],
          [],
        );
        // Hint any SSE-subscribed reviewers to refetch (best-effort).
        await notifyCommentsChanged(sql, { area, slug: req.ref.slug });
        return create(CreateCommentResponseSchema, {
          comment: threads[0]?.root ?? undefined,
        });
      },

      async resolveThread(req: ResolveThreadRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        const thread = await setResolved(req.threadRootId, true, viewer.login ?? "unknown");
        if (thread.root?.ref) {
          await notifyCommentsChanged(db(), {
            area: areaToDb(thread.root.ref.area),
            slug: thread.root.ref.slug,
          });
        }
        return create(ResolveThreadResponseSchema, { thread });
      },

      async unresolveThread(req: UnresolveThreadRequest, ctx) {
        requireAllowlisted(ctx);
        const thread = await setResolved(req.threadRootId, false, null);
        if (thread.root?.ref) {
          await notifyCommentsChanged(db(), {
            area: areaToDb(thread.root.ref.area),
            slug: thread.root.ref.slug,
          });
        }
        return create(UnresolveThreadResponseSchema, { thread });
      },

      async markThreadSeen(req: MarkThreadSeenRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.threadRootId) {
          throw new ConnectError("thread_root_id is required", Code.InvalidArgument);
        }
        const viewerId = viewer.userId ?? viewer.login;
        if (!viewerId) throw new ConnectError("no viewer identity", Code.Unauthenticated);
        const sql = db();
        // Default the watermark to server now(); a client-supplied seen_at lets
        // it mark "read as of" a specific moment (e.g. the last render).
        const seenAt = req.seenAt ? timestampDate(req.seenAt) : null;
        await sql`
          insert into comment_seen (viewer_id, thread_root_id, seen_at)
          values (${viewerId}, ${req.threadRootId}, ${seenAt ?? sql`now()`})
          on conflict (viewer_id, thread_root_id)
            do update set seen_at = excluded.seen_at
        `;
        return create(MarkThreadSeenResponseSchema, {});
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

      async eraseUser(req: EraseUserRequest, ctx) {
        requireMaintainer(ctx);
        const userId = req.userId?.trim() || null;
        const login = req.login?.trim() || null;
        if (!userId && !login) {
          throw new ConnectError("user_id or login is required", Code.InvalidArgument);
        }
        // The tombstone keeps thread structure legible after erasure (hard-delete
        // would cascade via parent_id and take others' replies with it).
        const TOMBSTONE = "deleted-user";

        // One transaction so a user is never left half-erased. Every identity
        // column is matched against BOTH the stable user id and the login, so a
        // rename before erasure can't leave part of the footprint behind.
        const counts = await db().begin(async (sql) => {
          // author_user_id is the stable id; author_login is the login. Match
          // either. Tombstone content + identity but keep the row + its edges.
          const tombstoned = await sql`
            update comment set
              author_login = ${TOMBSTONE},
              author_user_id = ${TOMBSTONE},
              author_name = null,
              body_md = '[removed]'
            where (${userId}::text is not null and author_user_id = ${userId})
               or (${login}::text is not null and author_login = ${login})
          `;
          // review_state / resolution actors are written from the login today.
          const reviewStates = await sql`
            update review_state set actor_user_id = ${TOMBSTONE}
            where (${userId}::text is not null and actor_user_id = ${userId})
               or (${login}::text is not null and actor_user_id = ${login})
          `;
          const resolutions = await sql`
            update comment_resolution set resolved_by = ${TOMBSTONE}
            where (${userId}::text is not null and resolved_by = ${userId})
               or (${login}::text is not null and resolved_by = ${login})
          `;
          // Read-state is worthless once the user is gone — hard-delete it.
          const seen = await sql`
            delete from comment_seen
            where (${userId}::text is not null and viewer_id = ${userId})
               or (${login}::text is not null and viewer_id = ${login})
          `;
          return {
            comments: tombstoned.count,
            reviewStates: reviewStates.count,
            resolutions: resolutions.count,
            seen: seen.count,
          };
        });

        return create(EraseUserResponseSchema, {
          commentsTombstoned: counts.comments,
          reviewStatesScrubbed: counts.reviewStates,
          resolutionsScrubbed: counts.resolutions,
          seenRowsDeleted: counts.seen,
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
    select c.id, c.area, c.slug, c.anchor_slug, c.anchor_fingerprint, c.parent_id,
           c.author_login, c.author_name, c.body_md, c.created_at, c.edited_at, c.orphaned,
           c.selector_quote, c.selector_prefix, c.selector_suffix, c.selector_start,
           c.code_path, c.code_region, c.code_line, c.code_end_line,
           c.code_line_hash, c.code_file_hash,
           c.authored_version_id, cv.git_sha as authored_git_sha
    from comment c
    left join content_version cv on cv.id = c.authored_version_id
    where c.id = ${threadRootId} and c.parent_id is null
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
  // The full descendant subtree (N levels), not just direct replies, so
  // assembleThreads can re-flatten the whole thread after a resolution change.
  const replies = await sql<CommentRow[]>`
    with recursive descendants as (
      select c.* from comment c where c.parent_id = ${threadRootId}
      union all
      select c.* from comment c
      join descendants d on c.parent_id = d.id
    )
    select d.id, d.area, d.slug, d.anchor_slug, d.anchor_fingerprint, d.parent_id,
           d.author_login, d.author_name, d.body_md, d.created_at, d.edited_at, d.orphaned,
           d.selector_quote, d.selector_prefix, d.selector_suffix, d.selector_start,
           d.code_path, d.code_region, d.code_line, d.code_end_line,
           d.code_line_hash, d.code_file_hash,
           d.authored_version_id, cv.git_sha as authored_git_sha
    from descendants d
    left join content_version cv on cv.id = d.authored_version_id
    order by d.id asc
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
 * Depth of a comment within its thread: 0 for a root (parent_id null), else one
 * more than its parent. Walks parent links via a recursive CTE so a single query
 * answers it regardless of nesting depth.
 */
async function commentDepth(sql: Sql, id: string): Promise<number> {
  const [row] = await sql<{ depth: number }[]>`
    with recursive ancestry as (
      select id, parent_id, 0 as depth from comment where id = ${id}
      union all
      select c.id, c.parent_id, a.depth + 1
      from comment c join ancestry a on c.id = a.parent_id
    )
    select max(depth)::int as depth from ancestry
  `;
  return row?.depth ?? 0;
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
