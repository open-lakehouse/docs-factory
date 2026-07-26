---
name: blog-review
description: |
  Run the multi-agent quality review over a blog draft before it's marked ready:
  dispatch six parallel facet reviewers, confidence-score their findings, and
  consolidate one prioritized report. Use when the user wants to review a blog draft,
  run the blog review, or asks whether a post in blogs/<slug>/ is ready to publish.
argument-hint: 'Path to a blogs/<slug>/ folder or a index.md to review'
---

# blog-review: multi-agent quality review

Review a blog draft against the rubric before it's released. The shape is the same
**dispatch → confidence-score → consolidate** as `/code-review`, adapted to blogs
(`blogs/CONVENTIONS.md` §9), over **six facets (a–f)**.

Two documents are the source of truth:

- [`blogs/QUALITY.md`](../../../blogs/QUALITY.md) — the *criteria*: the six facets and
  what each is scored against. This is what the reviewers grade against.
- [`blogs/CONVENTIONS.md`](../../../blogs/CONVENTIONS.md) — the *process* this skill
  implements, plus the rules a draft must satisfy.

The review is **advisory**: it produces per-facet 0–100 scores and a prioritized
findings report. It does **not** gate the frontmatter — the author resolves findings
and decides when to set `status: ready`. The actual release is gated by the DB review
state (in-review → approved → released), not by this pass or a frontmatter value.

## Steps

### 1. Load context

1. Read `blogs/QUALITY.md` (the rubric) and this skill's
   [`references/facets.md`](references/facets.md).
2. Read the target `index.md` **and** its `brief.md` (the brief is the yardstick for
   facets c and d — the draft is judged against what it set out to do).
3. Read `blogs/tags.yml` and `blogs/SERIES.md` — facet (e) checks against them.

### 2. Dispatch six parallel facet reviewers

Dispatch **six reviewers in parallel** (one message, multiple `Agent`/Task calls
with the `Explore` or `general-purpose` type), one concern each, so no single pass
has to hold everything. The six facets, defined in
[`references/facets.md`](references/facets.md) and scored against `blogs/QUALITY.md`:

- **(a) Sources & facts**
- **(b) Voice & humanizer**
- **(c) Audience & tone fit**
- **(d) Structure & argument**
- **(e) Links, metadata & series continuity**
- **(f) Citability (human + AI)**

Give each reviewer only its facet's slice of the rubric plus the draft, brief, and
(for e) `tags.yml`/`SERIES.md`. Each reviewer returns a **list** (not prose) of
flagged issues, each with: the location, the reason, and **which QUALITY.md /
convention rule** it violates.

### 3. Confidence-scoring pass

For every flagged issue, score **0–100** for whether it's real and load-bearing (as
in `/code-review`). Filter out false positives and nitpicks.

Apply the governing rule from `blogs/QUALITY.md`: **voice (b) wins ties against
citability (f)**. A facet-(f) finding that would flatten the author's stance is
**downgraded** — say so explicitly rather than dropping it silently, so the author
can judge.

### 4. Consolidate

Produce **one** report against `index.md`:

- A per-facet **0–100 score** (a–f) and an overall score, with a one-line rationale
  each.
- Findings **grouped by facet**, ordered by confidence/severity, each pointing at a
  specific location with the rule it violates and a concrete fix.
- State plainly that this is advisory — the author resolves the findings and decides
  when to set `status: ready`; the DB review state gates the actual release. Do not
  set the status yourself.

### 5. Publish-target check (conditional)

Only if the user names an **HTML publishing target**: run the Microdata /
Rich-Results checklist from the "Publish-target concerns" section of
`blogs/QUALITY.md` against the *rendered HTML*, not `index.md`. Skip this entirely
for a draft-stage review — a Markdown draft can't carry Microdata and must not be
scored on it.
