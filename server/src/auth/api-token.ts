// Personal access tokens: the credential agents (the review-feedback CLI / MCP)
// use in place of the 15-minute browser JWT. A token is a bearer `dfr_<secret>`;
// only its sha256 is stored. It authenticates as its OWNER — the Viewer is
// re-derived from the allowlist on every request via the same path the JWT uses,
// so a token never outlives or exceeds its owner's access — and is then narrowed
// to its scopes by tokenMayCall, enforced in authInterceptor.
import { createHash, randomBytes } from "node:crypto";
import { db, type Queryable } from "../db.js";
import type { Viewer } from "../gen/docs_factory/review/v1/messages_pb.js";
import { type Authentication, type AuthProvider, anonymousViewer } from "./provider.js";

export const TOKEN_PREFIX = "dfr_";

export const SCOPE_READ = "feedback:read";
export const SCOPE_REPLY = "feedback:reply";
export const ALL_SCOPES: readonly string[] = [SCOPE_READ, SCOPE_REPLY];

export const DEFAULT_TTL_DAYS = 90;
export const MAX_TTL_DAYS = 365;

/** Characters of the secret kept in `api_token.prefix` for display. */
const DISPLAY_PREFIX_LEN = 8;

/** RPCs a `feedback:read` token may call. All read-only. */
const READ_METHODS = new Set([
  "GetViewer",
  "ListDrafts",
  "GetDraftContent",
  "ListComments",
  "ListRecentComments",
  "GetSourceFile",
  "ListVersions",
]);

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): { token: string; hash: string; prefix: string } {
  const secret = randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}${secret}`;
  return { token, hash: hashToken(token), prefix: secret.slice(0, DISPLAY_PREFIX_LEN) };
}

/** The `dfr_` bearer from the Authorization header, if that's what was sent. */
export function apiTokenFromHeader(header: Headers): string | undefined {
  const auth = header.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return undefined;
  const bearer = auth.slice(7).trim();
  return bearer.startsWith(TOKEN_PREFIX) ? bearer : undefined;
}

/**
 * Whether a token holding `scopes` may call `method` with `message`. Replies
 * are the only write: a token can't open a new thread (no `parentId`), resolve,
 * approve, release, administer, or manage tokens. Anything not listed is denied,
 * so a newly added RPC is token-inaccessible until deliberately allowed here.
 */
export function tokenMayCall(method: string, message: unknown, scopes: readonly string[]): boolean {
  if (READ_METHODS.has(method)) return scopes.includes(SCOPE_READ);
  if (method === "CreateComment") {
    const parentId = (message as { parentId?: string } | undefined)?.parentId;
    return scopes.includes(SCOPE_REPLY) && !!parentId;
  }
  return false;
}

/** The token owner's identity, as persisted in user_identity. */
export interface TokenOwner {
  userId: string;
  login: string;
  name?: string;
}

/** Builds the owner's Viewer the same way the session provider would. */
export type ViewerForOwner = (owner: TokenOwner) => Promise<Viewer>;

interface TokenRow {
  id: string;
  user_id: string;
  scopes: string[];
  github_login: string | null;
  name: string | null;
}

/** Bumps last_used_at at most this often, keeping a write off most requests. */
const LAST_USED_THROTTLE = "5 minutes";

async function lookupToken(sql: Queryable, token: string): Promise<TokenRow | undefined> {
  const [row] = await sql<TokenRow[]>`
    select t.id, t.user_id, t.scopes, ui.github_login, ui.name
    from api_token t
    left join user_identity ui on ui.user_id = t.user_id
    where t.token_hash = ${hashToken(token)}
      and t.revoked_at is null and t.expires_at > now()
  `;
  if (row) {
    await sql`
      update api_token set last_used_at = now()
      where id = ${row.id}
        and (last_used_at is null or last_used_at < now() - ${LAST_USED_THROTTLE}::interval)
    `;
  }
  return row;
}

/**
 * Wrap a session provider so it also accepts personal access tokens. A `dfr_`
 * bearer never falls through to `inner`: an unknown, expired, or revoked token
 * is reported as `invalidToken` so the caller gets Unauthenticated (and the CLI
 * can say "log in again") instead of silently becoming anonymous.
 */
export function withApiTokens(
  inner: AuthProvider,
  viewerForOwner: ViewerForOwner,
  sql: () => Queryable = db,
): AuthProvider {
  async function authenticate(header: Headers): Promise<Authentication> {
    const token = apiTokenFromHeader(header);
    if (!token) return { viewer: await inner.verify(header) };
    const row = await lookupToken(sql(), token);
    if (!row) return { viewer: anonymousViewer(), invalidToken: true };
    const viewer = await viewerForOwner({
      userId: row.user_id,
      login: row.github_login ?? row.user_id,
      name: row.name ?? undefined,
    });
    viewer.viaAgent = true;
    return { viewer, token: { tokenId: row.id, scopes: row.scopes } };
  }
  return {
    authenticate,
    async verify(header) {
      return (await authenticate(header)).viewer;
    },
  };
}
