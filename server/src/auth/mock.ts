// Local-only mock auth provider. Reads the persona from the `x-dev-persona`
// request header set by the site's DevPersonaSwitcher, and returns a synthetic
// Viewer. No database, no OAuth — the point is to preview the site as any role
// locally. selectProvider() refuses to load this under NODE_ENV=production.
//
// Header grammar (case-insensitive value):
//   anon                     → anonymous (logged out)
//   reviewer[:<login>]       → allowlisted reviewer  (default login "dev-reviewer")
//   maintainer[:<login>]     → allowlisted maintainer (default login "dev-maintainer")
//   admin[:<login>]          → site admin, implies maintainer (default "dev-admin")
// Missing/unrecognized header → anonymous.

import { db } from "../db.js";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";

export const DEV_PERSONA_HEADER = "x-dev-persona";

/**
 * Upsert a synthetic user_identity row for a mock persona (dev-only), mirroring
 * the prod login-time persistence. This makes any persona typed into the
 * DevPersonaSwitcher appear in SearchUsers immediately, so the reviewer/admin
 * pickers are testable without a real Neon Auth database. Best-effort — a DB
 * error must not break impersonation.
 */
async function registerMockIdentity(userId: string, login: string): Promise<void> {
  try {
    await db()`
      insert into user_identity (user_id, github_login, github_id, name, email, avatar_url, updated_at)
      values (${userId}, ${login}, null, ${`Dev ${login}`}, ${`${login}@example.test`},
              ${`https://github.com/${login}.png`}, now())
      on conflict (user_id) do update set
        github_login = excluded.github_login, updated_at = now()
    `;
  } catch {
    // No DB / migration not applied — the picker just won't find this persona.
  }
}

export const mockProvider: AuthProvider = {
  async verify(header) {
    const raw = header.get(DEV_PERSONA_HEADER)?.trim();
    if (!raw || raw.toLowerCase() === "anon") return anonymousViewer();

    const [kindRaw, loginRaw] = raw.split(":");
    const kind = kindRaw.toLowerCase();
    // Mint a stable synthetic user id + display name per persona so the
    // identity/read-state paths behave as they would with a real Neon Auth user.
    const identity = (login: string) => ({ userId: `mock:${login}`, name: `Dev ${login}` });
    if (kind === "reviewer" || kind === "maintainer") {
      const login = loginRaw?.trim() || `dev-${kind}`;
      const ident = identity(login);
      await registerMockIdentity(ident.userId, login);
      const role = kind === "maintainer" ? Role.MAINTAINER : Role.REVIEWER;
      return viewer(login, role, ident);
    }
    if (kind === "admin") {
      // A site admin implies maintainer (see neon-auth.ts) — mirror that here so
      // /admin and all maintainer affordances are testable under one persona.
      const login = loginRaw?.trim() || "dev-admin";
      const ident = identity(login);
      await registerMockIdentity(ident.userId, login);
      return viewer(login, Role.MAINTAINER, { ...ident, isSiteAdmin: true });
    }
    return anonymousViewer();
  },
};
