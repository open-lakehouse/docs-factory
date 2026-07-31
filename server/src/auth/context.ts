// Per-request viewer plumbing + authorization guards. An interceptor verifies
// the viewer once and stashes it in the Connect context; RPCs read it via
// getViewer(ctx) and enforce with requireAllowlisted / requireMaintainer.
import { Code, ConnectError, createContextKey, type Interceptor } from "@connectrpc/connect";
import { Role, type Viewer } from "../gen/docs_factory/review/v1/messages_pb.js";
import { anonymousViewer, type AuthProvider } from "./provider.js";

const kViewer = createContextKey<Viewer>(anonymousViewer(), { description: "review.viewer" });

/** Interceptor that resolves the viewer once per request from `auth`. */
export function authInterceptor(auth: AuthProvider): Interceptor {
  return (next) => async (req) => {
    // `req.header` carries the incoming request headers in an interceptor.
    const viewer = await auth.verify(req.header);
    req.contextValues.set(kViewer, viewer);
    return next(req);
  };
}

/** The resolved viewer for this request (anonymous if none). */
export function getViewer(ctx: { values: { get: (k: typeof kViewer) => Viewer } }): Viewer {
  return ctx.values.get(kViewer);
}

/** Require an allowlisted viewer (reviewer or maintainer); throws otherwise. */
export function requireAllowlisted(ctx: Parameters<typeof getViewer>[0]): Viewer {
  const v = getViewer(ctx);
  if (!v.isAllowlisted) {
    throw new ConnectError("reviewer access required", Code.PermissionDenied);
  }
  return v;
}

/** Require a maintainer; throws otherwise. */
export function requireMaintainer(ctx: Parameters<typeof getViewer>[0]): Viewer {
  const v = getViewer(ctx);
  if (v.role !== Role.MAINTAINER) {
    throw new ConnectError("maintainer access required", Code.PermissionDenied);
  }
  return v;
}

/**
 * Require a site admin (Neon Auth's admin role); throws otherwise. Gates the
 * admin panel + allowlist management. A site admin also passes requireMaintainer
 * (they're elevated to MAINTAINER on resolution), but a plain maintainer does
 * NOT pass this.
 */
export function requireSiteAdmin(ctx: Parameters<typeof getViewer>[0]): Viewer {
  const v = getViewer(ctx);
  if (!v.isSiteAdmin) {
    throw new ConnectError("site admin access required", Code.PermissionDenied);
  }
  return v;
}
