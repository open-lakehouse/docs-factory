// Prod auth provider: Neon Auth (GitHub OAuth) + the reviewer allowlist.
//
// Neon Auth is Better Auth. Rather than hand-parse the session cookie and query
// the neon_auth tables ourselves (fragile: cookie name, __Secure- prefix, column
// shapes, token expiry — all owned by Neon), we ask Neon Auth to validate the
// request for us and hand back the user:
//   1. forward the request's Cookie/Authorization header to Neon Auth's
//      GET /api/auth/get-session → { user: { id, email, name }, session } | null
//   2. look the user's email up in reviewer_allowlist → role
// The allowlist half is fully ours; identity + session validation are Neon's.
//
// github_login seeding (optional): get-session doesn't return the GitHub @handle
// (Better Auth keeps provider data in the account table, exposed via
// /api/auth/list-accounts). We best-effort resolve it so the allowlist can be
// keyed by @handle as well as email; if that lookup fails we fall back to email
// only. Everything fails CLOSED (anonymous) — auth is additive, so an unresolved
// session simply sees published content.
import { db } from "../db.js";
import { lookupRole } from "../allowlist.js";
import { Role } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type AuthProvider, anonymousViewer, viewer } from "./provider.js";

interface NeonIdentity {
  /** Stable Neon Auth user id — the key for authorship + read-state. */
  userId: string;
  /** GitHub @handle if resolvable, else the numeric account id, else undefined. */
  login?: string;
  name?: string;
  email?: string;
}

/** Neon Auth base URL (no trailing slash), or undefined until provisioned. */
function authBase(): string | undefined {
  const base = process.env.NEON_AUTH_BASE;
  if (!base) return undefined;
  const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * The auth cookie is HttpOnly, so the browser sends it to our origin but we must
 * relay it to Neon Auth verbatim. Forward Cookie + Authorization only.
 */
function forwardAuthHeaders(header: Headers): HeadersInit {
  const out: Record<string, string> = { accept: "application/json" };
  const cookie = header.get("cookie");
  if (cookie) out.cookie = cookie;
  const auth = header.get("authorization");
  if (auth) out.authorization = auth;
  return out;
}

interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

/** GET /api/auth/get-session → the current user, or null when unauthenticated. */
async function getSession(base: string, header: Headers): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${base}/api/auth/get-session`, {
      headers: forwardAuthHeaders(header),
    });
    // 401/204/empty body all mean "no session".
    if (!res.ok || res.status === 204) return null;
    const body = (await res.json()) as { user?: SessionUser } | null;
    return body?.user?.id ? body.user : null;
  } catch {
    return null;
  }
}

// Per-user-id cache of the resolved GitHub @handle, so list-accounts + the
// GitHub /user call happen once per process per user, not on every request.
const loginCache = new Map<string, string>();

/**
 * Best-effort GitHub @handle for the user via list-accounts → the account's
 * accessToken → GitHub /user. Returns undefined on any failure; the allowlist
 * still matches on email, so a missing handle never blocks a listed user.
 */
async function resolveGithubLogin(
  base: string,
  header: Headers,
  userId: string,
): Promise<string | undefined> {
  const cached = loginCache.get(userId);
  if (cached) return cached;
  try {
    const res = await fetch(`${base}/api/auth/list-accounts`, {
      headers: forwardAuthHeaders(header),
    });
    if (!res.ok) return undefined;
    const accounts = (await res.json()) as
      | { providerId?: string; accessToken?: string | null }[]
      | null;
    const gh = accounts?.find((a) => a.providerId === "github");
    if (!gh?.accessToken) return undefined;
    const login = await fetchGithubLogin(gh.accessToken);
    if (login) loginCache.set(userId, login);
    return login ?? undefined;
  } catch {
    return undefined;
  }
}

/** Exchange a GitHub OAuth access token for the account's @handle via /user. */
async function fetchGithubLogin(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "docs-factory-review",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { login?: unknown };
    return typeof body.login === "string" && body.login.length > 0 ? body.login : null;
  } catch {
    return null;
  }
}

/** Resolve the current request to a Neon identity, or null when not signed in. */
async function resolveIdentity(header: Headers): Promise<NeonIdentity | null> {
  const base = authBase();
  if (!base) return null; // not provisioned → treat as logged out
  const user = await getSession(base, header);
  if (!user) return null;
  const login = await resolveGithubLogin(base, header, user.id);
  return {
    userId: user.id,
    login,
    name: user.name ?? undefined,
    email: user.email ?? undefined,
  };
}

export function createNeonAuthProvider(): AuthProvider {
  return {
    async verify(header) {
      const identity = await resolveIdentity(header);
      if (!identity) return anonymousViewer();
      const role = await lookupRole(db(), identity);
      const ident = { userId: identity.userId, name: identity.name };
      // login is the display handle; fall back to email, then user id.
      const display = identity.login ?? identity.email ?? identity.userId;
      // Authenticated but not allowlisted: known identity, published-only access.
      if (role === Role.ANONYMOUS) {
        return viewer(display, Role.ANONYMOUS, ident);
      }
      return viewer(display, role, ident);
    },
  };
}
