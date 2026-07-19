// ReviewService registration. Phase 0 implements only GetViewer (returns the
// resolved viewer, anonymous for now); the router auto-responds `unimplemented`
// for every RPC we omit. Later phases fill in drafts, comments, and review
// state against Postgres (server/src/db.ts).
import { create } from "@bufbuild/protobuf";
import type { ConnectRouter } from "@connectrpc/connect";
import { ReviewService } from "../gen/docs_factory/review/v1/review_service_pb.js";
import { GetViewerResponseSchema } from "../gen/docs_factory/review/v1/review_service_pb.js";
import type { AuthProvider } from "../auth/provider.js";

export function registerReviewService(router: ConnectRouter, auth: AuthProvider): void {
  router.service(ReviewService, {
    async getViewer(_req, ctx) {
      const viewer = await auth.verify(ctx.requestHeader);
      return create(GetViewerResponseSchema, { viewer });
    },
    // ListDrafts, GetDraftContent, ListComments, CreateComment, ResolveThread,
    // UnresolveThread, TransitionReview, ReleaseContent, ManageAllowlist,
    // RegisterVersion — omitted for Phase 0; auto `unimplemented`.
  });
}
