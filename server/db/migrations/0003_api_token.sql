-- Personal access tokens for agents (the review-feedback CLI / MCP). A token
-- acts as its owner — the viewer is re-derived from the allowlist on every
-- request, so revoking someone's access revokes their tokens too — narrowed to
-- its scopes. Only the sha256 of the secret is stored; `prefix` is the first
-- characters after `dfr_`, for telling tokens apart in the UI.
create table if not exists api_token (
  id           uuid primary key default uuidv7(),
  user_id      text not null,
  name         text not null,
  token_hash   text not null unique,
  prefix       text not null,
  scopes       text[] not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists api_token_user_idx on api_token (user_id) where revoked_at is null;

-- Provenance: the comment was written through a token (an agent acting for the
-- author), not the browser UI.
alter table comment add column if not exists via_agent boolean not null default false;
