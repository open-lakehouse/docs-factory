// Auth context for the review UI. Resolves the current viewer from the API via
// the generated connect-query getViewer hook (TanStack Query) — the first real
// consumer of the review backend. Components read { viewer, isAllowlisted,
// isMaintainer, isLoading } to gate review affordances.
//
// It also owns "Site review mode": the opt-in switch (persisted in localStorage,
// see lib/review-mode) that a reviewer flips to turn the comment chrome on. The
// derived `reviewActive` (= isAllowlisted && reviewModeOn) is the single gate the
// review components short-circuit on — capability AND opt-in in one boolean — so
// a reviewer browses cleanly by default and only sees the review UI on request.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { getViewer } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { Role, type Viewer } from "../gen/docs_factory/review/v1/messages_pb";
import {
  readReviewMode,
  setReviewMode as persistReviewMode,
  REVIEW_MODE_EVENT,
} from "./review-mode";

export interface AuthState {
  viewer?: Viewer;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAllowlisted: boolean;
  isMaintainer: boolean;
  /** Whether the reviewer has opted into Site review mode (persisted). */
  reviewModeOn: boolean;
  /** Toggle Site review mode on/off (persists + broadcasts to other consumers). */
  setReviewMode: (on: boolean) => void;
  /**
   * The single gate the review chrome checks: allowlisted AND review mode on.
   * False for anonymous viewers (never allowlisted) and for reviewers browsing
   * in regular mode.
   */
  reviewActive: boolean;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  isAllowlisted: false,
  isMaintainer: false,
  reviewModeOn: false,
  setReviewMode: () => {},
  reviewActive: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery(getViewer, {});
  const viewer = data?.viewer;

  const [reviewModeOn, setReviewModeState] = useState<boolean>(readReviewMode);
  // Sync within the tab (StatusMenu writes) and across tabs via the shared event,
  // mirroring how review-context subscribes to REVIEW_DISPLAY_MODE_EVENT.
  useEffect(() => {
    const handler = (e: Event) => setReviewModeState(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(REVIEW_MODE_EVENT, handler);
    return () => window.removeEventListener(REVIEW_MODE_EVENT, handler);
  }, []);

  const setReviewMode = (on: boolean) => {
    setReviewModeState(on);
    persistReviewMode(on);
  };

  const isAllowlisted = viewer?.isAllowlisted ?? false;
  const state: AuthState = {
    viewer,
    isLoading,
    isAuthenticated: viewer?.authenticated ?? false,
    isAllowlisted,
    isMaintainer: viewer?.role === Role.MAINTAINER,
    reviewModeOn,
    setReviewMode,
    reviewActive: isAllowlisted && reviewModeOn,
  };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
