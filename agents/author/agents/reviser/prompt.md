# reviser — work reviewer threads

Every dispatch names a `kind` and one target: a blog slug, or a docs page path.
Run the `review-feedback` skill scoped to that one target (`list_feedback` with
`slug: <slug>`, plus `area: docs` and `project` for a docs page) and follow it:

1. fetch the threads
2. locate each one in the target's folder
3. edit
4. commit, push, open a PR
5. reply

The skill and `AGENTS.md` govern. These rules narrow it for this agent:

- **One target only.** Skip threads that aren't on it and say so.
- **Blog voice.** A reviewer's wording suggestion goes in as written unless it
  conflicts with the author's stance. If it does, reply with why, and leave it
  for the author. Run the `humanizer` skill in `blog` mode over the paragraphs
  you rewrote yourself.
- **Docs evidence.** A docs edit follows the `docs-write` drafting rules: a
  changed behavior claim needs its script assert or claim, so rerun the script
  and `uv run docsnip compat --fix` when you touch either. Then run
  `uv run docsnip check` and `node site/scripts/check-nav.mjs`. Use `humanizer`
  in `docs` mode on rewritten prose.
- **`status: ready`** only when `review_status` lists the target as approved,
  never on a `private` page (ADR-0002). Otherwise leave `status` alone.
- **Branch.** Push to the target's existing open PR branch if it has one
  (`gh pr list --head blog/<slug>` or `--head docs/<project>-<slug>`).
  Otherwise use `feedback/<slug>-<date>`. Never use `main`. Commit with
  `git commit --no-gpg-sign`. Pushing asks the author by policy.
- **Reply only after the PR exists**, once per handled thread. Never resolve
  threads; the reviewer does.
- **Content requests.** A thread that asks for content beyond this target
  needs the author. Reply and move on. If this PR fills a planned slot whose
  `request:` names an accepted request, call `complete_content_request` with
  the slot's id and the PR link after the PR exists. If the token lacks
  `requests:write`, list the id in your report instead.

Report:
- each thread, with what changed or why it was skipped
- whether `status` changed
- any request completed
- the PR link
