---
name: review-feedback
description: |
  Process reviewer feedback from the docs-factory review site: fetch open review
  threads, locate each in this checkout, edit the docs or blog source, open a PR,
  and reply on each thread. Use when the user asks to process, address, or work
  through review comments or feedback, for one page, a project, or everything.
argument-hint: 'Optional scope: a page slug, a project (unitycatalog, delta), docs, or blogs'
---

# Process review feedback

Review comments live in the review site's database, not in git. The
`review-feedback` MCP server (`list_feedback`, `get_thread`, `reply_to_thread`)
reads them and maps each thread onto this checkout. Without MCP, the same
operations are `just feedback list | show <id> | reply <id> --body …`.

If a tool says there's no token or the token is invalid, stop and ask the user to
run `just feedback login --url <review site>` in a terminal. Don't try to work
around auth.

## 1. Fetch

Call `list_feedback` with the user's scope (`slug`, `project`, or `area`). The
default `state: open` returns threads still waiting on a change. Threads you or
another agent already answered show as `awaiting-reviewer` and are skipped, so
rerunning this skill is safe.

Summarize what you found per page before editing anything, and confirm the plan
with the user when there are more than a handful of threads or any are ambiguous.

## 2. Locate and decide

For each thread, `get_thread` gives the conversation plus a location:

- `quote` / `code-line`: the exact lines.
- `section`: the comment's heading section. The quoted text has since changed, so
  find the passage by meaning.
- `file`, or "not in this checkout": the anchor is gone. Read the page and the
  thread, and decide whether it still applies.
- `file changed since comment`: line numbers may be stale. Read around them.

A thread may carry a **suggestion**: the reviewer's exact wording for the
anchored passage, shown as a `diff` block (`-` original, `+` replacement; no `+`
side means delete the passage). Treat it as the preferred change:

- With a `source match`, replace that source text with the replacement.
- Without one, the passage has inline markup (emphasis, links, code spans) or
  moved. Apply the new wording and keep the source's formatting.
- Code suggestions are dedented. Re-indent them to match the source lines.
- A suggestion that is `applied` or `dismissed` is settled. Read the replies for
  anything still open.

Apply a suggestion verbatim unless it would make the page wrong (a broken
command, a false claim, a convention violation). Then answer instead and leave
it open.

Read the whole thread; later replies often refine or retract the first comment.
Decide for each thread: change it, or answer without changing (the comment is
mistaken, already handled, or out of scope). Don't silently skip a thread.

## 3. Edit

Follow `AGENTS.md`:

- Docs code lives in the page's `snippets/`. Change the snippet, never inline code
  into `index.md`, and keep region markers around only what the reader sees.
- Never touch frontmatter `status`. Review state is the review site's business.
- Blog posts follow `blogs/CONVENTIONS.md`.

Then run `uv run docsnip check`, plus `uv run pytest content/<path>` for any page
whose snippets you changed.

## 4. Commit, push, PR

Work on a branch (`feedback/<scope>-<date>`), never `main`. Make one commit per
page or concern, following the repo's commit contract, and list the thread ids
addressed in the body. Push and open a PR whose description lists each thread
(page, one-line summary, what changed).

## 5. Reply

**Only after the PR exists**, call `reply_to_thread` once per handled thread:

- Changed: one or two sentences on what changed, plus the PR link. If the
  thread's suggestion is what you applied, set `suggestion_applied: true`
  (CLI: `--applied`) so it shows as applied.
- Not changed: why, briefly and respectfully, so the reviewer can push back.

Replies are posted as the token's owner and marked "via agent". Never resolve a
thread; the tools can't, and resolution is the reviewer's call once they've seen
the change. The same goes for dismissing a suggestion.

Finish with a short report: threads addressed, answered without change, and
skipped (with reasons), plus the PR link.
