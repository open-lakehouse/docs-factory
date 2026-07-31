// GitHub identity enrichment used at first login to POPULATE our user_identity
// table. neon_auth.account stores GitHub's numeric OAuth "accountId", NOT the
// @handle; we exchange the account's stored "accessToken" for the real login
// (and its verified emails) via GitHub's API. This runs once per user (when
// their user_identity row is absent or has no resolved login), not on every
// request — the read path reads the persisted row. Every call fails soft — a
// network error, revoked token, or missing scope returns null/empty rather than
// throwing, and the numeric id is NEVER stored as a fake login.
import type { Queryable } from "../db.js";

/** GitHub API headers shared by the /user and /user/emails calls. */
function githubHeaders(accessToken: string): HeadersInit {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "docs-factory-review",
  };
}

/**
 * Exchange a GitHub OAuth access token for the account's @handle via /user.
 * Returns null on any failure (network, revoked token, rate limit); the caller
 * then leaves github_login null rather than storing the numeric id as a handle.
 */
async function fetchGithubLogin(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", { headers: githubHeaders(accessToken) });
    if (!res.ok) return null;
    const body = (await res.json()) as { login?: unknown };
    return typeof body.login === "string" && body.login.length > 0 ? body.login : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the account's VERIFIED GitHub emails via /user/emails. Returns [] on any
 * failure (network, or the `user:email` scope not granted) so the caller falls
 * back to the user-row email alone. Only verified addresses are trusted — an
 * unverified email must never grant allowlist access.
 */
async function fetchGithubEmails(accessToken: string): Promise<string[]> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: githubHeaders(accessToken),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { email?: unknown; verified?: unknown }[];
    if (!Array.isArray(body)) return [];
    return body
      .filter((e) => e.verified === true && typeof e.email === "string" && e.email.length > 0)
      .map((e) => e.email as string);
  } catch {
    return [];
  }
}

/** A persisted user_identity row (our resolved mirror of a Neon Auth user). */
export interface UserIdentityRow {
  user_id: string;
  github_login: string | null;
  github_id: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/** Read the persisted user_identity row for a user id, or null if none yet. */
export async function readUserIdentity(
  sql: Queryable,
  userId: string,
): Promise<UserIdentityRow | null> {
  const rows = await sql<UserIdentityRow[]>`
    select user_id, github_login, github_id, name, email, avatar_url
    from user_identity where user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Resolve the GitHub identity for a freshly-seen (or unresolved) user from their
 * neon_auth.account, then UPSERT it into user_identity. This is the one-time
 * GitHub API round-trip: it runs at first login (or when github_login is still
 * null from a prior failed attempt), never on the read path. The numeric account
 * id is stored in github_id — it is NEVER written to github_login (a failed
 * handle resolution leaves github_login null). Returns the persisted row.
 *
 * Fails soft: a GitHub API or DB error still returns a row built from the JWT/
 * neon_auth values, so a validly-authenticated identity is never dropped.
 */
export async function persistUserIdentity(
  sql: Queryable,
  input: {
    userId: string;
    accountId: string | null;
    accessToken: string | null;
    jwtEmail: string | null;
    userRowEmail: string | null;
    name: string | null;
  },
): Promise<UserIdentityRow> {
  const login = input.accessToken ? await fetchGithubLogin(input.accessToken) : null;
  const githubEmails = input.accessToken ? await fetchGithubEmails(input.accessToken) : [];
  // Prefer a GitHub-verified email, then the neon_auth user-row primary, then
  // the JWT email. All are trusted origins for this identity.
  const email = githubEmails[0] ?? input.userRowEmail ?? input.jwtEmail ?? null;
  const avatarUrl = login ? `https://github.com/${login}.png` : null;
  const row: UserIdentityRow = {
    user_id: input.userId,
    github_login: login,
    github_id: input.accountId,
    name: input.name,
    email,
    avatar_url: avatarUrl,
  };
  try {
    // Upsert: never overwrite a resolved github_login with null (coalesce), so a
    // later login whose GitHub call fails can't erase a previously-resolved handle.
    await sql`
      insert into user_identity (user_id, github_login, github_id, name, email, avatar_url, updated_at)
      values (${row.user_id}, ${row.github_login}, ${row.github_id}, ${row.name}, ${row.email}, ${row.avatar_url}, now())
      on conflict (user_id) do update set
        github_login = coalesce(excluded.github_login, user_identity.github_login),
        github_id    = coalesce(excluded.github_id, user_identity.github_id),
        name         = coalesce(excluded.name, user_identity.name),
        email        = coalesce(excluded.email, user_identity.email),
        avatar_url   = coalesce(excluded.avatar_url, user_identity.avatar_url),
        updated_at   = now()
    `;
  } catch {
    // DB write failed — return the in-memory row; the next login retries the upsert.
  }
  return row;
}
