-- Review & release lifecycle schema. The database is authoritative for review
-- state and comments; git frontmatter carries only the orthogonal authoring
-- `status`. Neon Auth owns neon_auth.user / neon_auth.account — we only
-- reference their ids and join account (provider=github) to resolve a login.
--
-- IDs are time-ordered UUIDv7, generated server-side by Postgres on insert
-- (`default uuidv7()`, native in PostgreSQL 18). Clients never send an id; the
-- handler reads it back via RETURNING. UUIDv7 is naturally sortable by creation
-- time, so it doubles as a stable cursor and avoids enumerable serial ids.

-- One row per (area, slug, content_hash): a rendered content version, registered
-- on each deploy whose body changed. content_hash = sha256 of the body only.
create table if not exists content_version (
  id                 uuid primary key default uuidv7(),
  area               text not null check (area in ('blogs', 'docs')),
  slug               text not null,
  project            text,
  bucket             text,
  content_hash       text not null,
  git_sha            text not null,
  title              text,
  frontmatter_status text,
  created_at         timestamptz not null default now(),
  unique (area, slug, content_hash)
);
create index if not exists content_version_ref_idx
  on content_version (area, slug, created_at desc);

-- Heading-anchored sections of a version. anchor_slug is the rehype-slug id in
-- the rendered DOM; fingerprint is normalized heading text for re-anchoring.
create table if not exists content_section (
  id            uuid primary key default uuidv7(),
  version_id    uuid not null references content_version (id) on delete cascade,
  anchor_slug   text not null,
  fingerprint   text not null,
  heading_text  text not null,
  heading_level int  not null,
  ordinal       int  not null,
  unique (version_id, anchor_slug)
);

-- Append-only review/release state history. Current state = latest row per
-- (area, slug). RELEASED is a DB action, never a frontmatter write.
create table if not exists review_state (
  id            uuid primary key default uuidv7(),
  area          text not null,
  slug          text not null,
  state         text not null check (state in
                  ('none', 'in-review', 'changes-requested', 'approved', 'released')),
  version_id    uuid references content_version (id),
  actor_user_id text not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists review_state_ref_idx
  on review_state (area, slug, created_at desc);

-- Threaded, section-anchored, resolvable comments. Thread roots have parent_id
-- null; nesting is a self-referential tree (assembleThreads walks it N levels
-- deep). When a section disappears from a later version the thread is marked
-- orphaned (section_id null) but retained.
--
-- authored_version_id freezes the content_version a comment was written against,
-- so its git provenance survives re-anchoring (section_id moves forward across
-- versions; authored_version_id does not).
create table if not exists comment (
  id                  uuid primary key default uuidv7(),
  area                text not null,
  slug                text not null,
  section_id          uuid references content_section (id),
  authored_version_id uuid references content_version (id),
  anchor_slug         text not null,
  anchor_fingerprint  text not null,
  parent_id           uuid references comment (id) on delete cascade,
  author_user_id      text not null,
  author_login        text not null,
  body_md             text not null,
  created_at          timestamptz not null default now(),
  edited_at           timestamptz,
  orphaned            boolean not null default false
);
create index if not exists comment_ref_anchor_idx on comment (area, slug, anchor_slug);
create index if not exists comment_parent_idx on comment (parent_id);
-- listComments reads all comments for a (area, slug) ordered by id. Because id
-- is UUIDv7 (time-ordered), this index serves the filter AND the sort with no
-- separate sort step — id order == creation order.
create index if not exists comment_ref_id_idx on comment (area, slug, id);

-- Resolve/unresolve state per thread root (audit-friendly).
create table if not exists comment_resolution (
  thread_root_id uuid primary key references comment (id) on delete cascade,
  resolved       boolean not null default false,
  resolved_by    text,
  resolved_at    timestamptz
);

-- Reviewer allowlist, by github login and/or email.
create table if not exists reviewer_allowlist (
  id           uuid primary key default uuidv7(),
  github_login text,
  email        text,
  role         text not null default 'reviewer' check (role in ('reviewer', 'maintainer')),
  added_by     text,
  created_at   timestamptz not null default now(),
  check (github_login is not null or email is not null)
);
create unique index if not exists reviewer_allowlist_login_idx
  on reviewer_allowlist (lower(github_login));
create unique index if not exists reviewer_allowlist_email_idx
  on reviewer_allowlist (lower(email));
