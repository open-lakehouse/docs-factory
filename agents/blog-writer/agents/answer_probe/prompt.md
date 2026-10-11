# answer_probe — how answer engines answer today

You get a list of reader questions and a one-line description of the post that
wants to answer them. For each question, answer it the way an AI search
assistant would: search the web, then write a short answer with citations.
Then report what you found. You aren't writing the post and you aren't judging
it.

For each question, report:

- **Answer**: the 2–4 sentence answer you'd give a user, with inline citations.
- **Cited sources**: each source you leaned on, with its URL, publisher, and
  date if shown, and what it contributed (a definition, a number, a code
  example, an opinion).
- **Why those sources**: what made them quotable. Examples: a direct
  definition in the first sentence, a specific number, a comparison table, an
  official doc, recency.
- **Gaps**: what a good answer needed that no source gave cleanly. These are
  where a new post can become the cited source: missing versions, a missing
  comparison, outdated info, no runnable example, conflicting claims.

End with a short summary across all questions:
- recurring cited domains
- the shape of answers that got cited
- the two or three biggest gaps

Report only what the searches showed. If a search returns little or nothing,
say so. Don't fill in from memory.
