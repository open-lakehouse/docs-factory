// Pluggable auth provider. The real Neon Auth provider (prod) and the mock
// provider (local dev) are wired in Phase 2; Phase 0 ships an anonymous
// provider so the app boots and GetViewer works end to end.
import { create } from "@bufbuild/protobuf";
import {
  Role,
  ViewerSchema,
  type Viewer,
} from "../gen/docs_factory/review/v1/messages_pb.js";

export interface AuthProvider {
  /**
   * Resolve the current viewer from the request headers (session cookie / JWT
   * in prod, an x-dev-persona header locally). Headers are what a Connect
   * HandlerContext exposes, and are equally available on a fetch Request.
   */
  verify(header: Headers): Promise<Viewer>;
}

/** A logged-out viewer with no allowlist access. */
export function anonymousViewer(): Viewer {
  return create(ViewerSchema, {
    authenticated: false,
    role: Role.ANONYMOUS,
    isAllowlisted: false,
  });
}

/** Phase 0 provider: everyone is anonymous. Replaced in Phase 2. */
export const anonymousProvider: AuthProvider = {
  async verify() {
    return anonymousViewer();
  },
};

/**
 * Select the active provider from AUTH_MODE. Phase 0 only knows "anon"; Phase 2
 * adds "neon" (Neon Auth) and "mock" (local impersonation). The mock provider
 * must never be selectable when AUTH_MODE=neon.
 */
export function selectProvider(): AuthProvider {
  const mode = process.env.AUTH_MODE ?? "anon";
  switch (mode) {
    case "anon":
      return anonymousProvider;
    default:
      // Phase 2 will handle "neon" and "mock". Until then, fail loudly rather
      // than silently granting or denying access.
      throw new Error(`AUTH_MODE='${mode}' is not implemented yet (Phase 2).`);
  }
}
