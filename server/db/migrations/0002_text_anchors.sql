-- Fine-grained comment anchoring. Comments can now pin to a quoted prose range
-- within a section, or to a line/region in a `file=` snippet's source, in
-- addition to the existing heading-level anchor. All new columns are nullable
-- so pre-existing heading-only comments remain valid.

-- Store the normalized plain-text body of each section so the server can
-- re-anchor quote comments (find the quote in a new version) without re-fetching
-- source. Existing rows default to '' until the next RegisterVersion.
alter table content_section
  add column if not exists plain_text text not null default '',
  add column if not exists char_len  int;

-- Prose text-quote selector (W3C-style) and code source selector on a comment.
-- A comment carries at most one; both null = a plain heading-level comment.
alter table comment
  add column if not exists selector_quote  text,
  add column if not exists selector_prefix text,
  add column if not exists selector_suffix text,
  add column if not exists selector_start  int,
  add column if not exists code_path       text,
  add column if not exists code_region     text,
  add column if not exists code_line        int,
  add column if not exists code_end_line    int,
  add column if not exists code_line_hash  text,
  add column if not exists code_file_hash  text;

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

-- Code comments are queried by their source path when re-anchoring.
create index if not exists comment_code_path_idx on comment (area, slug, code_path);
