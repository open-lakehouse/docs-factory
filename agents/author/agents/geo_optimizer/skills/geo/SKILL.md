---
name: geo
description: >-
  Generative Engine Optimization pass over a blog draft: apply QUALITY.md
  facet (f) moves aimed at the post's reader questions and the gaps an
  answer-engine probe found, bounded by the author's voice, and write the
  geo.md report. Use for the GEO phase of the author agent (blogs).
---

# geo: make the draft the source answer engines cite

The aim is for a generative engine (AI Overviews, ChatGPT search,
Perplexity) that answers one of the post's reader questions to lift a passage
from this post and cite it. The same moves help a skimming human. The
**criteria** are already in `blogs/QUALITY.md`: facet (f), facet (d)'s
citability items, and the "Reconciling citability with the authored voice"
section. Read them. This skill is the **procedure**, plus the evidence for the
moves in `references/geo-tactics.md`.

The governing rule is QUALITY.md's: **voice (b) wins ties.** A move that would
flatten the stance is skipped and logged, never applied.

## Inputs

- `blogs/<slug>/index.md`, the draft
- the plan: thesis, audience, stance, **reader questions**, sources
- the `answer_probe` report: how an answer engine answers each reader question
  today, what it cites, and the gaps

## Procedure

1. **Map questions to passages.** For each reader question, find the passage
   that should be the citable answer. That's usually the lead of an H2, or the
   intro for the title's question. A question with no home is a finding. Add
   an answering lead under the closest H2, or report that the post doesn't
   answer it. Don't add a section the plan didn't call for.
2. **Make each answer passage liftable.** Apply in place, smallest edit first:
   - The lead sentence answers the heading on its own. It names the subject
     instead of "it" or "this", and it doesn't depend on the previous section.
   - It carries one specific, sourced fact: a version, a number, a named
     component, a date.
   - Use the canonical entity names and versions on first mention ("Unity
     Catalog 0.6", "Delta Lake"). Spell out each acronym once. Match the
     terms readers actually use, taken from the probe's answers.
3. **Target the probe's gaps.** Where the probe found no clean source, check
   whether the post already holds the missing piece: a comparison, a runnable
   example, a current version, a number. If it does, make that piece prominent
   and quotable: a table, a sentence that opens a paragraph, a `:::tldr`
   bullet. If it doesn't, report the gap. Don't invent data.
4. **Check the adopt list.** Confirm QUALITY.md's adopt moves are in place:
   - an answer-first intro of 40–60 words with a fact
   - `:::tldr` with 3–5 fact-rich bullets
   - section-leading answers
   - inline-sourced facts at the density the post type calls for
   - at least one original asset
   - descriptive anchor text

   Fix only what's missing or weak.
5. **Respect the reject list.** No literal "What is X?" headings, no keyword
   stuffing (the GEO paper found it doesn't help), no forced FAQ on an opinion
   piece, and no Schema.org in `index.md`.
6. **Voice check your own diff.** Reread each hunk. If it made the prose more
   neutral, more hedged, or less first person, revert it and log it as
   skipped (voice).
7. **Write `blogs/<slug>/geo.md`** in the format below. It sits next to
   `index.md`; only `index.md` is published.

## `geo.md` format

```markdown
# GEO report: <title>

## Reader questions
| Question | Answering passage | Probe: cited today | Our edge |
|---|---|---|---|
| … | § "<heading>" lead / intro / none | domains | gap we fill, or none |

## Applied
- <move> — § "<heading>": <one line on what changed>

## Skipped
- <move> — § "<heading>": <why; "voice" when QUALITY.md's rule decided it>

## Gaps the post doesn't fill
- <gap from the probe> — <what content would fill it, for the author>

## Publish-target proposals
Per QUALITY.md "Publish-target concerns", for whoever renders the post:
- Meta description: the front matter's `summary` is published as it. Tighten
  `summary` in `index.md` (≤160 chars, answer-first, names the subject) and
  record the before and after here.
- FAQPage candidates: <question → passage>, or "none — opinion piece"
- HowTo: yes/no
- Entities for `about`/`mentions`: <canonical names>
```

Keep `geo.md` factual and short. It records what you did and what you
measured. It isn't a pitch.
