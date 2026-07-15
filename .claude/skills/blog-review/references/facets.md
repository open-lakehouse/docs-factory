# Facet reviewer prompts

One prompt per reviewer for the dispatch in step 2. Each reviewer scores **only its
facet**, against the matching facet in `blogs/QUALITY.md` (the rubric is the source
of truth for the checks — this file says what each reviewer inspects and what counts
as a finding). Every reviewer returns a **list** of findings, each with:

- **where** — heading / line / anchor in `draft.md`.
- **what** — the issue, in one line.
- **rule** — the QUALITY.md facet check or CONVENTIONS.md section it violates.

Return the list even if empty (say "no findings"). Prose write-ups are not wanted —
the consolidation step turns the lists into the report.

---

## (a) Sources & facts

Inspect `draft.md` against QUALITY.md facet (a). Flag: a claim with no cited ref; a
load-bearing claim resting on an internal/pre-release source instead of a public
one; a code sample that wouldn't compile/run against its **pinned** ref, or that
cites a moving branch instead of a tag/SHA; any internal or pre-release detail that
must not ship. Cross-check each pinned pointer actually resolves.

**Fact density is calibrated to the post type** — read the "Fact density" bullet in
QUALITY.md facet (a). First infer the post type from the brief's thesis/outline
(§4). For a reference/comparison/how-to post, hold the ~5-sourced-facts-per-500-words
bar. For a first-principles/argument/opinion essay, do **not** penalize low raw fact
density — the bar there is that every *specific factual assertion* (a named
product's behavior, a statistic, a "studies show") is sourced, while the reasoning
itself carries the piece. In every post type, an **unsourced specific claim** is the
real miss.

## (b) Voice & humanizer

Inspect against QUALITY.md facet (b). Flag the AI tells from CONVENTIONS.md §8
(copula avoidance, forced rule-of-three, vague attribution, em-dash overuse,
superficial `-ing` clauses, filler, mechanical boldface) **and** voiceless/uniform
prose. **Do not** flag the opinionated stance, first person, or a strong point of
view — those are features. If the draft reads neutral/hedged where the brief calls
for a stance, that *is* a finding (flattened voice).

## (c) Audience & tone fit

Inspect against QUALITY.md facet (c), using `brief.md` as the yardstick. Flag
over-explaining or under-explaining relative to the brief's stated **audience** and
assumed prior knowledge, and tone/register drift from the brief's stated voice.

## (d) Structure & argument

Inspect against QUALITY.md facet (d). Flag: thesis/hook that doesn't land early; a
section that doesn't earn its place; a missing CTA; label-style or title-case
headings (want descriptive, sentence-case); an intro that doesn't answer the title's
implicit question in the first ~40–60 words or buries it under throat-clearing; a
missing or thin TL;DR / key-takeaways box near the top.

## (e) Links, metadata & series continuity

Inspect against QUALITY.md facet (e), checking `tags.yml` and `SERIES.md`. Flag: a
broken link; a code link on a moving branch rather than a pinned ref; over-linking;
non-descriptive anchor text ("here"/"this"); invalid front matter (§3); **any tag
not present in `tags.yml`**; `series`/`series_order` or the prev/next / "where this
fits" line inconsistent with `SERIES.md`; a post that doesn't stand on its own; a
missing named `author` byline (E-E-A-T; the visible bio is a publish-target concern,
not a per-post field — don't flag its absence from the draft).

## (f) Citability (human + AI)

Inspect against QUALITY.md facet (f), **bounded by the reconciliation rules there**.
Flag: a section whose first 1–2 sentences don't answer its heading (fails the
"heading + first sentence = a real answer" test); a 3+ item comparison written as
prose that a table would serve better; no original asset; poor scannability (walls
of text, sections starting with "it/this/they"). **Adapt rule:** do **not** flag a
descriptive sentence-case heading for not being a literal "What is X?" question —
that's the intended style; check the *answer sentence beneath* instead. **Reject
rule:** do not recommend Schema.org Microdata in the draft (publish-target concern).
For every finding, note whether applying it would flatten the authored voice — if
so, mark it so the scoring step can downgrade it (voice wins ties).
