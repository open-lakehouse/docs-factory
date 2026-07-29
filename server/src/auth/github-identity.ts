// GitHub identity enrichment shared by the auth path and the maintainer admin
// discovery view. neon_auth.account stores GitHub's numeric OAuth "accountId",
// NOT the @handle; we exchange the account's stored "accessToken" for the real
// login (and its verified emails) via GitHub's API, memoized per user id so it
// isn't a per-request / per-row network hit. Every call fails soft — a network
// error, revoked token, or missing scope returns the numeric-id / empty
// fallback rather than throwing, so neither auth nor the admin roster breaks.

/**
 * Per-user-id cache of the resolved GitHub @handle, so the /user call happens
 * once per process per user rather than on every request. Sessions are
 * long-lived and a user's login rarely changes, so a plain in-memory map (reset
 * on cold start) is sufficient — no TTL needed for correctness.
 */
const loginCache = new Map<string, string>();

/**
 * Per-user-id cache of the GitHub-verified emails, memoized like loginCache so
 * the /user/emails call happens once per process per user. Never a TTL: emails
 * change rarely and a cold start re-reads them.
 */
const emailsCache = new Map<string, string[]>();

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
 * Returns null on any failure (network, revoked token, rate limit) so the
 * caller can fall back to the numeric id without crashing verification.
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

/**
 * Resolve the GitHub @handle for a user, preferring the memoized value and
 * falling back to the numeric account id when the token can't be exchanged.
 */
export async function resolveLogin(
  userId: string,
  accountId: string,
  accessToken: string | null,
): Promise<string> {
  const cached = loginCache.get(userId);
  if (cached) return cached;
  const login = accessToken ? await fetchGithubLogin(accessToken) : null;
  const resolved = login ?? accountId;
  if (login) loginCache.set(userId, login);
  return resolved;
}

/**
 * All emails to attribute to this user: the Neon Auth user-row primary plus
 * every GitHub-verified address, memoized per user id. `primaryEmail` is always
 * included so the allowlist still works when the /user/emails call fails or the
 * OAuth token lacks the `user:email` scope.
 */
export async function resolveEmails(
  userId: string,
  primaryEmail: string | null,
  accessToken: string | null,
): Promise<string[]> {
  const base = primaryEmail ? [primaryEmail] : [];
  const cached = emailsCache.get(userId);
  if (cached) return [...new Set([...base, ...cached])];
  const github = accessToken ? await fetchGithubEmails(accessToken) : [];
  if (github.length) emailsCache.set(userId, github);
  return [...new Set([...base, ...github])];
}
