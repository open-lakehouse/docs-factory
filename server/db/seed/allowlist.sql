-- Seed the reviewer allowlist. The allowlist is keyed by the stable Neon Auth
-- user id (reviewer_allowlist.user_id -> user_identity.user_id), so an entry can
-- only be granted for a REGISTERED user (someone who has signed in at least once
-- and therefore has a user_identity row). There is no pre-adding by bare login.
--
-- LOCAL DEV: grant the synthetic personas from user_identity.sql (which must be
-- applied first). Maintainers can release content and manage the allowlist;
-- reviewers can view drafts and comment.
insert into reviewer_allowlist (user_id, role, added_by) values
  ('mock:dev-maintainer', 'maintainer', 'seed'),
  ('mock:dev-reviewer',   'reviewer',   'seed')
on conflict (user_id) do nothing;

-- PRODUCTION: pre-login grants are NOT possible. After the intended maintainer
-- signs in once (which creates their user_identity row), grant them by user id:
--
--   insert into reviewer_allowlist (user_id, role, added_by)
--   select user_id, 'maintainer', 'seed' from user_identity
--   where lower(github_login) = lower('<maintainer-login>')
--   on conflict (user_id) do nothing;
