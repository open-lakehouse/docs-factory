// ReviewService registration. Highlights:
//   - GetViewer / RegisterVersion — viewer resolution + build-time version upsert.
//   - ListDrafts / GetDraftContent — publication is (frontmatter `ready` AND the
//     content_revops.published latch); else allowlist-gated.
//   - Comments + threads + read-state + code-review panes.
//   - Review lifecycle: TransitionReview / ReleaseContent (transactional, logs a
//     content_event; release is blocked while a required request is open and sets
//     the published latch).
//   - Review requests: RequestReview / CancelReviewRequest / ListReviewRequests —
//     request reviews from allowlisted reviewers, required blocks release, satisfied
//     when the artifact is approved.
//   - RequestChangesOnPublished — reopen a released page to changes-requested, with
//     an optional unpublish (clears the latch, DB-only).
//   - ListContentEvents — the append-only per-artifact lifecycle timeline.
//   - ManageAllowlist / EraseUser — maintainer-only.
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
  SetPriorityResponseSchema,
  SetTargetReleaseDateResponseSchema,
  ManageAllowlistRequest_Action,
  ManageAllowlistResponseSchema,
  EraseUserResponseSchema,
  RegisterVersionResponseSchema,
  RequestReviewResponseSchema,
  CancelReviewRequestResponseSchema,
  ListReviewRequestsResponseSchema,
  ListContentEventsResponseSchema,
  RequestChangesOnPublishedResponseSchema,
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
  type SetPriorityRequest,
  type SetTargetReleaseDateRequest,
  type ManageAllowlistRequest,
  type EraseUserRequest,
  type RegisterVersionRequest,
  type RequestReviewRequest,
  type CancelReviewRequestRequest,
  type ListReviewRequestsRequest,
  type ListContentEventsRequest,
  type RequestChangesOnPublishedRequest,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import {
  AllowlistEntrySchema,
  DraftSummarySchema,
  ContentRefSchema,
  ThreadSchema,
  SnippetRefSchema,
  ReviewState,
  Role,
} from "../gen/docs_factory/review/v1/messages_pb.js";
import type { AuthProvider } from "../auth/provider.js";
import {
  authInterceptor,
  getViewer,
  requireAllowlisted,
  requireMaintainer,
} from "../auth/context.js";
import { db, type Sql, type Queryable } from "../db.js";
import {
  areaToDb,
  areaFromDb,
  contentVersionFromRow,
  dateOnlyToUtcTimestamp,
  type ContentVersionRow,
} from "../db-map.js";
import { roleFromDb, lookupRole } from "../allowlist.js";
import {
  reviewRequestFromRow,
  contentEventFromRow,
  requirementToDb,
  EVENT_KIND_BY_STATE,
  type ReviewRequestRow,
  type ContentEventRow,
} from "../review-requests.js";
import { reanchorThreads, reanchorCodeThreads } from "../anchor.js";
import {
  assembleThreads,
  commentFromRow,
  recentCommentFromRow,
  type CommentRow,
  type RecentCommentRow,
  type ResolutionRow,
} from "../comments.js";
import { notifyCommentsChanged } from "../notify.js";

// A page is shown to anonymous (non-allowlisted) viewers only when BOTH hold:
// its git authoring intent is `ready` (frontmatter_status) AND the published
// latch is set (content_revops.published). Publication is the intersection of
// author intent and the sticky release outcome — decoupled from the live
// review_state, so a released page can be reopened for changes without dropping
// out of public view unless a maintainer explicitly unpublishes.
const READY_STATUS = "ready";
// Maximum reply nesting under a thread root (root = depth 0). Keeps the tree
// legible and client indentation bounded; enforced in createComment.
const MAX_REPLY_DEPTH = 4;
// Tombstone login/id for an erased author (see eraseUser). Recent-comment feeds
// skip these — there's no identity to show and the body is "[removed]".
const TOMBSTONE_LOGIN = "deleted-user";
// The "latest comments" feed page size (default + hard cap).
const RECENT_COMMENTS_DEFAULT = 20;
const RECENT_COMMENTS_MAX = 100;
// The per-artifact timeline (content_event) page size (default + hard cap).
const CONTENT_EVENTS_DEFAULT = 50;
const CONTENT_EVENTS_MAX = 200;
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
// Allowed transitions. RELEASED (a DB action) is maintainer-only (enforced
// below). It is no longer terminal: a released page can be reopened to `in-review`
// or straight to `changes-requested` (the reopen-published flow) — reopening
// changes the live review_state but not the sticky `published` latch, so
// visibility only changes when a maintainer explicitly unpublishes.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  none: ["in-review"],
  "in-review": ["changes-requested", "approved"],
  "changes-requested": ["in-review"],
  approved: ["released", "in-review"],
  released: ["in-review", "changes-requested"],
};

// The joined shape behind a DraftSummary: latest version metadata + current
// review state + open-comment count + RevOps pipeline fields (content_revops).
// The `version_*` columns are the latest content_version (null when a draft has
// review activity but no registered version yet); they back latest_version.
type DraftSummaryRow = {
  area: string;
  slug: string;
  project: string | null;
  bucket: string | null;
  title: string | null;
  frontmatter_status: string | null;
  priority: number | null;
  target_release_date: Date | string | null;
  published: boolean | null;
  open_required_requests: number;
  review_state: string | null;
  open_comments: number;
  version_id: string | null;
  version_content_hash: string | null;
  version_git_sha: string | null;
  version_created_at: Date | null;
};

function draftSummaryFromRow(r: DraftSummaryRow) {
  const target =
    r.target_release_date == null ? undefined : dateOnlyToUtcTimestamp(r.target_release_date);
  const ref = create(ContentRefSchema, {
    area: areaFromDb(r.area),
    slug: r.slug,
    project: r.project ?? undefined,
    bucket: r.bucket ?? undefined,
  });
  return create(DraftSummarySchema, {
    ref,
    title: r.title ?? r.slug,
    frontmatterStatus: r.frontmatter_status ?? "",
    reviewState: REVIEW_STATE_BY_DB[r.review_state ?? "none"] ?? ReviewState.NONE,
    openCommentCount: r.open_comments,
    priority: r.priority ?? undefined,
    targetReleaseDate: target,
    published: r.published ?? false,
    openRequiredRequestCount: r.open_required_requests,
    latestVersion:
      r.version_id == null
        ? undefined
        : contentVersionFromRow(
            {
              id: r.version_id,
              area: r.area,
              slug: r.slug,
              project: r.project,
              bucket: r.bucket,
              content_hash: r.version_content_hash ?? "",
              git_sha: r.version_git_sha ?? "",
              title: r.title,
              frontmatter_status: r.frontmatter_status,
              created_at: r.version_created_at ?? new Date(0),
            },
            ref,
          ),
  });
}

// Re-read one (area, slug)'s DraftSummary row after a RevOps mutation, so the
// setters return the same shape ListDrafts produces (with the fresh priority /
// target date joined in). Returns null if the ref has no known content at all.
async function loadDraftSummary(sql: Sql, area: string, slug: string) {
  const [row] = await sql<DraftSummaryRow[]>`
    with latest as (
      select distinct on (area, slug) *
      from content_version
      where area = ${area} and slug = ${slug}
      order by area, slug, created_at desc
    )
    select ${area}::text as area, ${slug}::text as slug,
      l.project, l.bucket, l.title, l.frontmatter_status,
      l.id as version_id, l.content_hash as version_content_hash,
      l.git_sha as version_git_sha, l.created_at as version_created_at,
      rv.priority, rv.target_release_date, coalesce(rv.published, false) as published,
      (select rs.state from review_state rs
        where rs.area = ${area} and rs.slug = ${slug}
        order by rs.created_at desc limit 1) as review_state,
      (select count(*)::int from comment c
        left join comment_resolution cr on cr.thread_root_id = c.id
        where c.area = ${area} and c.slug = ${slug}
          and c.parent_id is null and c.orphaned = false
          and coalesce(cr.resolved, false) = false) as open_comments,
      (select count(*)::int from review_request rq
        where rq.area = ${area} and rq.slug = ${slug}
          and rq.requirement = 'required' and rq.status = 'open') as open_required_requests
    from (select 1) one
    left join latest l on true
    left join content_revops rv on rv.area = ${area} and rv.slug = ${slug}
  `;
  return row ? draftSummaryFromRow(row) : null;
}

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
        const rows = await sql<DraftSummaryRow[]>`
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
            l.id as version_id, l.content_hash as version_content_hash,
            l.git_sha as version_git_sha, l.created_at as version_created_at,
            rv.priority, rv.target_release_date, coalesce(rv.published, false) as published,
            (select rs.state from review_state rs
              where rs.area = k.area and rs.slug = k.slug
              order by rs.created_at desc limit 1) as review_state,
            (select count(*)::int from comment c
              left join comment_resolution cr on cr.thread_root_id = c.id
              where c.area = k.area and c.slug = k.slug
                and c.parent_id is null and c.orphaned = false
                and coalesce(cr.resolved, false) = false) as open_comments,
            (select count(*)::int from review_request rq
              where rq.area = k.area and rq.slug = k.slug
                and rq.requirement = 'required' and rq.status = 'open') as open_required_requests
          from keys k
          left join latest l on l.area = k.area and l.slug = k.slug
          left join content_revops rv on rv.area = k.area and rv.slug = k.slug
          where (${areaFilter}::text is null or k.area = ${areaFilter})
            and (
              ${viewer.isAllowlisted}
              or (
                l.frontmatter_status = ${READY_STATUS}
                and coalesce(rv.published, false) = true
              )
            )
          order by
            k.area,
            case when ${req.orderByPriority ?? false} then rv.priority end asc nulls last,
            l.project nulls first, l.bucket nulls first, k.slug
        `;

        const drafts = rows.map(draftSummaryFromRow);
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

        // Public content requires BOTH author intent (frontmatter `ready`) AND the
        // published latch (content_revops.published) — the sticky publication
        // outcome, decoupled from the live review_state. Anything short of that
        // is allowlist-gated.
        const [revops] = await sql<{ published: boolean }[]>`
          select coalesce(published, false) as published from content_revops
          where area = ${area} and slug = ${req.ref.slug}
        `;
        const isPublic =
          row.frontmatter_status === READY_STATUS && revops?.published === true;
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
        // `roots` climbs each comment's parent chain to its thread root, so the
        // resolution join keys on the real root — coalesce(parent_id, id) would
        // only be correct one level deep and returns the wrong id for a reply
        // nested two or more levels down (its parent is another reply, not the
        // root that comment_resolution is keyed by).
        const rows = await sql<RecentCommentRow[]>`
          with latest as (
            select distinct on (area, slug) id, area, slug, project, bucket, title
            from content_version
            order by area, slug, created_at desc
          ),
          roots as (
            select c.id, c.id as root_id, c.parent_id from comment c
            where c.parent_id is null
            union all
            select c.id, r.root_id, c.parent_id
            from comment c join roots r on c.parent_id = r.id
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
          left join roots r on r.id = c.id
          left join latest l on l.area = c.area and l.slug = c.slug
          left join content_version cv on cv.id = c.authored_version_id
          left join content_section sec
            on sec.version_id = l.id and sec.anchor_slug = c.anchor_slug
          left join comment_resolution cr
            on cr.thread_root_id = r.root_id
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
        // Return the just-created comment directly. assembleThreads only surfaces
        // roots (a reply lands under childrenByParent with no root in this
        // single-row batch), so map the row itself — this is correct for both a
        // new root and a reply.
        const protoRef = create(ContentRefSchema, {
          area: areaFromDb(area),
          slug: req.ref.slug,
          project: req.ref.project ?? undefined,
          bucket: req.ref.bucket ?? undefined,
        });
        // Hint any SSE-subscribed reviewers to refetch (best-effort).
        await notifyCommentsChanged(sql, { area, slug: req.ref.slug });
        return create(CreateCommentResponseSchema, {
          comment: commentFromRow(row, protoRef),
        });
      },

      async resolveThread(req: ResolveThreadRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        const thread = await setResolved(req.threadRootId, true, actorId(viewer));
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
        const state = await transition(req.ref, req.toState, req.note, ctx, actorId(viewer));
        return create(TransitionReviewResponseSchema, { state });
      },

      async releaseContent(req: ReleaseContentRequest, ctx) {
        // Release is maintainer-only. It is blocked while any REQUIRED review
        // request is still open (optional requests are advisory).
        const viewer = requireMaintainer(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const actor = actorId(viewer);

        const [{ open }] = await sql<{ open: number }[]>`
          select count(*)::int as open from review_request
          where area = ${area} and slug = ${req.ref.slug}
            and requirement = 'required' and status = 'open'
        `;
        if (open > 0) {
          throw new ConnectError(
            `cannot release: ${open} required review request(s) still open`,
            Code.FailedPrecondition,
          );
        }

        // Transition to RELEASED (satisfies open optional requests + logs the
        // approved->released state event via transition()), then set the sticky
        // published latch and log `released`. Was this a first release or a
        // re-release after a reopen? `republished` when the latch was already set.
        const state = await transition(req.ref, ReviewState.RELEASED, req.note, ctx, actor);
        await sql.begin(async (tx) => {
          const [ver] = await tx<{ id: string }[]>`
            select id from content_version
            where area = ${area} and slug = ${req.ref!.slug}
            order by created_at desc limit 1
          `;
          const [prev] = await tx<{ published: boolean }[]>`
            select coalesce(published, false) as published from content_revops
            where area = ${area} and slug = ${req.ref!.slug}
          `;
          const wasPublished = prev?.published === true;
          await tx`
            insert into content_revops (area, slug, published, updated_by)
            values (${area}, ${req.ref!.slug}, true, ${viewer.login ?? "unknown"})
            on conflict (area, slug) do update
              set published = true, updated_by = ${viewer.login ?? "unknown"}, updated_at = now()
          `;
          await logEvent(
            tx,
            area,
            req.ref!.slug,
            wasPublished ? "republished" : "released",
            actor,
            ver?.id ?? null,
            { note: req.note ?? undefined },
          );
        });
        return create(ReleaseContentResponseSchema, { state });
      },

      // RevOps: setting priority/target date is routine reviewer work, so both
      // are allowlist-gated (release stays maintainer-only). The upsert creates
      // the content_revops row on first use — a piece of content can be ranked
      // before it has any registered version.
      async setPriority(req: SetPriorityRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const priority = req.priority ?? null;
        await sql`
          insert into content_revops (area, slug, priority, updated_by)
          values (${area}, ${req.ref.slug}, ${priority}, ${viewer.login ?? "unknown"})
          on conflict (area, slug) do update
            set priority = ${priority},
                updated_by = ${viewer.login ?? "unknown"},
                updated_at = now()
        `;
        const draft = await loadDraftSummary(sql, area, req.ref.slug);
        return create(SetPriorityResponseSchema, { draft: draft ?? undefined });
      },

      async setTargetReleaseDate(req: SetTargetReleaseDateRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        // Date-only: take the timestamp's calendar date (UTC) for the `date` column.
        const date = req.targetReleaseDate
          ? timestampDate(req.targetReleaseDate).toISOString().slice(0, 10)
          : null;
        await sql`
          insert into content_revops (area, slug, target_release_date, updated_by)
          values (${area}, ${req.ref.slug}, ${date}, ${viewer.login ?? "unknown"})
          on conflict (area, slug) do update
            set target_release_date = ${date},
                updated_by = ${viewer.login ?? "unknown"},
                updated_at = now()
        `;
        const draft = await loadDraftSummary(sql, area, req.ref.slug);
        return create(SetTargetReleaseDateResponseSchema, { draft: draft ?? undefined });
      },

      // Request a review of one artifact from one or more allowlisted reviewers.
      // Each reviewer must resolve to an allowlist entry (by login or email); an
      // off-list target is rejected so a request always addresses a real reviewer.
      async requestReview(req: RequestReviewRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        if (req.reviewers.length === 0) {
          throw new ConnectError("at least one reviewer is required", Code.InvalidArgument);
        }
        const sql = db();
        const area = areaToDb(req.ref.area);
        const slug = req.ref.slug;
        const actor = actorId(viewer);
        const requirement = requirementToDb(req.requirement);
        const versionId = await latestVersionId(sql, area, slug);

        const created = await sql.begin(async (tx) => {
          const rows: ReviewRequestRow[] = [];
          for (const target of req.reviewers) {
            const login = target.login?.trim() || null;
            const email = target.email?.trim() || null;
            if (!login && !email) {
              throw new ConnectError("each reviewer needs a login or email", Code.InvalidArgument);
            }
            const role = await lookupRole(tx, {
              login: login ?? undefined,
              emails: email ? [email] : [],
            });
            if (role === Role.ANONYMOUS) {
              throw new ConnectError(
                `reviewer ${login ?? email} is not on the allowlist`,
                Code.FailedPrecondition,
              );
            }
            const [row] = await tx<ReviewRequestRow[]>`
              insert into review_request
                (area, slug, reviewer_login, reviewer_email, requirement, requested_by, note)
              values (${area}, ${slug}, ${login}, ${email}, ${requirement}, ${actor}, ${req.note ?? null})
              returning *
            `;
            rows.push(row);
            await logEvent(tx, area, slug, "review-requested", actor, versionId, {
              request_id: row.id,
              reviewer_login: login ?? undefined,
              requirement,
              note: req.note ?? undefined,
            });
          }
          return rows;
        });

        return create(RequestReviewResponseSchema, {
          requests: created.map(reviewRequestFromRow),
        });
      },

      // Cancel an open request. The requester or any maintainer may cancel; a
      // reviewer cannot cancel a request addressed to a different person.
      async cancelReviewRequest(req: CancelReviewRequestRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.requestId) throw new ConnectError("request_id is required", Code.InvalidArgument);
        const sql = db();
        const actor = actorId(viewer);

        const [existing] = await sql<ReviewRequestRow[]>`
          select * from review_request where id = ${req.requestId}
        `;
        if (!existing) throw new ConnectError("request not found", Code.NotFound);
        if (existing.status !== "open") {
          throw new ConnectError("only open requests can be cancelled", Code.FailedPrecondition);
        }
        if (viewer.role !== Role.MAINTAINER && existing.requested_by !== actor) {
          throw new ConnectError("only the requester or a maintainer can cancel", Code.PermissionDenied);
        }

        const updated = await sql.begin(async (tx) => {
          const [row] = await tx<ReviewRequestRow[]>`
            update review_request
            set status = 'cancelled', cancelled_at = now()
            where id = ${req.requestId} returning *
          `;
          const versionId = await latestVersionId(tx, existing.area, existing.slug);
          await logEvent(tx, existing.area, existing.slug, "request-cancelled", actor, versionId, {
            request_id: existing.id,
            reviewer_login: existing.reviewer_login ?? undefined,
          });
          return row;
        });
        return create(CancelReviewRequestResponseSchema, {
          request: reviewRequestFromRow(updated),
        });
      },

      // List review requests: scope to one artifact (`ref`), the viewer's inbox
      // (`mine`), the viewer's outbox (`by_me`), and/or open-only. Allowlist-gated.
      async listReviewRequests(req: ListReviewRequestsRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        const sql = db();
        const area = req.ref ? areaToDb(req.ref.area) : null;
        const slug = req.ref?.slug ?? null;
        const mineLogin = req.mine ? (viewer.login ?? "\0") : null;
        const byMe = req.byMe ? actorId(viewer) : null;
        const rows = await sql<ReviewRequestRow[]>`
          select * from review_request
          where (${area}::text is null or (area = ${area} and slug = ${slug}))
            and (${mineLogin}::text is null or lower(reviewer_login) = lower(${mineLogin}))
            and (${byMe}::text is null or requested_by = ${byMe})
            and (${req.openOnly ?? false} = false or status = 'open')
          order by id desc
        `;
        return create(ListReviewRequestsResponseSchema, {
          requests: rows.map(reviewRequestFromRow),
        });
      },

      // The review timeline for one artifact (most-recent first). Allowlist-gated.
      async listContentEvents(req: ListContentEventsRequest, ctx) {
        requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const limit = Math.min(Math.max(req.limit ?? CONTENT_EVENTS_DEFAULT, 1), CONTENT_EVENTS_MAX);
        const rows = await sql<ContentEventRow[]>`
          select * from content_event
          where area = ${area} and slug = ${req.ref.slug}
          order by id desc limit ${limit}
        `;
        return create(ListContentEventsResponseSchema, {
          events: rows.map(contentEventFromRow),
        });
      },

      // Reopen a released artifact to request changes. Maintainer-only, since it
      // may unpublish. Transitions released -> changes-requested; when `unpublish`
      // is set, also clears the published latch (DB-only, no git write) and logs
      // `unpublished`. Otherwise the artifact stays visible while under review.
      async requestChangesOnPublished(req: RequestChangesOnPublishedRequest, ctx) {
        const viewer = requireMaintainer(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const slug = req.ref.slug;
        const actor = actorId(viewer);

        // Transition first (validates released -> changes-requested and logs the
        // state event). Then, if unpublishing, clear the latch + log it.
        const state = await transition(req.ref, ReviewState.CHANGES_REQUESTED, req.note, ctx, actor);
        let published = true;
        if (req.unpublish) {
          await sql.begin(async (tx) => {
            const versionId = await latestVersionId(tx, area, slug);
            await tx`
              insert into content_revops (area, slug, published, updated_by)
              values (${area}, ${slug}, false, ${viewer.login ?? "unknown"})
              on conflict (area, slug) do update
                set published = false, updated_by = ${viewer.login ?? "unknown"}, updated_at = now()
            `;
            await logEvent(tx, area, slug, "unpublished", actor, versionId, {
              note: req.note ?? undefined,
            });
          });
          published = false;
        } else {
          const [rv] = await sql<{ published: boolean }[]>`
            select coalesce(published, false) as published from content_revops
            where area = ${area} and slug = ${slug}
          `;
          published = rv?.published ?? false;
        }
        return create(RequestChangesOnPublishedResponseSchema, { state, published });
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
          if (req.entry.role === Role.UNSPECIFIED || req.entry.role === Role.ANONYMOUS) {
            throw new ConnectError(
              "role must be REVIEWER or MAINTAINER",
              Code.InvalidArgument,
            );
          }
          const role = req.entry.role === Role.MAINTAINER ? "maintainer" : "reviewer";
          // An entry can key on github_login, email, or both, and each has its
          // own partial-unique index — so no single `on conflict` target covers
          // both. Match an existing row by EITHER identifier and update it;
          // otherwise insert. Idempotent for a re-add by login or by email.
          const [existing] = await sql<{ id: string }[]>`
            select id from reviewer_allowlist
            where (${githubLogin ?? null}::text is not null
                     and lower(github_login) = lower(${githubLogin ?? null}))
               or (${email ?? null}::text is not null
                     and lower(email) = lower(${email ?? null}))
            limit 1
          `;
          if (existing) {
            await sql`
              update reviewer_allowlist
              set github_login = coalesce(${githubLogin ?? null}, github_login),
                  email = coalesce(${email ?? null}, email),
                  role = ${role}
              where id = ${existing.id}
            `;
          } else {
            await sql`
              insert into reviewer_allowlist (github_login, email, role, added_by)
              values (${githubLogin ?? null}, ${email ?? null}, ${role}, ${actor})
            `;
          }
        } else if (req.action === ManageAllowlistRequest_Action.REMOVE) {
          // Remove targets ONE identity. When both are supplied we key on the
          // github_login (the primary identifier); OR-ing across both could
          // delete two unrelated entries if the caller passed a login and an
          // email belonging to different people.
          if (githubLogin) {
            await sql`
              delete from reviewer_allowlist
              where lower(github_login) = lower(${githubLogin})
            `;
          } else {
            await sql`
              delete from reviewer_allowlist
              where lower(email) = lower(${email ?? null})
            `;
          }
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
 * Append a content_event row within an existing transaction. `kind` is the DB
 * event string; kind-specific detail rides in the jsonb payload. Callers pass
 * the transaction handle so the event is atomic with the change it records.
 */
async function logEvent(
  tx: Queryable,
  area: string,
  slug: string,
  kind: string,
  actor: string,
  versionId: string | null,
  payload: Record<string, string | undefined> = {},
): Promise<void> {
  await tx`
    insert into content_event (area, slug, kind, actor, version_id, payload)
    values (${area}, ${slug}, ${kind}, ${actor}, ${versionId}, ${tx.json(payload)})
  `;
}

/**
 * Validate + append a review-state transition. Returns the new state. Enforces
 * the state machine and that RELEASED is only reachable by a maintainer. The
 * caller has already done the allowlist/maintainer auth check for the entry
 * point; this re-checks RELEASED so no path can release without maintainer.
 *
 * The state insert, satisfy-on-approve (any allowlisted approval satisfies all
 * open requests on the artifact), and the timeline event are one transaction so
 * they never diverge. The idempotent no-op short-circuits BEFORE any write, so a
 * repeat transition logs nothing.
 */
async function transition(
  ref: { area: number; slug: string } | undefined,
  toState: ReviewState,
  note: string | undefined,
  ctx: Parameters<typeof getViewer>[0],
  actor: string,
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
  if (from === toDb) return toState; // idempotent no-op — no write, no event
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
  const versionId = ver?.id ?? null;

  await sql.begin(async (tx) => {
    await tx`
      insert into review_state (area, slug, state, version_id, actor_user_id, note)
      values (${area}, ${ref.slug}, ${toDb}, ${versionId}, ${actor}, ${note ?? null})
    `;
    // Reaching `approved` satisfies every open request on this artifact.
    if (toDb === "approved") {
      const satisfied = await tx<{ id: string }[]>`
        update review_request
        set status = 'satisfied', satisfied_at = now(), satisfied_by = ${actor}
        where area = ${area} and slug = ${ref.slug} and status = 'open'
        returning id
      `;
      for (const r of satisfied) {
        await logEvent(tx, area, ref.slug, "request-satisfied", actor, versionId, {
          request_id: r.id,
        });
      }
    }
    // Log the transition itself (releaseContent logs `released` with the latch,
    // so skip it here to avoid a duplicate).
    const kind = EVENT_KIND_BY_STATE[toDb];
    if (kind && kind !== "released") {
      await logEvent(tx, area, ref.slug, kind, actor, versionId, {
        from_state: from,
        to_state: toDb,
        note: note ?? undefined,
      });
    }
  });
  return toState;
}

/**
 * The stable actor identity to persist in *_user_id columns: the Neon Auth user
 * id when present, else the login (which is all the mock/anon providers carry).
 * Keeps actor_user_id / resolved_by matching author_user_id's semantics —
 * previously these were written from the login, contradicting their name.
 */
function actorId(viewer: { userId?: string; login?: string }): string {
  return viewer.userId ?? viewer.login ?? "unknown";
}

/** The latest content_version id for an artifact, or null if none is registered. */
async function latestVersionId(sql: Queryable, area: string, slug: string): Promise<string | null> {
  const [ver] = await sql<{ id: string }[]>`
    select id from content_version
    where area = ${area} and slug = ${slug}
    order by created_at desc limit 1
  `;
  return ver?.id ?? null;
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
