-- Local-dev seed: synthetic registered users so the reviewer/admin pickers have
-- content on a fresh `just db-reset` without cycling through DevPersonaSwitcher
-- personas first. The user_id values match the mock provider's `mock:<login>`
-- scheme (server/src/auth/mock.ts), so impersonating any of these personas lines
-- up with a real user_identity row. NOT for production — prod rows are written by
-- the Neon Auth login path.
insert into user_identity (user_id, github_login, github_id, name, email, avatar_url) values
  ('mock:dev-maintainer', 'dev-maintainer', null, 'Dev Maintainer', 'dev-maintainer@example.test', 'https://github.com/dev-maintainer.png'),
  ('mock:dev-reviewer',   'dev-reviewer',   null, 'Dev Reviewer',   'dev-reviewer@example.test',   'https://github.com/dev-reviewer.png'),
  ('mock:octocat',        'octocat',        null, 'Octo Cat',       'octocat@example.test',        'https://github.com/octocat.png'),
  ('mock:hubot',          'hubot',          null, 'Hu Bot',         'hubot@example.test',          'https://github.com/hubot.png')
on conflict (user_id) do nothing;
