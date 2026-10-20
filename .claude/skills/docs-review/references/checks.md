# What each facet's reviewer inspects

Score against the matching facet in
[`docs/design/docs-quality.md`](../../../../docs/design/docs-quality.md). This
file says where to look and what counts as a finding. Return a list, even
an empty one ("no findings").

## Already mechanical (don't re-derive)

`uv run docsnip check` covers frontmatter vocabulary, unique `explains:`,
model ids in `references:` and `model:` links, every `file=` fence resolving
to one region, pins matching `release.yml`, release-scoped prose, compat
tables being current, and served-script hygiene. `check-nav.mjs` covers orphans,
unknown pages, duplicate ids, and nesting depth. `docsnip prose` covers product
names, prohibited and marketing terms, hedges, future "will", undefined
acronyms, and secrets. Read their output and cite it. Don't hunt for the same
things by eye.

## (a) Facts & evidence

- For each sentence that asserts behavior ("returns", "rejects", "can't",
  "requires"), find what backs it: an assert in the page's script, a claim
  (`claims.<interface>`), an element summary or edge in
  `docsnip query explain`, `release.yml`, or a pinned upstream link. Nothing
  backing it is a Should-fix. Something contradicting it is a Blocker.
- A tab whose interface has no claim for the journey the section shows: the
  compat matrix won't know this page proves it.
- A version-sensitive fact (an absence, a quirk, an error string) stated on a
  page whose task it doesn't block: suggest recording it in R01 and cutting
  it. A link to R01 from a page that isn't private is a Blocker: R01 is
  private and never ships.
- A code block that isn't a `file=` fence, other than the pinned
  session command.
- Example data: emails outside `example.com`, real-looking account ids or ARNs
  with real account numbers, IPs outside the documentation and private ranges.
- Images (added or newly referenced): open each one. A leaked credential,
  personal email, or internal hostname is a Blocker. Words baked into a
  screenshot, an oversized file (over 1 MB), or untrimmed UI chrome is a
  Should-fix. A LikeC4 PNG is regenerated from its view, so review the view
  instead.

## (b) Reader altitude & Diátaxis fit

- The page does its bucket's job (see the rubric). A how-to that teaches, an
  explanation with steps, a tutorial with branches: Should-fix.
- Paragraphs the reader never acts on: server internals, class names, request
  plumbing. Name the paragraph and suggest the cut, or the explanation page it
  belongs on (`docsnip query explain` → `page`).
- How-to session narration ("asyncio lets you await…"). Tutorial side
  information inline instead of in `:::note`/`:::tip`.
- Databricks-only concepts in task text.
- Concept prose that restates itself or runs long: suggest specific cuts.
  Keep each section's orienting first sentence.

## (c) Procedures are concrete

- A step without the exact command, value, or field. A procedure written as
  headings. A third-party console flow described vaguely: an open question,
  not a pass.
- A task section with no required-privileges line, where the server enforces
  privileges.
- A consequence (replacement, data loss, an irreversible cascade) without its
  `:::warning`/`:::danger`.
- Prose that starts a server, lists ports, or tells the reader to run Docker.
  The emitter owns that.
- `:::prerequisites` items that aren't tools or assumed state (Docker, the
  server, pins, Python versions).

## (d) Structure & IA

- The `nav.yml` placement (section trail) fits the reader's goal. Siblings
  overlap or contradict.
- An explanation that doesn't declare `explains:`, or declares one another
  page already owns.
- Missing cross-references the model implies: the page's element's `out`/`in`
  edges and `citedBy` pages, with no link either way. Circular "see X" loops,
  and dead ends with no next step.
- How-to anatomy: intro, prerequisites, `## Set up the client`, one imperative
  `##` per task, privileges, next steps. H4 outside reference pages. One topic
  per page.
- A moved or renamed page: inbound links and `nav.yml` follow it.

## (e) Style (judgment half)

- Absolutes stated as guarantees ("always", "never", "all" about system
  behavior). Performance numbers without the script or source that measured
  them. Superlatives against other products.
- AI tells in clusters (the `humanizer` catalog): inflated significance,
  "serves as", forced triples, synonym cycling, mechanical bold, signposting.
- Bold used for emphasis rather than UI labels or definition terms.
- A code block without a lead-in sentence. Semicolon-joined sentences.
- Titles: "Create and manage X" instead of "Manage X". An H1 over 60
  characters.

## (f) Citability

- `summary`: over 160 characters, starts with "Learn how to" or "This page",
  describes the page instead of answering, or omits the product name.
- The intro restates the `summary`, buries the answer, or doesn't name the
  subject.
- Section leads that don't answer their heading in the first sentence.
- Names that don't match the model's titles, or an overloaded name used
  without saying which one is meant.
- A number (limit, default, supported type) buried below where the question
  is answered. Never suggest inventing one.
- Don't suggest "What is X?" headings, keyword stuffing, or a forced FAQ.
