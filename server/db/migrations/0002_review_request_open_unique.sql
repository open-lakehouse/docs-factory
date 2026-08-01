-- At most one OPEN review request per (artifact, reviewer). Satisfied/
-- cancelled rows stay free to stack historically; a new open request is
-- allowed once the prior one is no longer open. The requestReview handler
-- upserts against this: duplicate opens are no-ops, and an optional open
-- is upgraded when a required request arrives for the same reviewer.
create unique index if not exists review_request_open_unique
  on review_request (area, slug, reviewer_user_id)
  where status = 'open';
