// Auth context for the review UI. Resolves the current viewer from the API via
// the generated connect-query getViewer hook (TanStack Query) — the first real
// consumer of the review backend. Components read { viewer, isAllowlisted,
// isMaintainer, isLoading } to gate review affordances.
//
// `reviewActive` is the gate the reviewer-only chrome checks (review controls,
// timelines, read-state); `canComment` additionally admits invited contributors.

import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { useQuery } from "@connectrpc/connect-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Role, type Viewer, ViewerSchema } from "../gen/docs_factory/review/v1/messages_pb";
import { getViewer } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { sessionResolved, subscribeSession } from "./auth-actions";

export interface AuthState {
  viewer?: Viewer;
  isLoading: boolean;
  /**
   * DEV only: the review API is unreachable (`just preview` without `just dev`).
   * The viewer is then a synthetic local maintainer so content stays browsable;
   * review chrome is off because it needs the API.
   */
  apiOffline: boolean;
  isAuthenticated: boolean;
  isAllowlisted: boolean;
  isMaintainer: boolean;
  /**
   * Site admin (Neon Auth's admin role). Gates the admin panel + allowlist
   * management. A site admin is also a maintainer (isMaintainer is true too), but
   * a plain maintainer is not a site admin.
   */
  isSiteAdmin: boolean;
  /**
   * An external contributor: NOT allowlisted, but holding a scoped grant on at
   * least one piece of content (a review invitation). Such a viewer is admitted
   * by AccessGate and may view+comment the shared content, but sees no drafts
   * dashboard and no maintainer actions. Per-item access is enforced server-side;
   * this flag only drives client admission + comment chrome on the shared item.
   */
  hasScopedGrants: boolean;
  /** Allowlisted with the API reachable: the reviewer-only chrome is on. */
  reviewActive: boolean;
  /**
   * The gate the per-page COMMENT surfaces check (thread rail, selection layer,
   * heading affordance, inline surface, listComments query). True when reviewActive
   * OR when an external contributor holds a scoped grant — the latter can view and
   * comment on the content shared with them, but has no drafts dashboard, no
   * release/approve-transition machinery, and no cross-content timeline (those
   * stay gated on reviewActive / isAllowlisted). The server authorizes each item,
   * so this can be viewer-scoped without knowing the current contentRef.
   */
  canComment: boolean;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  apiOffline: false,
  isAuthenticated: false,
  isAllowlisted: false,
  isMaintainer: false,
  isSiteAdmin: false,
  hasScopedGrants: false,
  reviewActive: false,
  canComment: false,
});

// Client-only stand-in so an author can preview content with no backend. It
// never reaches the server, and every use sits behind import.meta.env.DEV so
// Vite strips it from prod bundles — it cannot admit anyone to a deployed site.
const OFFLINE_VIEWER = import.meta.env.DEV
  ? create(ViewerSchema, {
      authenticated: true,
      login: "local-author",
      name: "Local author",
      role: Role.MAINTAINER,
      isAllowlisted: true,
    })
  : undefined;

export function AuthProvider({ children }: { children: ReactNode }) {
  // Gate the viewer query on the Neon Auth session being RESOLVED. The API
  // authenticates via a bearer read from the session store (see auth-actions);
  // that store hydrates asynchronously, so firing getViewer on mount would send
  // a token-less request and resolve to anonymous even for a signed-in user.
  // Subscribe to the store and only enable the query once it has settled (a
  // token is available, or the user is confirmed signed out).
  const [ready, setReady] = useState<boolean>(sessionResolved);
  useEffect(() => subscribeSession(() => setReady(sessionResolved())), []);

  // No retries in dev: a stopped API should fall back to offline immediately,
  // not after TanStack's retry backoff.
  const { data, isLoading, error } = useQuery(
    getViewer,
    {},
    { enabled: ready, retry: import.meta.env.DEV ? false : undefined },
  );
  const apiOffline =
    import.meta.env.DEV && error != null && ConnectError.from(error).code === Code.Unavailable;
  // Until the session resolves the query is disabled (isLoading may be false),
  // so treat "not yet ready" as loading for consumers/AccessGate.
  const viewer = apiOffline ? OFFLINE_VIEWER : data?.viewer;

  const isAllowlisted = viewer?.isAllowlisted ?? false;
  const reviewActive = isAllowlisted && !apiOffline;

  const state: AuthState = {
    viewer,
    // Loading until the session store has resolved AND the (then-enabled) viewer
    // query has returned, so gates don't flash "signed out" during hydration.
    isLoading: !ready || isLoading,
    apiOffline,
    isAuthenticated: viewer?.authenticated ?? false,
    isAllowlisted,
    isMaintainer: viewer?.role === Role.MAINTAINER,
    isSiteAdmin: viewer?.isSiteAdmin ?? false,
    hasScopedGrants: viewer?.hasScopedGrants ?? false,
    reviewActive,
    canComment: reviewActive || (viewer?.hasScopedGrants ?? false),
  };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
