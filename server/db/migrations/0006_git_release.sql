-- Release is git's (docs/decisions/ADR-0002): `status: ready` merged to main is
-- the release, and RELEASED derives from the latest registered version. The DB
-- publication latch and the stored `released` outcome go away.
alter table content_revops drop column if exists published;

delete from review_state where state = 'released';
alter table review_state drop constraint if exists review_state_state_check;
alter table review_state add constraint review_state_state_check
  check (state in ('changes-requested', 'approved'));

-- RegisterVersion logs `released` / `unreleased` when a main version moves to or
-- from `ready`. The latch-era unpublish/republish rows map onto them.
alter table content_event drop constraint if exists content_event_kind_check;
update content_event set kind = 'unreleased' where kind = 'unpublished';
update content_event set kind = 'released' where kind = 'republished';
alter table content_event add constraint content_event_kind_check check (kind in (
  'review-requested', 'request-satisfied', 'request-cancelled',
  'state-changes-requested', 'state-approved', 'approved-by',
  'approval-dismissed', 'released', 'unreleased', 'content-revised'));

-- A `document` thread is about the whole page: no section, empty anchor_slug,
-- no selector, never orphaned. Replies copy their root's scope.
alter table comment add column if not exists scope text not null default 'section'
  check (scope in ('section', 'document'));

-- Requests for content that doesn't exist yet, placed where it should live (a
-- docs nav section label, or a blog tag/series). The accepted backlog stays in
-- git: DONE means a `planned:` slot carrying `request: <id>` landed (pr_url).
create table if not exists content_request (
  id                   uuid primary key default uuidv7(),
  area                 text not null check (area in ('blogs', 'docs')),
  project              text,
  placement            text not null,
  diataxis             text not null default '',
  title                text not null,
  body_md              text not null default '',
  status               text not null default 'open'
                         check (status in ('open', 'accepted', 'declined', 'done')),
  requested_by_user_id text not null,
  requested_by_login   text not null,
  planned_id           text,
  pr_url               text,
  resolution_note      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists content_request_status_idx
  on content_request (area, project, status, created_at desc);
