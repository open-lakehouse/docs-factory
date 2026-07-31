// Auth context for the review UI. Resolves the current viewer from the API via
// the generated connect-query getViewer hook (TanStack Query) — the first real
// consumer of the review backend. Components read { viewer, isAllowlisted,
// isMaintainer, isLoading } to gate review affordances.
//
// It also owns the allowlisted viewer's "view mode": a single three-state enum
// derived from two persisted flags —
//   - "review"       → Site review mode (comment chrome on), see lib/review-mode.
//   - "anon-preview" → View as anonymous: chrome off AND content narrowed to the
//                      published-only set, so a reviewer can validate what an
//                      anonymous visitor sees (see lib/view-mode).
//   - "normal"       → neither (all drafts visible, no chrome).
// The two flags are mutually exclusive by construction (setViewMode writes both
// so only one holds at a time). Two derived booleans expose the mode to consumers:
// `reviewActive` (the single gate the comment chrome short-circuits on) and
// `previewAsAnon` (which content-visibility reads to force the anonymous subset).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { getViewer } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { Role, type Viewer } from "../gen/docs_factory/review/v1/messages_pb";
import { subscribeSession, sessionResolved } from "./auth-actions";
import {
  readReviewMode,
  setReviewMode as persistReviewMode,
  REVIEW_MODE_EVENT,
} from "./review-mode";
import { readAnonPreview, setAnonPreview as persistAnonPreview, VIEW_MODE_EVENT } from "./view-mode";

/** The allowlisted viewer's current view mode (normal browsing by default). */
export type ViewMode = "normal" | "review" | "anon-preview";

export interface AuthState {
  viewer?: Viewer;
  isLoading: boolean;
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
   * The allowlisted viewer's view mode. Always "normal" for non-allowlisted
   * viewers (who never reach the site anyway — see AccessGate).
   */
  viewMode: ViewMode;
  /** Set the view mode (persists both underlying flags coherently + broadcasts). */
  setViewMode: (mode: ViewMode) => void;
  /**
   * The single gate the review chrome checks: view mode is "review". False for
   * anonymous viewers, for reviewers browsing normally, and in anon-preview.
   */
  reviewActive: boolean;
  /**
   * True when an allowlisted viewer is previewing the site as an anonymous
   * visitor would see it. content-visibility reads this to narrow the visible
   * set to the published-only subset (a purely client-side preview).
   */
  previewAsAnon: boolean;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  isAllowlisted: false,
  isMaintainer: false,
  isSiteAdmin: false,
  viewMode: "normal",
  setViewMode: () => {},
  reviewActive: false,
  previewAsAnon: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Gate the viewer query on the Neon Auth session being RESOLVED. The API
  // authenticates via a bearer read from the session store (see auth-actions);
  // that store hydrates asynchronously, so firing getViewer on mount would send
  // a token-less request and resolve to anonymous even for a signed-in user.
  // Subscribe to the store and only enable the query once it has settled (a
  // token is available, or the user is confirmed signed out).
  const [ready, setReady] = useState<boolean>(sessionResolved);
  useEffect(() => subscribeSession(() => setReady(sessionResolved())), []);

  const { data, isLoading } = useQuery(getViewer, {}, { enabled: ready });
  // Until the session resolves the query is disabled (isLoading may be false),
  // so treat "not yet ready" as loading for consumers/AccessGate.
  const viewer = data?.viewer;

  // Two persisted flags behind the single derived `viewMode`. Kept in sync within
  // the tab (StatusMenu writes) and across tabs via their shared CustomEvents,
  // mirroring how review-context subscribes to REVIEW_DISPLAY_MODE_EVENT.
  const [reviewModeOn, setReviewModeState] = useState<boolean>(readReviewMode);
  const [anonPreview, setAnonPreviewState] = useState<boolean>(readAnonPreview);
  useEffect(() => {
    const onReview = (e: Event) => setReviewModeState(Boolean((e as CustomEvent<boolean>).detail));
    const onAnon = (e: Event) => setAnonPreviewState(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(REVIEW_MODE_EVENT, onReview);
    window.addEventListener(VIEW_MODE_EVENT, onAnon);
    return () => {
      window.removeEventListener(REVIEW_MODE_EVENT, onReview);
      window.removeEventListener(VIEW_MODE_EVENT, onAnon);
    };
  }, []);

  // Selecting a mode writes both flags so they never both hold at once.
  const setViewMode = (mode: ViewMode) => {
    const review = mode === "review";
    const anon = mode === "anon-preview";
    setReviewModeState(review);
    setAnonPreviewState(anon);
    persistReviewMode(review);
    persistAnonPreview(anon);
  };

  const isAllowlisted = viewer?.isAllowlisted ?? false;
  // Derive the mode; non-allowlisted viewers are always "normal". anon-preview
  // takes precedence over review if both flags somehow linger (defensive; the
  // setter keeps them exclusive).
  const viewMode: ViewMode = !isAllowlisted
    ? "normal"
    : anonPreview
      ? "anon-preview"
      : reviewModeOn
        ? "review"
        : "normal";

  const state: AuthState = {
    viewer,
    // Loading until the session store has resolved AND the (then-enabled) viewer
    // query has returned, so gates don't flash "signed out" during hydration.
    isLoading: !ready || isLoading,
    isAuthenticated: viewer?.authenticated ?? false,
    isAllowlisted,
    isMaintainer: viewer?.role === Role.MAINTAINER,
    isSiteAdmin: viewer?.isSiteAdmin ?? false,
    viewMode,
    setViewMode,
    reviewActive: viewMode === "review",
    previewAsAnon: viewMode === "anon-preview",
  };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
