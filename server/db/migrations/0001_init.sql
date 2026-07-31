-- Review & release lifecycle schema. The database is authoritative for review
-- state and comments; git frontmatter carries only the orthogonal authoring
-- `status`.
--
-- Identity: the canonical key for a person is the Neon Auth user id (the JWT
-- `sub` UUID), stable across a GitHub login rename and provider-agnostic. Neon
-- Auth owns neon_auth.user / neon_auth.account; at first login we resolve the
-- GitHub login/id + emails from there ONCE and persist them into our own
-- user_identity table (below), which everything else references. github_login
-- and email are display/search attributes, NEVER keys. Everyone referenced by
-- the allowlist, a review request, or an approval must be REGISTERED — i.e. have
-- a user_identity row from at least one login; there is no pre-adding someone who
-- has never signed in.
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
  -- Merkle root hash of the version's structure. DIFFERENT from content_hash
  -- ("this structure" vs "these bytes"): drives the evolution diff + fast-path
  -- re-anchoring. Nullable so pre-Merkle rows (none in practice — DB is nuke &
  -- re-register) don't break.
  root_hash          text,
  -- The full Merkle tree incl. non-section leaves (code blocks, snippet sources),
  -- as a MerkleNode-shaped jsonb blob. Read whole for the tree view + diff.
  merkle_tree        jsonb,
  -- Canonical product/topic ids (content/vocab.json topics), normalized from
  -- blog tags + doc project — the axis for the "what changed for X" rollup.
  topics             text[] not null default '{}',
  created_at         timestamptz not null default now(),
  unique (area, slug, content_hash)
);
create index if not exists content_version_ref_idx
  on content_version (area, slug, created_at desc);
-- Product rollup: find every version tagged with a topic (topics @> array[$1]).
create index if not exists content_version_topics_idx
  on content_version using gin (topics);

-- Heading-anchored sections of a version. anchor_slug is the rehype-slug id in
-- the rendered DOM; fingerprint is normalized heading text for re-anchoring.
-- plain_text is the normalized section body so the server can re-anchor quote
-- comments (find the quote in a new version) without re-fetching source.
create table if not exists content_section (
  id                 uuid primary key default uuidv7(),
  version_id         uuid not null references content_version (id) on delete cascade,
  anchor_slug        text not null,
  fingerprint        text not null,
  heading_text       text not null,
  heading_level      int  not null,
  ordinal            int  not null,
  plain_text         text not null default '',
  char_len           int,
  -- Merkle hashes for this section. node_hash = own content (direct prose leaf);
  -- subtree_hash = incl. subsections + code + snippet leaves. Comparing these
  -- across versions localizes changes in SQL and short-circuits re-anchoring.
  node_hash          text,
  subtree_hash       text,
  -- Tree edges: the enclosing heading's anchor_slug (null at top level /
  -- preamble) and the materialized fingerprint path (the stable diff key).
  parent_anchor_slug text,
  depth_path         text,
  unique (version_id, anchor_slug)
);

-- Append-only history of EXPLICIT review outcomes. The effective review state
-- the UI shows is derived (see deriveReviewState): NEEDS_REVIEW and derived
-- APPROVED are computed from frontmatter + content_approval and are never stored
-- here. Only the outcomes that cannot be derived are recorded: `changes-requested`,
-- `released`, and the maintainer `approved` override. RELEASED is a DB action,
-- never a frontmatter write. Current explicit outcome = latest row per (area, slug).
create table if not exists review_state (
  id            uuid primary key default uuidv7(),
  area          text not null,
  slug          text not null,
  state         text not null check (state in
                  ('changes-requested', 'approved', 'released')),
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

-- Our persisted mirror of a Neon Auth identity, keyed by the stable user id
-- (JWT `sub`). Written (upserted) on each login from the neon_auth.user/account
-- join + a one-time GitHub /user resolution, so the rest of the app reads a
-- resolved login/email/name from here with no GitHub API round-trip. Because it
-- is OUR table (not neon_auth's), it exists in every environment — including the
-- local mock provider — which is what makes user search testable without a real
-- Neon Auth database.
--
-- github_login is the resolved @handle (nullable until a login resolves it; a
-- transient resolution failure leaves it null rather than storing the numeric id
-- as a fake handle). github_id is the numeric OAuth account id (neon_auth.account
-- .accountId), kept for later backend GitHub integration. Erasure (EraseUser)
-- scrubs the PII columns here but keeps the row so stable references survive.
create table if not exists user_identity (
  user_id       text primary key,
  github_login  text,
  github_id     text,
  name          text,
  email         text,
  avatar_url    text,
  first_seen_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists user_identity_login_idx
  on user_identity (lower(github_login));
create index if not exists user_identity_email_idx
  on user_identity (lower(email));

-- Reviewer allowlist, keyed by the stable user id. A row can only exist for a
-- REGISTERED user (FK to user_identity), so there is no pre-adding someone who
-- has never logged in. Display (login/email/name) comes from the user_identity
-- join. on delete cascade: erasing the identity drops the grant with it.
create table if not exists reviewer_allowlist (
  user_id    text primary key references user_identity (user_id) on delete cascade,
  role       text not null default 'reviewer' check (role in ('reviewer', 'maintainer')),
  added_by   text,
  created_at timestamptz not null default now()
);

-- A request for a named reviewer to review one (area, slug). Reviewers are
-- addressed by their stable user id (reviewer_user_id → user_identity), so a
-- GitHub rename never breaks "requests to me" — the inbox filter is an exact
-- reviewer_user_id = viewer.userId. The reviewer must be registered (FK) and is
-- validated against reviewer_allowlist when the request is created. Unlike the
-- append-only review_state, a request is a small stateful entity with three
-- terminal outcomes; the immutable audit trail lives in content_event, so this
-- stays mutable (status is updated in place).
--
-- Satisfaction is per-reviewer: a required request is satisfied when the reviewer
-- it names records an approval (content_approval). A required, still-open request
-- keeps the derived state at NEEDS_REVIEW and blocks release until that specific
-- reviewer approves. Optional requests are advisory only.
create table if not exists review_request (
  id               uuid primary key default uuidv7(),
  area             text not null check (area in ('blogs', 'docs')),
  slug             text not null,
  reviewer_user_id text not null references user_identity (user_id),
  requirement      text not null default 'required'
                     check (requirement in ('required', 'optional')),
  status           text not null default 'open'
                     check (status in ('open', 'satisfied', 'cancelled')),
  requested_by     text not null,
  note             text,
  created_at       timestamptz not null default now(),
  satisfied_at     timestamptz,
  satisfied_by     text,
  cancelled_at     timestamptz
);
-- Release-block + per-artifact request lists filter by (area, slug, status).
create index if not exists review_request_ref_idx
  on review_request (area, slug, status);
-- A reviewer's inbox ("requests to me") filters by reviewer_user_id + status.
create index if not exists review_request_reviewer_idx
  on review_request (reviewer_user_id, status);

-- One reviewer's approval of one artifact. Approvals are per-reviewer and
-- artifact-level, and they PERSIST across content versions: an edit is normally
-- a response to review (not a regression against a prior approval), so a new
-- version does not invalidate approvals and does not re-prompt reviewers.
-- version_id records the version the approval was made against for provenance/
-- display only — it is never used to invalidate the approval. A dismissed
-- approval is soft-deleted (dismissed_at set) and retained for the timeline.
--
-- The effective review state is derived from these rows (deriveReviewState):
-- with required requests, APPROVED needs every required reviewer to have an
-- active approval; with none, any one allowlisted active approval approves.
create table if not exists content_approval (
  id               uuid primary key default uuidv7(),
  area             text not null check (area in ('blogs', 'docs')),
  slug             text not null,
  version_id       uuid references content_version (id),
  approver_user_id text not null references user_identity (user_id),
  dismissed_at     timestamptz,
  created_at       timestamptz not null default now()
);
-- At most one ACTIVE approval per (area, slug, approver); dismissed rows are kept
-- for the timeline, so uniqueness is partial on the active set. Approver is keyed
-- by the stable user id (exact match, no case folding needed).
create unique index if not exists content_approval_active_idx
  on content_approval (area, slug, approver_user_id)
  where dismissed_at is null;
create index if not exists content_approval_ref_idx
  on content_approval (area, slug);

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
               'state-changes-requested', 'state-approved', 'approved-by',
               'approval-dismissed', 'released', 'unpublished', 'republished',
               'content-revised')),
  actor      text not null,
  version_id uuid references content_version (id),
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists content_event_ref_idx
  on content_event (area, slug, id);
