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
  ManageAllowlistRequest_Action,
  ManageAllowlistResponseSchema,
  RegisterVersionResponseSchema,
  type ListDraftsRequest,
  type GetDraftContentRequest,
  type ManageAllowlistRequest,
  type RegisterVersionRequest,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import {
  AllowlistEntrySchema,
  DraftSummarySchema,
  ContentRefSchema,
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
import { reanchorThreads } from "../anchor.js";

const PUBLISHED = "published";
const REVIEW_STATE_BY_DB: Record<string, ReviewState> = {
  none: ReviewState.NONE,
  "in-review": ReviewState.IN_REVIEW,
  "changes-requested": ReviewState.CHANGES_REQUESTED,
  approved: ReviewState.APPROVED,
  released: ReviewState.RELEASED,
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

        // Latest version per (area, slug), its current review state, and open
        // (unresolved, non-orphaned) thread count. Unpublished rows are shown
        // only to allowlisted viewers.
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
          )
          select l.area, l.slug, l.project, l.bucket, l.title, l.frontmatter_status,
            (select rs.state from review_state rs
              where rs.area = l.area and rs.slug = l.slug
              order by rs.created_at desc limit 1) as review_state,
            (select count(*)::int from comment c
              left join comment_resolution cr on cr.thread_root_id = c.id
              where c.area = l.area and c.slug = l.slug
                and c.parent_id is null and c.orphaned = false
                and coalesce(cr.resolved, false) = false) as open_comments
          from latest l
          where (${areaFilter}::text is null or l.area = ${areaFilter})
            and (${viewer.isAllowlisted} or l.frontmatter_status = ${PUBLISHED})
          order by l.area, l.project nulls first, l.bucket nulls first, l.slug
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
                })),
              )}
          `;
        }

        const orphaned = await reanchorThreads(
          sql,
          area,
          slug,
          req.sections.map((s) => ({ anchorSlug: s.anchorSlug, fingerprint: s.fingerprint })),
        );

        return create(RegisterVersionResponseSchema, {
          version: contentVersionFromRow(row, req.ref),
          orphanedThreadCount: orphaned,
        });
      },
    },
    { interceptors: [authInterceptor(auth)] },
  );
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
