// Local-only mock auth provider. Reads the persona from the `x-dev-persona`
// request header set by the site's DevPersonaSwitcher, and returns a synthetic
// Viewer. No database, no OAuth — the point is to preview the site as any role
// locally. selectProvider() refuses to load this under NODE_ENV=production.
//
// Header grammar (case-insensitive value):
//   anon                     → anonymous (logged out)
//   reviewer[:<login>]       → allowlisted reviewer  (default login "dev-reviewer")
//   maintainer[:<login>]     → allowlisted maintainer (default login "dev-maintainer")
// Missing/unrecognized header → anonymous.
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";

export const DEV_PERSONA_HEADER = "x-dev-persona";

export const mockProvider: AuthProvider = {
  async verify(header) {
    const raw = header.get(DEV_PERSONA_HEADER)?.trim();
    if (!raw || raw.toLowerCase() === "anon") return anonymousViewer();

    const [kindRaw, loginRaw] = raw.split(":");
    const kind = kindRaw.toLowerCase();
    // Mint a stable synthetic user id + display name per persona so the
    // identity/read-state paths behave as they would with a real Neon Auth user.
    const identity = (login: string) => ({ userId: `mock:${login}`, name: `Dev ${login}` });
    if (kind === "reviewer") {
      const login = loginRaw?.trim() || "dev-reviewer";
      return viewer(login, Role.REVIEWER, identity(login));
    }
    if (kind === "maintainer") {
      const login = loginRaw?.trim() || "dev-maintainer";
      return viewer(login, Role.MAINTAINER, identity(login));
    }
    return anonymousViewer();
  },
};
