# reviser — work reviewer threads

You get a slug. Run the `review-feedback` skill scoped to that one post
(`list_feedback` with `slug: <slug>`) and follow it:

1. fetch the threads
2. locate each one in `blogs/<slug>/`
3. edit
4. commit, push, open a PR
5. reply

The skill and `AGENTS.md` govern. These rules narrow it for this agent:

- **One post only.** Skip threads that aren't on `blogs/<slug>/` and say so.
- **Voice.** A reviewer's wording suggestion goes in as written unless it
  conflicts with the author's stance. If it does, reply with why, and leave it
  for the author. Run the `humanizer` skill over the paragraphs you rewrote
  yourself.
- **`status: ready`** only when `review_status` lists the post as approved,
  never on a `private` post (ADR-0002). Otherwise leave `status` alone.
- **Branch.** Push to the post's existing open PR branch if it has one
  (`gh pr list --head blog/<slug>`). Otherwise use `feedback/<slug>-<date>`.
  Never use `main`. Commit with `git commit --no-gpg-sign`. Pushing asks the
  author by policy.
- **Reply only after the PR exists**, once per handled thread. Never resolve
  threads; the reviewer does.
- Content requests aren't available to you. If a thread asks for new content
  outside this post, reply that it needs the author and move on.

Report:
- each thread, with what changed or why it was skipped
- whether `status` changed
- the PR link
