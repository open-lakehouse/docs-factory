// Personal access token management RPCs (CreateApiToken / ListApiTokens /
// RevokeApiToken). Token callers never reach these — tokenMayCall denies them in
// authInterceptor — so a leaked token can't mint a longer-lived successor.
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type HandlerContext } from "@connectrpc/connect";
import { ALL_SCOPES, DEFAULT_TTL_DAYS, generateToken, MAX_TTL_DAYS } from "../auth/api-token.js";
import { getTokenGrant, getViewer } from "../auth/context.js";
import { db } from "../db.js";
import {
  type ApiToken,
  ApiTokenSchema,
  type Viewer,
} from "../gen/docs_factory/review/v1/messages_pb.js";
import {
  type CreateApiTokenRequest,
  CreateApiTokenResponseSchema,
  ListApiTokensResponseSchema,
  type RevokeApiTokenRequest,
  RevokeApiTokenResponseSchema,
} from "../gen/docs_factory/review/v1/review_service_pb.js";

const MAX_NAME_LEN = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  prefix: string;
  created_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
}

function apiTokenFromRow(row: ApiTokenRow): ApiToken {
  return create(ApiTokenSchema, {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    prefix: row.prefix,
    createdAt: timestampFromDate(row.created_at),
    expiresAt: timestampFromDate(row.expires_at),
    lastUsedAt: row.last_used_at ? timestampFromDate(row.last_used_at) : undefined,
  });
}

/**
 * A browser-session viewer who can see some content (allowlisted or holding a
 * scoped grant). Re-checks the token case although the interceptor already
 * denies it, since minting from a token would defeat expiry.
 */
function requireSessionViewer(ctx: HandlerContext): Viewer & { userId: string } {
  if (getTokenGrant(ctx)) {
    throw new ConnectError("tokens can't manage tokens", Code.PermissionDenied);
  }
  const v = getViewer(ctx);
  if (!v.authenticated || !v.userId) {
    throw new ConnectError("sign in to manage access tokens", Code.Unauthenticated);
  }
  if (!v.isAllowlisted && !v.hasScopedGrants) {
    throw new ConnectError("reviewer access required", Code.PermissionDenied);
  }
  return v as Viewer & { userId: string };
}

/** Validate + normalize requested scopes (deduped, known, non-empty). */
export function normalizeScopes(scopes: readonly string[]): string[] {
  const out = [...new Set(scopes.map((s) => s.trim()).filter(Boolean))];
  if (!out.length) throw new ConnectError("at least one scope is required", Code.InvalidArgument);
  const unknown = out.filter((s) => !ALL_SCOPES.includes(s));
  if (unknown.length) {
    throw new ConnectError(`unknown scope(s): ${unknown.join(", ")}`, Code.InvalidArgument);
  }
  return out;
}

export function normalizeTtlDays(ttl: number | undefined): number {
  if (ttl === undefined || ttl === 0) return DEFAULT_TTL_DAYS;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_DAYS) {
    throw new ConnectError(`ttl_days must be 1..${MAX_TTL_DAYS}`, Code.InvalidArgument);
  }
  return ttl;
}

export const apiTokenHandlers = {
  async createApiToken(req: CreateApiTokenRequest, ctx: HandlerContext) {
    const viewer = requireSessionViewer(ctx);
    const name = req.name.trim();
    if (!name || name.length > MAX_NAME_LEN) {
      throw new ConnectError(`name must be 1..${MAX_NAME_LEN} characters`, Code.InvalidArgument);
    }
    const scopes = normalizeScopes(req.scopes);
    const ttlDays = normalizeTtlDays(req.ttlDays);
    const { token, hash, prefix } = generateToken();
    const sql = db();
    const [row] = await sql<ApiTokenRow[]>`
      insert into api_token (user_id, name, token_hash, prefix, scopes, expires_at)
      values (${viewer.userId}, ${name}, ${hash}, ${prefix}, ${scopes},
              now() + make_interval(days => ${ttlDays}))
      returning id, name, scopes, prefix, created_at, expires_at, last_used_at
    `;
    return create(CreateApiTokenResponseSchema, { token, apiToken: apiTokenFromRow(row) });
  },

  async listApiTokens(_req: unknown, ctx: HandlerContext) {
    const viewer = requireSessionViewer(ctx);
    const rows = await db()<ApiTokenRow[]>`
      select id, name, scopes, prefix, created_at, expires_at, last_used_at
      from api_token
      where user_id = ${viewer.userId} and revoked_at is null
      order by created_at desc
    `;
    return create(ListApiTokensResponseSchema, { tokens: rows.map(apiTokenFromRow) });
  },

  async revokeApiToken(req: RevokeApiTokenRequest, ctx: HandlerContext) {
    const viewer = requireSessionViewer(ctx);
    if (!UUID_RE.test(req.id)) throw new ConnectError("token not found", Code.NotFound);
    const rows = await db()`
      update api_token set revoked_at = now()
      where id = ${req.id} and user_id = ${viewer.userId} and revoked_at is null
      returning id
    `;
    if (!rows.length) throw new ConnectError("token not found", Code.NotFound);
    return create(RevokeApiTokenResponseSchema, {});
  },
};
