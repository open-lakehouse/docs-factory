// Per-request viewer plumbing + authorization guards. An interceptor verifies
// the viewer once and stashes it in the Connect context; RPCs read it via
// getViewer(ctx) and enforce with requireAllowlisted / requireMaintainer.
import { Code, ConnectError, createContextKey, type Interceptor } from "@connectrpc/connect";
import { hasContentGrant } from "../allowlist.js";
import type { Queryable } from "../db.js";
import { Role, type Viewer } from "../gen/docs_factory/review/v1/messages_pb.js";
import { tokenMayCall } from "./api-token.js";
import {
  type Authentication,
  type AuthProvider,
  anonymousViewer,
  type TokenGrant,
} from "./provider.js";

const kViewer = createContextKey<Viewer>(anonymousViewer(), { description: "review.viewer" });
const kToken = createContextKey<TokenGrant | undefined>(undefined, {
  description: "review.token",
});

/**
 * Interceptor that resolves the viewer once per request from `auth`. A request
 * made with a personal access token is also checked against the token's scopes
 * here, before any handler runs, so handlers need no token awareness beyond
 * provenance (getTokenGrant).
 */
export function authInterceptor(auth: AuthProvider): Interceptor {
  return (next) => async (req) => {
    // `req.header` carries the incoming request headers in an interceptor.
    const authn: Authentication = auth.authenticate
      ? await auth.authenticate(req.header)
      : { viewer: await auth.verify(req.header) };
    if (authn.invalidToken) {
      throw new ConnectError("invalid, expired, or revoked access token", Code.Unauthenticated);
    }
    if (authn.token) {
      const message = req.stream ? undefined : req.message;
      if (!tokenMayCall(req.method.name, message, authn.token.scopes)) {
        throw new ConnectError(
          `access tokens may not call ${req.method.name} with these scopes`,
          Code.PermissionDenied,
        );
      }
      req.contextValues.set(kToken, authn.token);
    }
    req.contextValues.set(kViewer, authn.viewer);
    return next(req);
  };
}

/** The personal access token this request used, if any. */
export function getTokenGrant(ctx: {
  values: { get: (k: typeof kToken) => TokenGrant | undefined };
}): TokenGrant | undefined {
  return ctx.values.get(kToken);
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

/**
 * Require access to one piece of content: allowlisted globally, OR holding a
 * scoped grant (a non-cancelled review_request addressed to the viewer for this
 * `(area, slug)`). The async, per-item analogue of requireAllowlisted — used by
 * the handlers an external contributor may call on the content shared with them
 * (view, list/create comments, approve, per-artifact timeline). `area` is
 * db-form ('blogs'|'docs').
 */
export async function requireContentAccess(
  ctx: Parameters<typeof getViewer>[0],
  sql: Queryable,
  area: string,
  slug: string,
): Promise<Viewer> {
  const v = getViewer(ctx);
  if (await hasContentGrant(sql, v, area, slug)) return v;
  throw new ConnectError("content access required", Code.PermissionDenied);
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
