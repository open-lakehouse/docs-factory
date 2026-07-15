# Blog quality rubric — what "good" looks like

The single source of truth for blog quality. [`CONVENTIONS.md`](./CONVENTIONS.md)
is the *process* (the lifecycle, and how the review pass is run); this file is the
*criteria* (what each facet is scored against). Both the `blog-post` authoring
skill and the `blog-review` skill read this file — don't copy these checks into a
skill, reference them here.

The review (`CONVENTIONS.md` §9) scores each of six facets **0–100** and
consolidates the findings into one prioritized report. Scoring is **advisory**:
it surfaces what to fix and how load-bearing each issue is; the author resolves
the findings and decides when a post is `publish-ready`. There is no hard gate.

## Two dimensions, one rubric

This rubric merges two things that used to live apart:

- **Craft** (facets a–e) — the existing conventions: sourced, voiced for the
  audience, well-argued, correctly linked and tagged.
- **Citability** (facet f) — a post that both humans *and* AI find, quote, and
  trust. Drawn from the "make humans and AI love it" work. The same moves serve
  both audiences: a TL;DR box saves a human time and hands an AI a packaged
  answer; a comparison table lets a human compare at a glance and lets an AI
  extract with high accuracy.

The one rule that governs the seam between them: **citability serves the reader
and the AI without overriding the author's stance.** This mirrors the humanizer
rule (§8) that we remove AI *patterns*, not the point of view. In scoring, **voice
(b) wins ties against citability (f)** — a citability suggestion that would flatten
the authored voice is downgraded, not applied.

## The six facets

Each facet lists the checks a reviewer scores against. A facet's 0–100 score
reflects how well the draft meets these, weighted by how load-bearing each miss is
(a broken code sample outweighs a missing FAQ).

### (a) Sources & facts

- Every factual claim traces to a cited ref; load-bearing claims rest on a
  **public** source, not an internal doc/email (those are leads, not sources).
- Each code sample compiles/runs against its **pinned** ref (tag or commit SHA,
  not a branch); pointers re-verified at review time (§6).
- No internal or pre-release detail leaks (§10).
- *(citability)* **Fact density — calibrated to the post type.** Specific facts
  (a number, a named entity, a date, a version), each with an inline source, are
  credibility for humans and citation-worthiness for AI — but the *right* density
  depends on what kind of post it is. Score against the post's type, not a flat bar:
  - **Reference / comparison / how-to / benchmark** — fact-dense by nature. Expect
    roughly **≥5 sourced specific facts per 500 words**; a claim-heavy passage with
    no sources is a real miss.
  - **First-principles / argument / opinion essay** — carried by reasoning, not
    fact volume. Here the bar is **every *load-bearing* claim is sourced or is
    clearly the author's stated reasoning** — not a per-500-words count. Don't
    penalize a well-argued conceptual passage for low raw fact density; do flag a
    specific factual assertion (a named product's behavior, a statistic, a "studies
    show") left unsourced.
  - **Mixed** — apply each bar to the matching passages.

  When the post type is unclear, infer it from the brief's thesis/outline (§4). The
  failure this guards against is an *unsourced specific claim*, in any post type —
  not a low fact count in an essay that is doing its work through argument.

### (b) Voice & humanizer  — *the counterweight to (f)*

- The AI tells in §8 are absent (copula avoidance, forced rule-of-three, vague
  attribution, em-dash overuse, superficial `-ing` clauses, filler, mechanical
  boldface).
- The **author's stance is preserved** — opinionated, first person, a point of
  view. Flattened-to-neutral prose is a defect here, not an improvement.
- Reads as authored by a person: varied rhythm, willing to be specific and to
  take a side. Voiceless, uniform prose scores low even when "clean."

### (c) Audience & tone fit

- Matches the brief's **audience** and assumed prior knowledge — no over- or
  under-explaining for who it's for.
- Tone/register matches the brief's stated voice.

### (d) Structure & argument

- Thesis/hook lands early; each section earns its place; the CTA is present.
- Headings are **descriptive, sentence-case** H2s; baseline-first, depth deferred.
- *(citability)* **Answer-first intro** — the intro answers the title's implicit
  question in the **first ~40–60 words**, names the subject, and carries at least
  one hard fact. No throat-clearing opener.
- *(citability)* A **TL;DR / key-takeaways box** near the top: 3–5 fact-rich
  bullets (these are the brief's key takeaways, surfaced in the draft). This is
  the single most-quoted block.

### (e) Links, metadata & series continuity

- Links resolve and code links are **pinned**; linked on first mention, not
  over-linked.
- Front matter is valid per §3; **every tag exists in `tags.yml`**.
- Series continuity: `series`/`series_order` correct, prev/next and the
  "where this fits" line consistent with `SERIES.md`; the post **stands on its own**.
- *(citability)* Internal links use **descriptive anchor text** (the destination's
  topic), not "here"/"this post".
- *(citability)* **Named author** present (E-E-A-T) — a real person, never "Admin".
  Sourced from the `author` front matter (§3). The visible bio/credentials are
  supplied by the publishing target at release, not carried per post — see the
  publish-target section.

### (f) Citability (human + AI)  — *new; bounded by (b)*

- **Section-leading answers.** The first 1–2 sentences under each H2 directly
  answer that heading — the self-contained chunk an AI can lift and a skimming
  human can trust. Test: *if someone read only the heading and its first sentence,
  would they have a real answer?* A setup, a story, or "it depends" fails.
- **Question-answering headings.** Headings are phrased so a reader's real
  question is *answered in the lead sentence beneath* — see the adapt rule below.
- **Comparison tables** for any 3+ item comparison — *where they earn their place*.
- **FAQ** with self-contained Q&A pairs — *optional*, only where it fits the post.
- **≥1 original asset** (data, a diagram, a screenshot, a framework, a result).
  A post's own LikeC4 (or D2) diagram already satisfies this.
- **Scannable** — short paragraphs, bold key terms sparingly, subject named at the
  start of each section (no leading "it/this/they").

## Reconciling citability with the authored voice

Citability moves are bucketed once, here, so the tension isn't re-litigated per
post. When a citability check and the voice fights, **voice wins**.

**Adopt** — pure wins for both humans and AI, no voice cost:

- Answer-first intro (40–60 words).
- TL;DR / key-takeaways box near the top.
- Section-leading answer sentences (good topic-sentence discipline).
- Fact density with inline sources.
- ≥1 original asset.
- Named author byline (the visible bio is added by the publishing target).
- Descriptive internal-link anchor text.

**Adapt** — valuable, but bent to the voice:

- **Headings.** Do **not** convert every H2 into a literal search-query question
  ("What is X?", "How much does it cost?") — that reads like SEO filler and fights
  the authored voice. Keep **authored, sentence-case** headings; put the
  question-matching in the **answer sentence directly underneath** the heading.
- **Tables / FAQ.** Include when they earn their place. Scored on **fit**, not mere
  presence — a forced FAQ on an opinion piece is filler and scores *down*, not up.

**Reject / defer:**

- **Keyword-stuffed question headings** optimized purely for prompt-matching —
  rejected. They conflict with the stance the conventions call a feature.
- **Schema.org Microdata** (`BlogPosting`, `FAQPage`, `HowTo`, `Person` with
  `sameAs`, `Organization` publisher) — **deferred to publishing**, not a draft
  concern. `draft.md` is Markdown and is the source of truth; it can't carry this
  markup and must not be scored on it. See the publish-target section below.

## Publish-target concerns (not draft concerns)

These apply **only when rendering a `publish-ready` post to an HTML target**, at
the publish-ready → published step (§1). They are **not** part of draft scoring —
a Markdown draft structurally can't contain them, so scoring a draft on them would
fail every post. Run this as a checklist against the *rendered HTML*, not `draft.md`.

- **`BlogPosting` wrapper** with `headline`, `datePublished`/`dateModified` as
  machine-readable `<time>`, and `articleBody`.
- **Author `Person` + visible bio** — `name`, `jobTitle`, `sameAs` links (LinkedIn/X,
  Wikipedia/Wikidata if they exist) and the "about the author" bio/credentials. The
  post carries only the `author` name (§3); the publishing target owns the bio and
  the markup, so it isn't duplicated per post.
- **`Organization` publisher** with `sameAs` (Wikipedia, Wikidata, socials). Set
  once at template level. If the CMS strips hidden `<meta>`/`<link>` in the body,
  fall back to a visible footer block with real `<a itemprop="sameAs">` tags.
- **`FAQPage`** wrapping the FAQ, each `Question`/`acceptedAnswer` self-contained.
- **`HowTo` + `HowToStep`** for tutorial/step-by-step posts (delete if not one).
- Descriptive `<title>`, a ≤160-char meta `description`, canonical URL, and Open
  Graph tags.
- **Validate** the rendered page in
  [Google's Rich Results Test](https://search.google.com/test/rich-results) —
  confirm `Article` and (if present) `FAQPage` are detected, i.e. the Microdata
  parses. Prefer Microdata (no `<script>`) so it survives CMS sanitizing.
