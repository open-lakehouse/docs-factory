// Pluggable auth provider. Prod uses Neon Auth + the reviewer allowlist; local
// dev uses a mock provider driven by an x-dev-persona header (the dev
// impersonation switcher) so both logged-in and logged-out perspectives are
// testable with no GitHub OAuth. The mock provider is NEVER selectable under
// AUTH_MODE=neon — that guard is a security invariant, not a convenience.
import { create } from "@bufbuild/protobuf";
import { Role, ViewerSchema, type Viewer } from "../gen/docs_factory/review/v1/messages_pb.js";

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

/** Optional stable-identity fields carried alongside a viewer's login/role. */
export interface ViewerIdentity {
  /** Stable Neon Auth user id (keys authorship + read-state across renames). */
  userId?: string;
  /** Display name for the UI (falls back to the login when absent). */
  name?: string;
}

/** An authenticated viewer at the given role (allowlisted iff not anonymous). */
export function viewer(login: string, role: Role, identity: ViewerIdentity = {}): Viewer {
  return create(ViewerSchema, {
    authenticated: true,
    login,
    role,
    isAllowlisted: role === Role.REVIEWER || role === Role.MAINTAINER,
    userId: identity.userId,
    name: identity.name,
  });
}

/** Everyone is anonymous — the safe default when no auth mode is configured. */
export const anonymousProvider: AuthProvider = {
  async verify() {
    return anonymousViewer();
  },
};

/**
 * Select the active provider from AUTH_MODE:
 *   - "neon" (prod)  → Neon Auth + allowlist. Mock is refused here.
 *   - "mock" (local) → x-dev-persona impersonation. Refused unless dev.
 *   - "anon"         → everyone anonymous (default).
 * Async because the neon provider needs the DB-backed allowlist lookup.
 */
export async function selectProvider(): Promise<AuthProvider> {
  const mode = process.env.AUTH_MODE ?? "anon";
  switch (mode) {
    case "anon":
      return anonymousProvider;
    case "mock": {
      // Hard guard: a mock identity must never be mintable in a prod-like run.
      if (process.env.NODE_ENV === "production") {
        throw new Error("AUTH_MODE=mock is forbidden when NODE_ENV=production.");
      }
      const { mockProvider } = await import("./mock.js");
      return mockProvider;
    }
    case "neon": {
      const { createNeonAuthProvider } = await import("./neon-auth.js");
      return createNeonAuthProvider();
    }
    default:
      throw new Error(`unknown AUTH_MODE='${mode}' (expected neon | mock | anon).`);
  }
}
