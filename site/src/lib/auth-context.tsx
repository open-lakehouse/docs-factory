// Auth context for the review UI. Resolves the current viewer from the API via
// the generated connect-query getViewer hook (TanStack Query) — the first real
// consumer of the review backend. Components read { viewer, isAllowlisted,
// isMaintainer, isLoading } to gate review affordances.
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { getViewer } from "../gen/docs_factory/review/v1/review_service-ReviewService_connectquery";
import { Role, type Viewer } from "../gen/docs_factory/review/v1/messages_pb";

export interface AuthState {
  viewer?: Viewer;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAllowlisted: boolean;
  isMaintainer: boolean;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  isAllowlisted: false,
  isMaintainer: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery(getViewer, {});
  const viewer = data?.viewer;
  const state: AuthState = {
    viewer,
    isLoading,
    isAuthenticated: viewer?.authenticated ?? false,
    isAllowlisted: viewer?.isAllowlisted ?? false,
    isMaintainer: viewer?.role === Role.MAINTAINER,
  };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
