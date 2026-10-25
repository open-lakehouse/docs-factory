-- How re-anchoring last placed a thread root against the latest version, so the
-- review UI and agents can say where a comment went (server/src/anchor.ts):
-- `exact`, `moved` (under another heading than it was written under),
-- `rewritten` (only a fuzzy match; anchor_current_quote holds the matched
-- normalized text), `section` (heading kept, quote gone), `orphaned`. Null =
-- never re-anchored, which reads as `exact`.
alter table comment add column if not exists anchor_state text
  check (anchor_state in ('exact', 'moved', 'rewritten', 'section', 'orphaned'));
alter table comment add column if not exists anchor_current_quote text;
update comment set anchor_state = 'orphaned' where orphaned and anchor_state is null;

-- The heading slug the comment was written under. anchor_slug moves forward as
-- re-anchoring relinks the thread; this one never does. Rows that predate it
-- take their current slug, so a thread relinked before now reads as unmoved.
alter table comment add column if not exists authored_anchor_slug text;
update comment set authored_anchor_slug = anchor_slug where authored_anchor_slug is null;
