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
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
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
  ListAllowlistResponseSchema,
  ListRegisteredUsersResponseSchema,
  SearchUsersResponseSchema,
  EraseUserResponseSchema,
  RegisterVersionResponseSchema,
  ListVersionsResponseSchema,
  GetVersionTreeResponseSchema,
  ProductChangesResponseSchema,
  ProductChangeEntrySchema,
  ChangedNodeSchema,
  ChangeKind,
  RequestReviewResponseSchema,
  CancelReviewRequestResponseSchema,
  ListReviewRequestsResponseSchema,
  ListContentEventsResponseSchema,
  RequestChangesOnPublishedResponseSchema,
  RecordApprovalResponseSchema,
  DismissApprovalResponseSchema,
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
  type ListVersionsRequest,
  type GetVersionTreeRequest,
  type ProductChangesRequest,
  type RequestReviewRequest,
  type CancelReviewRequestRequest,
  type ListReviewRequestsRequest,
  type ListContentEventsRequest,
  type RequestChangesOnPublishedRequest,
  type RecordApprovalRequest,
  type DismissApprovalRequest,
  type SearchUsersRequest,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import {
  AllowlistEntrySchema,
  AllowlistEntryDetailSchema,
  RegisteredUserSchema,
  UserSummarySchema,
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
  requireSiteAdmin,
} from "../auth/context.js";
import { db, type Sql, type Queryable } from "../db.js";
import {
  areaToDb,
  areaFromDb,
  contentVersionFromRow,
  merkleNodeToJson,
  dateOnlyToUtcTimestamp,
  type ContentVersionRow,
  type MerkleNodeJson,
} from "../db-map.js";
import { reviewDiff, unchangedSlugs, type DiffEntry } from "../tree-diff.js";
import { roleFromDb, lookupRole } from "../allowlist.js";
import {
  reviewRequestFromRow,
  contentEventFromRow,
  approvalFromRow,
  requirementToDb,
  EVENT_KIND_BY_STATE,
  type ReviewRequestRow,
  type ContentEventRow,
  type ContentApprovalRow,
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
//
// This is the server's mirror of content-core's PUBLISH_STATUS
// (site/src/content-core/frontmatter.mjs); the value MUST match its build-side
// twin. We keep a local copy rather than import across the package boundary,
// following the same no-cross-package-import convention as anchor.ts.
const READY_STATUS = "ready";
// Maximum reply nesting under a thread root (root = depth 0). Keeps the tree
// legible and client indentation bounded; enforced in createComment.
const MAX_REPLY_DEPTH = 4;

/**
 * True when an allowlist op would leave the site with zero maintainers — the one
 * invariant manageAllowlist hard-blocks, since a maintainerless allowlist locks
 * everyone out of the admin surface (only a maintainer can add one back, and the
 * only remaining recovery is direct SQL). Pure so it can be unit-tested.
 *
 * @param maintainerCount current number of `maintainer` rows in the allowlist
 * @param targetIsMaintainer whether the row the op targets is currently a maintainer
 * @param demotesTarget whether the op removes the target's maintainer status
 *        (a REMOVE, or an ADD that sets the existing maintainer row to reviewer)
 */
export function removesLastMaintainer(
  maintainerCount: number,
  targetIsMaintainer: boolean,
  demotesTarget: boolean,
): boolean {
  return targetIsMaintainer && demotesTarget && maintainerCount <= 1;
}

/** Current count of `maintainer` rows in the allowlist. */
async function maintainerCount(sql: Queryable): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from reviewer_allowlist where role = 'maintainer'`;
  return n;
}

// Tombstone login/id for an erased author (see eraseUser). Recent-comment feeds
// skip these — there's no identity to show and the body is "[removed]".
const TOMBSTONE_LOGIN = "deleted-user";
// The "latest comments" feed page size (default + hard cap).
const RECENT_COMMENTS_DEFAULT = 20;
const RECENT_COMMENTS_MAX = 100;
// The per-artifact timeline (content_event) page size (default + hard cap).
const CONTENT_EVENTS_DEFAULT = 50;
const CONTENT_EVENTS_MAX = 200;
// The storable explicit outcomes (the only states that live in review_state).
// The derived states (none, needs-review, derived approved) are never stored, so
// they are absent here. Used to translate a stored outcome and to guard writes.
const DB_BY_REVIEW_STATE: Record<number, string> = {
  [ReviewState.CHANGES_REQUESTED]: "changes-requested",
  [ReviewState.APPROVED]: "approved",
  [ReviewState.RELEASED]: "released",
};
// Allowed transitions of the EXPLICIT (storable) review-state machine, keyed on
// the DERIVED `from` state (deriveReviewState), so a transition is validated
// against what the artifact effectively is right now. TransitionReview only ever
// requests one of the storable outcomes:
//   - changes-requested: reachable while the artifact is under review or approved
//     (a reviewer/maintainer rejects it); the reopen-published flow does
//     released -> changes-requested.
//   - approved: the maintainer override, reachable from needs-review /
//     changes-requested (ordinary approval goes through recordApproval, not here).
//   - released: maintainer-only (enforced below), reachable once APPROVED.
// The sticky `published` latch is independent — visibility only changes on an
// explicit unpublish.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  none: [],
  "needs-review": ["changes-requested", "approved"],
  "changes-requested": ["approved"],
  approved: ["released", "changes-requested"],
  released: ["changes-requested"],
};

// The DB state string a derived ReviewState maps to (for event payload
// from_state/to_state). Covers derived + storable states.
const DB_BY_DERIVED_STATE: Record<number, string> = {
  [ReviewState.NONE]: "none",
  [ReviewState.NEEDS_REVIEW]: "needs-review",
  [ReviewState.CHANGES_REQUESTED]: "changes-requested",
  [ReviewState.APPROVED]: "approved",
  [ReviewState.RELEASED]: "released",
};

// Inputs to the single review-state derivation. All are already loaded per
// (area, slug) by listDrafts/loadDraftSummary/getDraftContent.
export interface DeriveReviewStateInput {
  frontmatterStatus: string | null;
  // The latest EXPLICIT outcome stored in review_state (changes-requested |
  // approved | released), or null if none, plus when it was recorded.
  explicitOutcome: "changes-requested" | "approved" | "released" | null;
  explicitOutcomeAt: Date | null;
  // Active (non-dismissed) approvals, and when the most recent one was recorded.
  // `approverUserId` is the stable per-reviewer key (only membership/count matter
  // to the derivation, so ids vs logins are equivalent here — ids are just stable).
  activeApprovals: { approverUserId: string }[];
  latestApprovalAt: Date | null;
  // User ids of reviewers with an open REQUIRED request (still-pending preconditions).
  openRequiredUserIds: string[];
  // Whether ANY required request exists on the artifact (open or already
  // satisfied) — distinguishes "no required reviewers" from "all satisfied".
  hasRequiredRequests: boolean;
}

export interface DerivedReviewState {
  state: ReviewState;
  pendingRequiredUserIds: string[];
  needsReview: boolean;
}

/**
 * The single source of truth for the effective review state (see the ReviewState
 * proto comment). Pure and DB-free so it can be unit-tested directly. Precedence:
 *   1. released                                   -> RELEASED
 *   2. isApproved                                 -> APPROVED
 *   2. maintainer `approved` override               -> APPROVED
 *   3. changes-requested newer than the last approval -> CHANGES_REQUESTED
 *   4. derived approval (preconditions met)          -> APPROVED
 *   5. frontmatter ready                             -> NEEDS_REVIEW
 *   6. otherwise                                     -> NONE
 * The maintainer override (2) beats a pending change request, but an ordinary
 * reviewer approval (4) does NOT silently override a *newer* change request —
 * hence (3) is checked before (4). Derived approval needs: required requests
 * exist AND none remain open (with >=1 approval), OR no required requests AND
 * >=1 active approval.
 */
export function deriveReviewState(input: DeriveReviewStateInput): DerivedReviewState {
  const {
    frontmatterStatus,
    explicitOutcome,
    explicitOutcomeAt,
    activeApprovals,
    latestApprovalAt,
    openRequiredUserIds,
    hasRequiredRequests,
  } = input;
  const pendingRequiredUserIds = openRequiredUserIds;

  if (explicitOutcome === "released") {
    return { state: ReviewState.RELEASED, pendingRequiredUserIds, needsReview: false };
  }

  // The maintainer override wins over a pending change request.
  if (explicitOutcome === "approved") {
    return { state: ReviewState.APPROVED, pendingRequiredUserIds: [], needsReview: false };
  }

  // A changes-requested outcome holds while it is at least as recent as the
  // latest active approval — a newer approval supersedes it without a write.
  const changesRequestedHolds =
    explicitOutcome === "changes-requested" &&
    (latestApprovalAt == null ||
      (explicitOutcomeAt != null && explicitOutcomeAt.getTime() >= latestApprovalAt.getTime()));
  if (changesRequestedHolds) {
    return { state: ReviewState.CHANGES_REQUESTED, pendingRequiredUserIds, needsReview: false };
  }

  const isApproved = hasRequiredRequests
    ? openRequiredUserIds.length === 0 && activeApprovals.length > 0
    : activeApprovals.length > 0;
  if (isApproved) {
    return { state: ReviewState.APPROVED, pendingRequiredUserIds: [], needsReview: false };
  }

  if (frontmatterStatus === READY_STATUS) {
    return { state: ReviewState.NEEDS_REVIEW, pendingRequiredUserIds, needsReview: true };
  }
  return { state: ReviewState.NONE, pendingRequiredUserIds, needsReview: false };
}

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
  // Raw inputs to deriveReviewState (the effective review_state is computed, not
  // read from a single column):
  //   explicit_outcome/_at — latest stored review_state row (or null)
  //   pending_required_user_ids — user ids of open required requests (for derive)
  //   pending_required_logins — resolved display logins of the same (for the UI)
  //   has_required_requests — any required request exists (open or satisfied)
  //   approvals — active (non-dismissed) approval rows, most-recent last
  explicit_outcome: string | null;
  explicit_outcome_at: Date | null;
  pending_required_user_ids: string[] | null;
  pending_required_logins: string[] | null;
  has_required_requests: boolean;
  approvals: ContentApprovalRow[] | null;
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
  const approvalRows = (r.approvals ?? []).map((a) => ({
    ...a,
    area: r.area,
    slug: r.slug,
    // jsonb timestamps come back as strings; normalize to Date for the mapper.
    created_at: a.created_at instanceof Date ? a.created_at : new Date(a.created_at),
  }));
  const outcome = r.explicit_outcome;
  const explicitOutcome =
    outcome === "changes-requested" || outcome === "approved" || outcome === "released"
      ? outcome
      : null;
  const latestApprovalAt = approvalRows.length
    ? approvalRows[approvalRows.length - 1].created_at
    : null;
  const derived = deriveReviewState({
    frontmatterStatus: r.frontmatter_status,
    explicitOutcome,
    explicitOutcomeAt: r.explicit_outcome_at,
    activeApprovals: approvalRows.map((a) => ({ approverUserId: a.approver_user_id })),
    latestApprovalAt,
    openRequiredUserIds: r.pending_required_user_ids ?? [],
    hasRequiredRequests: r.has_required_requests,
  });
  // The proto surfaces resolved display logins (id-keyed internally): map each
  // pending user id to its joined login, falling back to the id when unresolved.
  const loginByUserId = new Map<string, string>();
  for (let i = 0; i < (r.pending_required_user_ids ?? []).length; i++) {
    const uid = r.pending_required_user_ids![i];
    const login = (r.pending_required_logins ?? [])[i];
    if (uid) loginByUserId.set(uid, login || uid);
  }
  const pendingRequiredLogins = derived.pendingRequiredUserIds.map(
    (uid) => loginByUserId.get(uid) ?? uid,
  );
  return create(DraftSummarySchema, {
    ref,
    title: r.title ?? r.slug,
    frontmatterStatus: r.frontmatter_status ?? "",
    reviewState: derived.state,
    openCommentCount: r.open_comments,
    priority: r.priority ?? undefined,
    targetReleaseDate: target,
    published: r.published ?? false,
    openRequiredRequestCount: r.open_required_requests,
    approvals: approvalRows.map(approvalFromRow),
    pendingRequiredLogins,
    needsReview: derived.needsReview,
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

// The two subquery fragments shared by loadDraftSummary and listDrafts that feed
// deriveReviewState. Both key on the (area, slug) columns named `a` and `s`.
//   - latest explicit outcome (+ its timestamp)
//   - pending required-request logins (array) + whether any required exists
//   - active approvals as a jsonb array (most-recent last), for approvalFromRow

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
        order by rs.created_at desc limit 1) as explicit_outcome,
      (select rs.created_at from review_state rs
        where rs.area = ${area} and rs.slug = ${slug}
        order by rs.created_at desc limit 1) as explicit_outcome_at,
      (select count(*)::int from comment c
        left join comment_resolution cr on cr.thread_root_id = c.id
        where c.area = ${area} and c.slug = ${slug}
          and c.parent_id is null and c.orphaned = false
          and coalesce(cr.resolved, false) = false) as open_comments,
      (select count(*)::int from review_request rq
        where rq.area = ${area} and rq.slug = ${slug}
          and rq.requirement = 'required' and rq.status = 'open') as open_required_requests,
      (select coalesce(array_agg(rq.reviewer_user_id order by rq.created_at), '{}')
        from review_request rq
        where rq.area = ${area} and rq.slug = ${slug}
          and rq.requirement = 'required' and rq.status = 'open') as pending_required_user_ids,
      (select coalesce(array_agg(coalesce(ui.github_login, ui.name, rq.reviewer_user_id) order by rq.created_at), '{}')
        from review_request rq
        left join user_identity ui on ui.user_id = rq.reviewer_user_id
        where rq.area = ${area} and rq.slug = ${slug}
          and rq.requirement = 'required' and rq.status = 'open') as pending_required_logins,
      (select exists (select 1 from review_request rq
        where rq.area = ${area} and rq.slug = ${slug}
          and rq.requirement = 'required')) as has_required_requests,
      (select coalesce(jsonb_agg(
          jsonb_build_object('id', ca.id, 'version_id', ca.version_id,
            'approver_login', ui.github_login, 'approver_user_id', ca.approver_user_id,
            'created_at', ca.created_at) order by ca.created_at), '[]'::jsonb)
        from content_approval ca
        left join user_identity ui on ui.user_id = ca.approver_user_id
        where ca.area = ${area} and ca.slug = ${slug} and ca.dismissed_at is null) as approvals
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
            union
            select area, slug from content_approval
          )
          select k.area, k.slug, l.project, l.bucket, l.title, l.frontmatter_status,
            l.id as version_id, l.content_hash as version_content_hash,
            l.git_sha as version_git_sha, l.created_at as version_created_at,
            rv.priority, rv.target_release_date, coalesce(rv.published, false) as published,
            (select rs.state from review_state rs
              where rs.area = k.area and rs.slug = k.slug
              order by rs.created_at desc limit 1) as explicit_outcome,
            (select rs.created_at from review_state rs
              where rs.area = k.area and rs.slug = k.slug
              order by rs.created_at desc limit 1) as explicit_outcome_at,
            (select count(*)::int from comment c
              left join comment_resolution cr on cr.thread_root_id = c.id
              where c.area = k.area and c.slug = k.slug
                and c.parent_id is null and c.orphaned = false
                and coalesce(cr.resolved, false) = false) as open_comments,
            (select count(*)::int from review_request rq
              where rq.area = k.area and rq.slug = k.slug
                and rq.requirement = 'required' and rq.status = 'open') as open_required_requests,
            (select coalesce(array_agg(rq.reviewer_user_id order by rq.created_at), '{}')
              from review_request rq
              where rq.area = k.area and rq.slug = k.slug
                and rq.requirement = 'required' and rq.status = 'open') as pending_required_user_ids,
            (select coalesce(array_agg(coalesce(ui.github_login, ui.name, rq.reviewer_user_id) order by rq.created_at), '{}')
              from review_request rq
              left join user_identity ui on ui.user_id = rq.reviewer_user_id
              where rq.area = k.area and rq.slug = k.slug
                and rq.requirement = 'required' and rq.status = 'open') as pending_required_logins,
            (select exists (select 1 from review_request rq
              where rq.area = k.area and rq.slug = k.slug
                and rq.requirement = 'required')) as has_required_requests,
            (select coalesce(jsonb_agg(
                jsonb_build_object('id', ca.id, 'version_id', ca.version_id,
                  'approver_login', ui.github_login, 'approver_user_id', ca.approver_user_id,
                  'created_at', ca.created_at) order by ca.created_at), '[]'::jsonb)
              from content_approval ca
              left join user_identity ui on ui.user_id = ca.approver_user_id
              where ca.area = k.area and ca.slug = k.slug and ca.dismissed_at is null) as approvals
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
          with recursive latest as (
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

      // Record the current viewer's approval (idempotent via the active
      // partial-unique index). Satisfies any open REQUIRED request addressed to
      // that reviewer (per-reviewer, not artifact-level), and logs `approved-by`.
      // The effective state then DERIVES to APPROVED once preconditions are met —
      // there is no state write here.
      async recordApproval(req: RecordApprovalRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        if (!viewer.userId) {
          throw new ConnectError("viewer has no user id", Code.FailedPrecondition);
        }
        const sql = db();
        const area = areaToDb(req.ref.area);
        const slug = req.ref.slug;
        const actor = actorId(viewer);
        const userId = viewer.userId;
        const login = viewer.login ?? actor;
        const versionId = await latestVersionId(sql, area, slug);

        await sql.begin(async (tx) => {
          // Upsert the approval: re-approving is a no-op (keeps the original
          // timestamp); a previously-dismissed approval is revived.
          await tx`
            insert into content_approval (area, slug, version_id, approver_user_id)
            values (${area}, ${slug}, ${versionId}, ${userId})
            on conflict (area, slug, approver_user_id) where dismissed_at is null
              do nothing
          `;
          // Revive a prior dismissed approval by the same reviewer, if any.
          await tx`
            update content_approval
            set dismissed_at = null, version_id = ${versionId}, created_at = now()
            where area = ${area} and slug = ${slug}
              and approver_user_id = ${userId} and dismissed_at is not null
              and not exists (
                select 1 from content_approval a2
                where a2.area = ${area} and a2.slug = ${slug}
                  and a2.approver_user_id = ${userId} and a2.dismissed_at is null
              )
          `;
          // Per-reviewer satisfaction: close this reviewer's own open requests
          // (required or optional), matched by the stable user id.
          const satisfied = await tx<{ id: string }[]>`
            update review_request
            set status = 'satisfied', satisfied_at = now(), satisfied_by = ${actor}
            where area = ${area} and slug = ${slug} and status = 'open'
              and reviewer_user_id = ${userId}
            returning id
          `;
          for (const r of satisfied) {
            await logEvent(tx, area, slug, "request-satisfied", actor, versionId, {
              request_id: r.id,
            });
          }
          await logEvent(tx, area, slug, "approved-by", actor, versionId, {
            reviewer_login: login,
            reviewer_user_id: userId,
          });
        });
        const draft = await loadDraftSummary(sql, area, slug);
        return create(RecordApprovalResponseSchema, { draft: draft ?? undefined });
      },

      // Dismiss an approval. A reviewer may dismiss their own; a maintainer may
      // dismiss anyone's (via approver_user_id). Soft-delete (dismissed_at) so it
      // stays on the timeline. The matching required request is left satisfied —
      // dismissing only affects the derived state, not the request lifecycle.
      async dismissApproval(req: DismissApprovalRequest, ctx) {
        const viewer = requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        if (!viewer.userId) {
          throw new ConnectError("viewer has no user id", Code.FailedPrecondition);
        }
        const sql = db();
        const area = areaToDb(req.ref.area);
        const slug = req.ref.slug;
        const actor = actorId(viewer);
        // Dismissing someone else's approval is a maintainer action.
        const target = req.approverUserId ?? viewer.userId;
        if (req.approverUserId && req.approverUserId !== viewer.userId) {
          requireMaintainer(ctx);
        }
        const versionId = await latestVersionId(sql, area, slug);
        await sql.begin(async (tx) => {
          const [dismissed] = await tx<{ id: string }[]>`
            update content_approval set dismissed_at = now()
            where area = ${area} and slug = ${slug}
              and approver_user_id = ${target} and dismissed_at is null
            returning id
          `;
          if (dismissed) {
            await logEvent(tx, area, slug, "approval-dismissed", actor, versionId, {
              reviewer_user_id: target,
            });
          }
        });
        const draft = await loadDraftSummary(sql, area, slug);
        return create(DismissApprovalResponseSchema, { draft: draft ?? undefined });
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

        // Transition to RELEASED (logs the approved->released state event via
        // transition()), then set the sticky published latch and log `released`.
        // Was this a first release or a re-release after a reopen? `republished`
        // when the latch was already set.
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
      // Each reviewer is addressed by user id and must be REGISTERED (have a
      // user_identity row) AND on the allowlist; an off-list or unregistered
      // target is rejected so a request always addresses a real reviewer.
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
            const userId = target.userId?.trim() || null;
            if (!userId) {
              throw new ConnectError("each reviewer needs a user id", Code.InvalidArgument);
            }
            // Registered? (an unregistered id has no user_identity row / FK target)
            const [ident] = await tx<{ github_login: string | null }[]>`
              select github_login from user_identity where user_id = ${userId} limit 1
            `;
            if (!ident) {
              throw new ConnectError(
                `reviewer ${userId} has not signed in`,
                Code.FailedPrecondition,
              );
            }
            const role = await lookupRole(tx, { userId });
            if (role === Role.ANONYMOUS) {
              throw new ConnectError(
                `reviewer ${ident.github_login ?? userId} is not on the allowlist`,
                Code.FailedPrecondition,
              );
            }
            const [row] = await tx<ReviewRequestRow[]>`
              insert into review_request
                (area, slug, reviewer_user_id, requirement, requested_by, note)
              values (${area}, ${slug}, ${userId}, ${requirement}, ${actor}, ${req.note ?? null})
              returning *,
                (select github_login from user_identity where user_id = ${userId}) as reviewer_login,
                (select name from user_identity where user_id = ${userId}) as reviewer_name
            `;
            rows.push(row);
            await logEvent(tx, area, slug, "review-requested", actor, versionId, {
              request_id: row.id,
              reviewer_login: ident.github_login ?? undefined,
              reviewer_user_id: userId,
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
          select rq.*, ui.github_login as reviewer_login, ui.name as reviewer_name
          from review_request rq
          left join user_identity ui on ui.user_id = rq.reviewer_user_id
          where rq.id = ${req.requestId}
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
            where id = ${req.requestId}
            returning *,
              (select github_login from user_identity where user_id = review_request.reviewer_user_id) as reviewer_login,
              (select name from user_identity where user_id = review_request.reviewer_user_id) as reviewer_name
          `;
          const versionId = await latestVersionId(tx, existing.area, existing.slug);
          await logEvent(tx, existing.area, existing.slug, "request-cancelled", actor, versionId, {
            request_id: existing.id,
            reviewer_login: existing.reviewer_login ?? undefined,
            reviewer_user_id: existing.reviewer_user_id,
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
        // Inbox ("requests to me") is an exact user-id match — a GitHub rename
        // never breaks it. "\0" is an unmatchable sentinel for an id-less viewer.
        const mineUserId = req.mine ? (viewer.userId ?? "\0") : null;
        const byMe = req.byMe ? actorId(viewer) : null;
        const rows = await sql<ReviewRequestRow[]>`
          select rq.*, ui.github_login as reviewer_login, ui.name as reviewer_name
          from review_request rq
          left join user_identity ui on ui.user_id = rq.reviewer_user_id
          where (${area}::text is null or (rq.area = ${area} and rq.slug = ${slug}))
            and (${mineUserId}::text is null or rq.reviewer_user_id = ${mineUserId})
            and (${byMe}::text is null or rq.requested_by = ${byMe})
            and (${req.openOnly ?? false} = false or rq.status = 'open')
          order by rq.id desc
        `;
        return create(ListReviewRequestsResponseSchema, {
          requests: rows.map(reviewRequestFromRow),
        });
      },

      // The review timeline for one artifact (most-recent first). Allowlist-gated.
      // Version add/revise markers are NOT stored here — the client derives them
      // from content_version. Legacy content-revised rows are filtered out.
      async listContentEvents(req: ListContentEventsRequest, ctx) {
        requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const limit = Math.min(Math.max(req.limit ?? CONTENT_EVENTS_DEFAULT, 1), CONTENT_EVENTS_MAX);
        const rows = await sql<ContentEventRow[]>`
          select * from content_event
          where area = ${area} and slug = ${req.ref.slug}
            and kind <> 'content-revised'
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
        requireSiteAdmin(ctx);
        const actor = getViewer(ctx).login ?? "unknown";
        const sql = db();
        if (!req.entry) throw new ConnectError("entry is required", Code.InvalidArgument);
        const userId = req.entry.userId?.trim() || null;
        if (!userId) {
          throw new ConnectError("entry needs a user_id", Code.InvalidArgument);
        }

        if (req.action === ManageAllowlistRequest_Action.ADD) {
          if (req.entry.role === Role.UNSPECIFIED || req.entry.role === Role.ANONYMOUS) {
            throw new ConnectError(
              "role must be REVIEWER or MAINTAINER",
              Code.InvalidArgument,
            );
          }
          const role = req.entry.role === Role.MAINTAINER ? "maintainer" : "reviewer";
          // Registered-only: the user must have a user_identity row (the allowlist
          // FK requires it), so a maintainer can't grant access to someone who has
          // never signed in.
          const [ident] = await sql<{ user_id: string }[]>`
            select user_id from user_identity where user_id = ${userId} limit 1
          `;
          if (!ident) {
            throw new ConnectError(
              "user must have signed in before being added",
              Code.FailedPrecondition,
            );
          }
          // Demoting the last maintainer to reviewer would empty the allowlist of
          // maintainers — block it (see removesLastMaintainer).
          const [existing] = await sql<{ role: string }[]>`
            select role from reviewer_allowlist where user_id = ${userId} limit 1
          `;
          if (
            existing &&
            removesLastMaintainer(
              await maintainerCount(sql),
              existing.role === "maintainer",
              role !== "maintainer",
            )
          ) {
            throw new ConnectError("cannot demote the last maintainer", Code.FailedPrecondition);
          }
          // Upsert by user id: ADD doubles as a role change.
          await sql`
            insert into reviewer_allowlist (user_id, role, added_by)
            values (${userId}, ${role}, ${actor})
            on conflict (user_id) do update set role = ${role}
          `;
        } else if (req.action === ManageAllowlistRequest_Action.REMOVE) {
          // Block removing the last maintainer before deleting anything.
          const [target] = await sql<{ role: string }[]>`
            select role from reviewer_allowlist where user_id = ${userId} limit 1
          `;
          if (
            target &&
            removesLastMaintainer(await maintainerCount(sql), target.role === "maintainer", true)
          ) {
            throw new ConnectError("cannot remove the last maintainer", Code.FailedPrecondition);
          }
          await sql`delete from reviewer_allowlist where user_id = ${userId}`;
        } else {
          throw new ConnectError("unknown allowlist action", Code.InvalidArgument);
        }

        const entries = await sql<{ user_id: string; role: string }[]>`
          select user_id, role from reviewer_allowlist order by created_at
        `;
        return create(ManageAllowlistResponseSchema, {
          entries: entries.map((e) =>
            create(AllowlistEntrySchema, {
              userId: e.user_id,
              role: roleFromDb(e.role),
            }),
          ),
        });
      },

      // Read the allowlist with resolved display attributes + audit metadata
      // (added_by/created_at), without the mutation ManageAllowlist required to
      // see it. Joins user_identity for display. Site-admin-only.
      async listAllowlist(_req, ctx) {
        requireSiteAdmin(ctx);
        const sql = db();
        const rows = await sql<
          {
            user_id: string;
            github_login: string | null;
            email: string | null;
            name: string | null;
            role: string;
            added_by: string | null;
            created_at: Date;
          }[]
        >`
          select a.user_id, ui.github_login, ui.email, ui.name,
                 a.role, a.added_by, a.created_at
          from reviewer_allowlist a
          left join user_identity ui on ui.user_id = a.user_id
          order by a.role, a.created_at
        `;
        return create(ListAllowlistResponseSchema, {
          entries: rows.map((r) =>
            create(AllowlistEntryDetailSchema, {
              userId: r.user_id,
              githubLogin: r.github_login ?? undefined,
              email: r.email ?? undefined,
              name: r.name ?? undefined,
              role: roleFromDb(r.role),
              addedBy: r.added_by ?? undefined,
              createdAt: timestampFromDate(r.created_at),
            }),
          ),
        });
      },

      // Allowlisted-scoped typeahead over registered users (user_identity),
      // joined to their allowlist role. Powers the reviewer/allowlist pickers.
      // `allowlistedOnly` restricts to reviewers/maintainers (for the review-
      // request picker, which can only target allowlisted reviewers).
      async searchUsers(req: SearchUsersRequest, ctx) {
        requireAllowlisted(ctx);
        const sql = db();
        const q = req.query?.trim() ?? "";
        const like = `%${q}%`;
        const limit = Math.min(Math.max(req.limit ?? 10, 1), 50);
        const allowlistedOnly = req.allowlistedOnly ?? false;
        const rows = await sql<
          {
            user_id: string;
            github_login: string | null;
            name: string | null;
            email: string | null;
            avatar_url: string | null;
            role: string | null;
          }[]
        >`
          select ui.user_id, ui.github_login, ui.name, ui.email, ui.avatar_url, a.role
          from user_identity ui
          left join reviewer_allowlist a on a.user_id = ui.user_id
          where (${q} = '' or ui.github_login ilike ${like}
                 or ui.name ilike ${like} or ui.email ilike ${like})
            and (${allowlistedOnly} = false or a.role is not null)
          order by ui.github_login nulls last, ui.name nulls last
          limit ${limit}
        `;
        return create(SearchUsersResponseSchema, {
          users: rows.map((r) =>
            create(UserSummarySchema, {
              userId: r.user_id,
              githubLogin: r.github_login ?? undefined,
              name: r.name ?? undefined,
              email: r.email ?? undefined,
              avatarUrl: r.avatar_url ?? undefined,
              role: roleFromDb(r.role),
            }),
          ),
        });
      },

      // Everyone who has logged in (has a user_identity row), joined to their
      // resolved allowlist role — so a site admin can find people who logged in
      // but never got a status and grant them access. Reads our own
      // user_identity table (no GitHub API, no neon_auth probe), so it also works
      // under the local mock provider. Site-admin-only.
      async listRegisteredUsers(_req, ctx) {
        requireSiteAdmin(ctx);
        const sql = db();
        const rows = await sql<
          {
            user_id: string;
            github_login: string | null;
            name: string | null;
            email: string | null;
            role: string | null;
            last_seen_at: Date | null;
          }[]
        >`
          select ui.user_id, ui.github_login, ui.name, ui.email,
                 a.role, ui.updated_at as last_seen_at
          from user_identity ui
          left join reviewer_allowlist a on a.user_id = ui.user_id
          order by ui.email nulls last
        `;
        return create(ListRegisteredUsersResponseSchema, {
          users: rows.map((r) =>
            create(RegisteredUserSchema, {
              userId: r.user_id,
              githubLogin: r.github_login ?? undefined,
              name: r.name ?? undefined,
              email: r.email ?? undefined,
              role: roleFromDb(r.role),
              lastSeenAt: r.last_seen_at ? timestampFromDate(r.last_seen_at) : undefined,
            }),
          ),
        });
      },

      async eraseUser(req: EraseUserRequest, ctx) {
        requireSiteAdmin(ctx);
        const sql0 = db();
        let userId = req.userId?.trim() || null;
        const login = req.login?.trim() || null;
        if (!userId && !login) {
          throw new ConnectError("user_id or login is required", Code.InvalidArgument);
        }
        // Everything keys on the stable user id now; resolve a login to its id.
        if (!userId && login) {
          const [ident] = await sql0<{ user_id: string }[]>`
            select user_id from user_identity where lower(github_login) = lower(${login}) limit 1
          `;
          userId = ident?.user_id ?? null;
          if (!userId) {
            throw new ConnectError(`no registered user for login ${login}`, Code.NotFound);
          }
        }
        // The tombstone keeps thread structure legible after erasure (hard-delete
        // would cascade via parent_id and take others' replies with it).
        const TOMBSTONE = "deleted-user";

        // One transaction so a user is never left half-erased.
        const counts = await db().begin(async (sql) => {
          // Tombstone content + identity but keep the row + its edges.
          const tombstoned = await sql`
            update comment set
              author_login = ${TOMBSTONE},
              author_user_id = ${TOMBSTONE},
              author_name = null,
              body_md = '[removed]'
            where author_user_id = ${userId}
          `;
          const reviewStates = await sql`
            update review_state set actor_user_id = ${TOMBSTONE}
            where actor_user_id = ${userId}
          `;
          const resolutions = await sql`
            update comment_resolution set resolved_by = ${TOMBSTONE}
            where resolved_by = ${userId}
          `;
          // Approvals carry the reviewer's user id. The approval FK to
          // user_identity means we can't null it without dropping the row, so
          // reassign it to a shared tombstone identity row (created below) — the
          // approval still counts toward the derived state but is anonymized.
          await sql`
            insert into user_identity (user_id, github_login, name, email)
            values (${TOMBSTONE}, null, 'Deleted user', null)
            on conflict (user_id) do nothing
          `;
          await sql`
            update content_approval set approver_user_id = ${TOMBSTONE}
            where approver_user_id = ${userId}
          `;
          // An OPEN review request can only ever be satisfied by that reviewer
          // approving. Once they're erased no one can satisfy it, so a required
          // one would block release forever — cancel any still-open request
          // addressed to them. Then reassign the FK to the tombstone so the
          // identity row can be scrubbed.
          const requests = await sql`
            update review_request set status = 'cancelled', cancelled_at = now()
            where status = 'open' and reviewer_user_id = ${userId}
          `;
          await sql`
            update review_request set reviewer_user_id = ${TOMBSTONE}
            where reviewer_user_id = ${userId}
          `;
          // Read-state is worthless once the user is gone — hard-delete it.
          const seen = await sql`
            delete from comment_seen where viewer_id = ${userId}
          `;
          // Scrub the identity row's PII but keep it (allowlist FK / references).
          await sql`
            update user_identity
            set github_login = null, github_id = null, name = null, email = null,
                avatar_url = null, updated_at = now()
            where user_id = ${userId}
          `;
          return {
            comments: tombstoned.count,
            reviewStates: reviewStates.count,
            resolutions: resolutions.count,
            requests: requests.count,
            seen: seen.count,
          };
        });

        return create(EraseUserResponseSchema, {
          commentsTombstoned: counts.comments,
          reviewStatesScrubbed: counts.reviewStates,
          resolutionsScrubbed: counts.resolutions,
          requestsCancelled: counts.requests,
          seenRowsDeleted: counts.seen,
        });
      },

      async registerVersion(req: RegisterVersionRequest) {
        assertBuildSecret(req.buildSecret);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const area = areaToDb(req.ref.area);
        const { slug, project, bucket } = req.ref;
        const sql = db();

        // The prior latest version (before this upsert) — its Merkle tree drives
        // the re-anchoring fast path. Version timeline entries (document added /
        // content revised) are DERIVED from content_version rows in the UI, not
        // written as content_event rows.
        const [prior] = await sql<{ id: string; root_hash: string | null; merkle_tree: MerkleNodeJson | null }[]>`
          select id, root_hash, merkle_tree from content_version
          where area = ${area} and slug = ${slug}
          order by created_at desc limit 1
        `;

        const treeJson = req.tree ? merkleNodeToJson(req.tree) : null;
        const [row] = await sql<ContentVersionRow[]>`
          insert into content_version
            (area, slug, project, bucket, content_hash, git_sha, title, frontmatter_status,
             root_hash, merkle_tree, topics)
          values
            (${area}, ${slug}, ${project ?? null}, ${bucket ?? null},
             ${req.contentHash}, ${req.gitSha}, ${req.title}, ${req.frontmatterStatus},
             ${req.rootHash || null}, ${treeJson ? sql.json(treeJson) : null}, ${req.topics})
          on conflict (area, slug, content_hash) do update
            set git_sha = excluded.git_sha,
                title = excluded.title,
                frontmatter_status = excluded.frontmatter_status,
                root_hash = excluded.root_hash,
                merkle_tree = excluded.merkle_tree,
                topics = excluded.topics
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
                  node_hash: s.nodeHash || null,
                  subtree_hash: s.subtreeHash || null,
                  parent_anchor_slug: s.parentAnchorSlug || null,
                  depth_path: s.depthPath || null,
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

        // Sections whose subtree is provably unchanged vs. the prior version:
        // their threads are kept as-is, skipping the fuzzy re-anchor scan. The
        // hash check is a fast path only — the tiers in reanchorThreads remain
        // the correctness fallback, so a hash bug degrades to today's behavior.
        const unchanged = unchangedSlugs(prior?.merkle_tree ?? null, treeJson);

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
          unchanged,
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

      // The version history of one artifact, most-recent first (no trees). The
      // ref-index (area, slug, created_at desc) serves this directly.
      async listVersions(req: ListVersionsRequest, ctx) {
        requireAllowlisted(ctx);
        if (!req.ref) throw new ConnectError("ref is required", Code.InvalidArgument);
        const sql = db();
        const area = areaToDb(req.ref.area);
        const limit = Math.min(Math.max(req.limit ?? CONTENT_EVENTS_DEFAULT, 1), CONTENT_EVENTS_MAX);
        const rows = await sql<ContentVersionRow[]>`
          select id, area, slug, project, bucket, content_hash, git_sha, title,
                 frontmatter_status, root_hash, topics, created_at
          from content_version
          where area = ${area} and slug = ${req.ref.slug}
          order by created_at desc limit ${limit}
        `;
        return create(ListVersionsResponseSchema, {
          versions: rows.map((r) => contentVersionFromRow(r, req.ref!)),
        });
      },

      // One version's full Merkle tree (from the merkle_tree blob), for the
      // interactive tree view + client-side diff.
      async getVersionTree(req: GetVersionTreeRequest, ctx) {
        requireAllowlisted(ctx);
        if (!req.versionId) throw new ConnectError("version_id is required", Code.InvalidArgument);
        const sql = db();
        const [row] = await sql<ContentVersionRow[]>`
          select * from content_version where id = ${req.versionId}
        `;
        if (!row) throw new ConnectError("version not found", Code.NotFound);
        const ref = create(ContentRefSchema, {
          area: areaFromDb(row.area),
          slug: row.slug,
          project: row.project ?? undefined,
          bucket: row.bucket ?? undefined,
        });
        const version = contentVersionFromRow(row, ref);
        return create(GetVersionTreeResponseSchema, { version, tree: version.tree });
      },

      // "What changed for <topic>?" — for every artifact tagged with the topic,
      // diff its latest version against its baseline (at/just before `since`, or
      // the immediately-previous version) and return the changed nodes plus how
      // many open comments sit on changed sections.
      async productChanges(req: ProductChangesRequest, ctx) {
        requireAllowlisted(ctx);
        if (!req.topic) throw new ConnectError("topic is required", Code.InvalidArgument);
        const sql = db();
        const sinceDate = req.since ? new Date(Number(req.since.seconds) * 1000) : null;

        // Latest version per (area, slug) tagged with the topic.
        const latest = await sql<ContentVersionRow[]>`
          select distinct on (area, slug) *
          from content_version
          where topics @> array[${req.topic}]::text[]
          order by area, slug, created_at desc
        `;

        const entries = [];
        let docCount = 0;
        let blogCount = 0;
        for (const cur of latest) {
          if (cur.area === "docs") docCount++;
          else blogCount++;

          // The baseline: the newest version strictly older than `cur` that also
          // satisfies the `since` filter (git sha, version id, or timestamp). With
          // no `since`, it's simply the immediately-previous version.
          const [base] = await sql<ContentVersionRow[]>`
            select * from content_version
            where area = ${cur.area} and slug = ${cur.slug}
              and created_at < ${cur.created_at}
              and (${req.sinceGitSha ?? null}::text is null or git_sha = ${req.sinceGitSha ?? null})
              and (${req.sinceVersionId ?? null}::text is null or id = ${req.sinceVersionId ?? null})
              and (${sinceDate}::timestamptz is null or created_at <= ${sinceDate})
            order by created_at desc limit 1
          `;
          // Review-level diff: compact subtree noise; brand-new artifacts
          // collapse to a single "Document added" summary.
          const diff = reviewDiff(base?.merkle_tree ?? null, cur.merkle_tree ?? null);
          if (diff.length === 0) continue;

          // Open comments sitting on a section whose subtree changed.
          const changedSlugs = diff
            .filter((d) => (d.kind === "heading" || d.kind === "prose") && d.anchorSlug)
            .map((d) => d.anchorSlug as string);
          let openComments = 0;
          if (changedSlugs.length > 0) {
            // Unresolved thread roots (parent_id null, not orphaned, no resolved
            // comment_resolution row) anchored to a changed section.
            const [{ count } = { count: 0 }] = await sql<{ count: number }[]>`
              select count(*)::int as count from comment c
              left join comment_resolution r on r.thread_root_id = c.id
              where c.area = ${cur.area} and c.slug = ${cur.slug}
                and c.parent_id is null and c.orphaned = false
                and coalesce(r.resolved, false) = false
                and c.anchor_slug = any(${changedSlugs})
            `;
            openComments = count;
          }

          const ref = create(ContentRefSchema, {
            area: areaFromDb(cur.area),
            slug: cur.slug,
            project: cur.project ?? undefined,
            bucket: cur.bucket ?? undefined,
          });
          entries.push(
            create(ProductChangeEntrySchema, {
              ref,
              title: cur.title ?? cur.slug,
              latestGitSha: cur.git_sha,
              latestVersionId: cur.id,
              baselineVersionId: base?.id ?? "",
              openCommentCount: openComments,
              changedNodes: diff.map((d) =>
                create(ChangedNodeSchema, {
                  key: d.key,
                  kind: d.kind,
                  change: CHANGE_KIND_BY_DIFF[d.change],
                  label: d.label,
                  anchorSlug: d.anchorSlug,
                }),
              ),
            }),
          );
        }

        return create(ProductChangesResponseSchema, {
          topic: req.topic,
          docCount,
          blogCount,
          entries,
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
/** Map a tree-diff change kind to the proto ChangeKind enum. */
const CHANGE_KIND_BY_DIFF: Record<DiffEntry["change"], ChangeKind> = {
  added: ChangeKind.ADDED,
  removed: ChangeKind.REMOVED,
  modified: ChangeKind.MODIFIED,
  "modified-descendants": ChangeKind.MODIFIED_DESCENDANTS,
  moved: ChangeKind.MOVED,
};

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
 * Load the DERIVED review state for one artifact (the single source of truth,
 * deriveReviewState). Used wherever a handler needs the effective state — e.g.
 * transition() validates against the derived `from`, not the raw last row.
 */
async function loadDerivedState(sql: Sql, area: string, slug: string): Promise<DerivedReviewState> {
  const [row] = await sql<
    {
      frontmatter_status: string | null;
      explicit_outcome: string | null;
      explicit_outcome_at: Date | null;
      pending_required_user_ids: string[] | null;
      has_required_requests: boolean;
      approver_user_ids: string[] | null;
      latest_approval_at: Date | null;
    }[]
  >`
    select
      (select cv.frontmatter_status from content_version cv
        where cv.area = ${area} and cv.slug = ${slug}
        order by cv.created_at desc limit 1) as frontmatter_status,
      (select rs.state from review_state rs
        where rs.area = ${area} and rs.slug = ${slug}
        order by rs.created_at desc limit 1) as explicit_outcome,
      (select rs.created_at from review_state rs
        where rs.area = ${area} and rs.slug = ${slug}
        order by rs.created_at desc limit 1) as explicit_outcome_at,
      (select coalesce(array_agg(rq.reviewer_user_id), '{}')
        from review_request rq
        where rq.area = ${area} and rq.slug = ${slug}
          and rq.requirement = 'required' and rq.status = 'open') as pending_required_user_ids,
      (select exists (select 1 from review_request rq
        where rq.area = ${area} and rq.slug = ${slug}
          and rq.requirement = 'required')) as has_required_requests,
      (select coalesce(array_agg(ca.approver_user_id order by ca.created_at), '{}')
        from content_approval ca
        where ca.area = ${area} and ca.slug = ${slug} and ca.dismissed_at is null) as approver_user_ids,
      (select max(ca.created_at) from content_approval ca
        where ca.area = ${area} and ca.slug = ${slug} and ca.dismissed_at is null) as latest_approval_at
  `;
  const outcome = row?.explicit_outcome;
  const explicitOutcome =
    outcome === "changes-requested" || outcome === "approved" || outcome === "released"
      ? outcome
      : null;
  return deriveReviewState({
    frontmatterStatus: row?.frontmatter_status ?? null,
    explicitOutcome,
    explicitOutcomeAt: row?.explicit_outcome_at ?? null,
    activeApprovals: (row?.approver_user_ids ?? []).map((approverUserId) => ({ approverUserId })),
    latestApprovalAt: row?.latest_approval_at ?? null,
    openRequiredUserIds: row?.pending_required_user_ids ?? [],
    hasRequiredRequests: row?.has_required_requests ?? false,
  });
}

/**
 * Validate + append an EXPLICIT review-state outcome (changes-requested |
 * approved override | released). Returns the effective state. `from` is the
 * DERIVED current state, so the machine is validated against what the artifact
 * effectively is now (deriveReviewState), not just the last stored row. Enforces
 * that RELEASED is only reachable by a maintainer (the caller already did the
 * entry-point auth; this re-checks so no path can release without maintainer).
 * Ordinary approvals go through recordApproval — this no longer satisfies
 * requests. The state insert + timeline event are one transaction.
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
  if (!toDb) {
    // Only the storable explicit outcomes are transitionable; NEEDS_REVIEW/NONE
    // are derived and cannot be set.
    throw new ConnectError("invalid target review state", Code.InvalidArgument);
  }
  if (toDb === "released") requireMaintainer(ctx);

  const sql = db();
  const area = areaToDb(ref.area);
  const current = await loadDerivedState(sql, area, ref.slug);
  const from = DB_BY_DERIVED_STATE[current.state] ?? "none";
  if (from === toDb) return toState; // idempotent no-op — no write, no event
  if (!(ALLOWED_TRANSITIONS[from] ?? []).includes(toDb)) {
    throw new ConnectError(
      `illegal transition ${from} -> ${toDb}`,
      Code.FailedPrecondition,
    );
  }

  // Stamp against the latest version for provenance (nullable if unregistered).
  const versionId = await latestVersionId(sql, area, ref.slug);

  await sql.begin(async (tx) => {
    await tx`
      insert into review_state (area, slug, state, version_id, actor_user_id, note)
      values (${area}, ${ref.slug}, ${toDb}, ${versionId}, ${actor}, ${note ?? null})
    `;
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
