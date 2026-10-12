-- What a content request asks for: a page (a `planned:` nav slot) or a journey
-- to track in content/<project>/compatibility.yml. A journey's placement is the
-- compatibility table id, and it carries no diataxis.
alter table content_request add column if not exists kind text not null default 'page'
  check (kind in ('page', 'journey'));
