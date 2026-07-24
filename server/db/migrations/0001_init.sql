-- Review & release lifecycle schema. The database is authoritative for review
-- state and comments; git frontmatter carries only the orthogonal authoring
-- `status`. Neon Auth owns neon_auth.user / neon_auth.account — we only
-- reference their ids and join account (provider=github) to resolve a login.
--
-- IDs are time-ordered UUIDv7, generated server-side by Postgres on insert
-- (`default uuidv7()`, native in PostgreSQL 18). Clients never send an id; the
-- handler reads it back via RETURNING. UUIDv7 is naturally sortable by creation
-- time, so it doubles as a stable cursor and avoids enumerable serial ids.
--
-- This is the single authoritative base migration. There is no data to
-- preserve (local dev purges the DB, prod is not yet deployed), so the schema
-- is declared in its final shape rather than as a chain of additive migrations.

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
-- plain_text is the normalized section body so the server can re-anchor quote
-- comments (find the quote in a new version) without re-fetching source.
create table if not exists content_section (
  id            uuid primary key default uuidv7(),
  version_id    uuid not null references content_version (id) on delete cascade,
  anchor_slug   text not null,
  fingerprint   text not null,
  heading_text  text not null,
  heading_level int  not null,
  ordinal       int  not null,
  plain_text    text not null default '',
  char_len      int,
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

-- RevOps pipeline metadata, one row per (area, slug). Distinct from the
-- append-only version/review history: priority and target date are editorial
-- decisions set from the review app, not derived from git or a build. priority
-- is an ordered rank (lower = higher priority; null = unranked);
-- target_release_date is the intended ship date (date-only).
--
-- published is a sticky publication latch, decoupled from review_state: anonymous
-- visibility is (frontmatter_status = 'ready' AND published = true). It is set
-- true on release and cleared only by an explicit unpublish, so a released
-- artifact can be reopened for changes (review_state -> changes-requested)
-- without dropping out of public view unless a maintainer chooses to unpublish.
create table if not exists content_revops (
  area                text not null check (area in ('blogs', 'docs')),
  slug                text not null,
  priority            int,
  target_release_date date,
  published           boolean not null default false,
  updated_by          text,
  updated_at          timestamptz not null default now(),
  primary key (area, slug)
);
create index if not exists content_revops_priority_idx
  on content_revops (area, priority);

-- Threaded, section-anchored, resolvable comments. Thread roots have parent_id
-- null; nesting is a self-referential tree (assembleThreads walks it N levels
-- deep). When a section disappears from a later version the thread is marked
-- orphaned (section_id null) but retained.
--
-- authored_version_id freezes the content_version a comment was written against,
-- so its git provenance survives re-anchoring (section_id moves forward across
-- versions; authored_version_id does not).
--
-- Identity: author_user_id is the stable Neon Auth user.id (keying, survives a
-- GitHub login rename); author_login is the GitHub login (display + avatar via
-- github.com/<login>.png); author_name is a cached display-name snapshot so a
-- historical comment renders stably even if the profile later changes.
--
-- A comment carries at most one fine-grained selector: `selector_*` pins to a
-- quoted prose range within the section; `code_*` pins to a line/region in a
-- snippet's source file. All null = a plain heading-level comment.
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
  author_name         text,
  body_md             text not null,
  created_at          timestamptz not null default now(),
  edited_at           timestamptz,
  orphaned            boolean not null default false,
  selector_quote      text,
  selector_prefix     text,
  selector_suffix     text,
  selector_start      int,
  code_path           text,
  code_region         text,
  code_line           int,
  code_end_line       int,
  code_line_hash      text,
  code_file_hash      text
);
create index if not exists comment_ref_anchor_idx on comment (area, slug, anchor_slug);
create index if not exists comment_parent_idx on comment (parent_id);
-- listComments reads all comments for a (area, slug) ordered by id. Because id
-- is UUIDv7 (time-ordered), this index serves the filter AND the sort with no
-- separate sort step — id order == creation order.
create index if not exists comment_ref_id_idx on comment (area, slug, id);
-- Code comments are queried by their source path when re-anchoring.
create index if not exists comment_code_path_idx on comment (area, slug, code_path);

-- Resolve/unresolve state per thread root (audit-friendly).
create table if not exists comment_resolution (
  thread_root_id uuid primary key references comment (id) on delete cascade,
  resolved       boolean not null default false,
  resolved_by    text,
  resolved_at    timestamptz
);

-- Per-viewer read watermark, one row per (viewer, thread root). A thread is
-- unread when any comment in it has created_at > seen_at (or no row exists).
-- viewer_id is the stable Neon Auth user.id — attribution is intentional
-- (employees log in via GitHub OAuth), so no HMAC/secret keying is needed.
-- Erasure (EraseUser) hard-deletes a user's rows here.
create table if not exists comment_seen (
  viewer_id      text        not null,
  thread_root_id uuid        not null references comment (id) on delete cascade,
  seen_at        timestamptz not null,
  primary key (viewer_id, thread_root_id)
);

-- Resolved `file=` snippet references per version. Used to re-anchor code
-- comments (region present -> line-hash -> orphan) and to back the
-- "open full source" review pane, without repo access at review time.
create table if not exists content_snippet (
  id         uuid primary key default uuidv7(),
  version_id uuid not null references content_version (id) on delete cascade,
  path       text not null,
  region     text not null default '',
  start_line int  not null,
  end_line   int  not null,
  file_hash  text not null
);
create index if not exists content_snippet_version_idx
  on content_snippet (version_id);
-- Code comments look up snippets by (area, slug, path) via the version join;
-- index the path for that lookup.
create index if not exists content_snippet_path_idx
  on content_snippet (path);

-- Full source text of each unique snippet `path` in a version. Registered once
-- per path (many snippet refs can share a file). Backs line-hash re-anchoring of
-- code comments and the "open full source" review pane, so no repo access is
-- needed at review time.
create table if not exists content_source (
  id         uuid primary key default uuidv7(),
  version_id uuid not null references content_version (id) on delete cascade,
  path       text not null,
  text       text not null,
  file_hash  text not null,
  unique (version_id, path)
);
create index if not exists content_source_version_idx
  on content_source (version_id);

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

-- A request for a named reviewer to review one (area, slug). Reviewers are
-- addressed by github login (email fallback) matched against reviewer_allowlist
-- — the allowlist has no stable user id and a requested reviewer may not have
-- logged in yet, so "requests to me" compares lower(reviewer_login) to the
-- viewer's login. Unlike the append-only review_state, a request is a small
-- stateful entity with three terminal outcomes; the immutable audit trail lives
-- in content_event, so this stays mutable (status is updated in place).
--
-- Satisfaction is artifact-level, not per-reviewer: when an artifact reaches
-- 'approved', all its open requests are marked 'satisfied' (any allowlisted
-- reviewer's approval counts, mirroring how release works). A finer per-reviewer
-- model would need a separate approval record and is intentionally out of scope.
create table if not exists review_request (
  id             uuid primary key default uuidv7(),
  area           text not null check (area in ('blogs', 'docs')),
  slug           text not null,
  reviewer_login text,
  reviewer_email text,
  requirement    text not null default 'required'
                   check (requirement in ('required', 'optional')),
  status         text not null default 'open'
                   check (status in ('open', 'satisfied', 'cancelled')),
  requested_by   text not null,
  note           text,
  created_at     timestamptz not null default now(),
  satisfied_at   timestamptz,
  satisfied_by   text,
  cancelled_at   timestamptz,
  check (reviewer_login is not null or reviewer_email is not null)
);
-- Release-block + per-artifact request lists filter by (area, slug, status).
create index if not exists review_request_ref_idx
  on review_request (area, slug, status);
-- A reviewer's inbox ("requests to me") filters by lower(login) + status.
create index if not exists review_request_reviewer_idx
  on review_request (lower(reviewer_login), status);

-- Append-only review timeline: one row per major lifecycle event on an artifact
-- (review requested/satisfied/cancelled, state transitions, release, unpublish/
-- republish). Frontmatter authoring changes are deliberately excluded — those
-- run through git/CI, not this app. kind-specific detail (from/to state, the
-- reviewer login, an unpublish flag) rides in the jsonb payload so the table
-- stays one shape. id is UUIDv7, so (area, slug, id) serves the filter AND the
-- chronological sort with no separate sort step (as with comment_ref_id_idx).
create table if not exists content_event (
  id         uuid primary key default uuidv7(),
  area       text not null check (area in ('blogs', 'docs')),
  slug       text not null,
  kind       text not null check (kind in (
               'review-requested', 'request-satisfied', 'request-cancelled',
               'state-in-review', 'state-changes-requested', 'state-approved',
               'released', 'unpublished', 'republished')),
  actor      text not null,
  version_id uuid references content_version (id),
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists content_event_ref_idx
  on content_event (area, slug, id);
