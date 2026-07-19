// ReviewService registration. Implemented so far:
//   - GetViewer      (Phase 0) — resolves the viewer from the auth provider.
//   - RegisterVersion (Phase 1) — build-time upsert of a content version + its
//     section anchors, then re-anchors open comment threads.
// Omitted RPCs auto-respond `unimplemented` via the Connect router.
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb.js";
import {
  GetViewerResponseSchema,
  RegisterVersionResponseSchema,
  type RegisterVersionRequest,
} from "../gen/docs_factory/review/v1/review_service_pb.js";
import type { AuthProvider } from "../auth/provider.js";
import { db } from "../db.js";
import { areaToDb, contentVersionFromRow, type ContentVersionRow } from "../db-map.js";
import { reanchorThreads } from "../anchor.js";

export function registerReviewService(router: ConnectRouter, auth: AuthProvider): void {
  router.service(ReviewService, {
    async getViewer(_req, ctx) {
      const viewer = await auth.verify(ctx.requestHeader);
      return create(GetViewerResponseSchema, { viewer });
    },

    async registerVersion(req: RegisterVersionRequest) {
      assertBuildSecret(req.buildSecret);
      if (!req.ref) {
        throw new ConnectError("ref is required", Code.InvalidArgument);
      }
      const area = areaToDb(req.ref.area);
      const { slug, project, bucket } = req.ref;
      const sql = db();

      // Idempotent upsert keyed on (area, slug, content_hash): a redeploy of
      // unchanged content is a no-op that returns the existing version.
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

      // Replace this version's section rows (the version is immutable by hash,
      // but re-registering should converge on the sent section set).
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

    // ListDrafts, GetDraftContent, ListComments, CreateComment, ResolveThread,
    // UnresolveThread, TransitionReview, ReleaseContent, ManageAllowlist —
    // later phases; auto `unimplemented` until then.
  });
}

/** Reject unless the request's build secret matches BUILD_SECRET (which must be set). */
function assertBuildSecret(provided: string): void {
  const expected = process.env.BUILD_SECRET;
  if (!expected) {
    throw new ConnectError(
      "BUILD_SECRET is not configured on the server",
      Code.FailedPrecondition,
    );
  }
  if (provided !== expected) {
    throw new ConnectError("invalid build secret", Code.PermissionDenied);
  }
}
