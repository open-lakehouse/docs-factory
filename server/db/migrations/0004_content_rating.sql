-- One reviewer's quality rating (1–5 stars + pros/cons, dimension tags, and an
-- optional good/bad exemplar label) of one content VERSION. Ratings feed later
-- mining of (content snapshot → judgement) pairs; they never affect review state.
--
-- Unlike approvals, a rating is bound to the version it judged: re-rating the
-- same version edits the row in place, but rating a newer version sets
-- superseded_at on the old row and inserts a new one, so history across edits
-- is retained. Withdrawing also sets superseded_at. Aggregates count only the
-- active (non-superseded) row per rater.
create table if not exists content_rating (
  id            uuid primary key default uuidv7(),
  area          text not null check (area in ('blogs', 'docs')),
  slug          text not null,
  version_id    uuid references content_version (id),
  rater_user_id text not null references user_identity (user_id),
  score         smallint not null check (score between 1 and 5),
  pros_md       text,
  cons_md       text,
  -- Dimension slugs (accuracy, clarity, structure, completeness, runnable-code,
  -- tone); validated in the app so the set can grow without a migration.
  strengths     text[] not null default '{}',
  weaknesses    text[] not null default '{}',
  exemplar      text check (exemplar in ('good', 'bad')),
  superseded_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists content_rating_active_idx
  on content_rating (area, slug, rater_user_id)
  where superseded_at is null;
create index if not exists content_rating_ref_idx
  on content_rating (area, slug);
