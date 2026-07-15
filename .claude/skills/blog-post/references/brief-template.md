# Brief template (`brief.md`)

The front-matter block (see [`front-matter-schema.md`](front-matter-schema.md))
followed by ten short sections; keep each to bullets. Copy this to start a post.
Lifted from `blogs/CONVENTIONS.md` §4 — that file wins if they diverge.

1. **Hook / thesis** — one sentence: the single claim or promise. If you can't write
   it in one line, the post isn't ready to draft.
2. **Audience** — who it's for and what they already know; name the assumed prior
   knowledge so the draft doesn't over- or under-explain.
3. **Tone / voice** — first person, *how* opinionated, register, and the stance the
   post takes. This is authored, not neutral — state the point of view.
4. **Key takeaways** — 3–5 bullets the reader should remember; the spine of the
   outline and the wrap-up. These become the draft's TL;DR box (QUALITY.md facet d).
5. **Outline** — working H2 section list, one-line intent each; mark sections that
   carry a code sample. Keep it small; baseline first, defer depth.
6. **Source material** —
   - *Code (cross-repo):* one line each —
     `repo · path/to/file_or_dir · PR#/commit/tag` — what it shows.
   - *Prior art:* existing posts/docs/talks on this topic, and how this post differs
     from or responds to them.
   - *External refs:* specs, papers, issues (URL + one line).
7. **Call to action** — one or two next steps for the reader (try the crate, read the
   RFC, file feedback), not a pile.
8. **Publishing target / format** — where it goes and the constraints that implies
   (length norm, front-matter, image/asset handling, canonical/cross-post plan,
   license/disclosure).
9. **Verification / accuracy notes** — claims to check against real code before
   publishing; snippets must compile/run against the cited ref; anything
   internal/pre-release that must **not** be published.
10. **Open questions / risks** — unknowns and disclosure/COI concerns.
