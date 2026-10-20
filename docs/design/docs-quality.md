# Docs quality rubric

The criteria a docs page under `content/` is reviewed against.
[`content/README.md`](../../content/README.md) is the *contract* (frontmatter,
folder mode, snippets, environments, versions, claims) and this file is the
*judgment* on top of it. It lives here rather than in `content/` because every
non-README Markdown file there is a page. The `docs-write` and
`docs-review` skills read this file, so don't copy its checks into a skill. Blog
drafts have their own rubric, [`blogs/QUALITY.md`](../../blogs/QUALITY.md).

A review scores six facets **0–100** and reports findings as **Blocker**,
**Should-fix**, or **Suggestion**, each with a file and line. Scores are
advisory. The gate is mechanical (`uv run docsnip check`, which includes
`docsnip prose`, and `node site/scripts/check-nav.mjs`), and approval happens in
the review app ([ADR-0002](../decisions/ADR-0002-git-ready-is-release.md)).

## Governing rules

These decide ties between facets:

- **Evidence over assertion.** A docs page states what the repo can show: a
  tested script region, a compat claim, a model element, `release.yml`, or a
  pinned upstream source. A claim nothing backs is a missing fact. Mark it as
  an open question; don't write around it.
- **The reader acts.** Every sentence changes what the reader does or
  understands about the task. Internal mechanics they never act on are cut, not
  trimmed.
- **Lead with what works.** A page states a limitation inline only when it
  blocks that page's task. Quirks, version-specific behavior, and absences are
  recorded in R01 (`unitycatalog/reference/001-features-and-limitations`), a
  private page that no published page links.
- **The page states the current release only.** No release numbers in prose
  except as a boundary ("requires 0.4.0 or later"); see [Versions](../../content/README.md#versions).

## The six facets

### (a) Facts & evidence

- Every displayed command and code block comes from a tested region
  (`file=` fence); nothing is inlined.
- A behavior the page asserts ("the server rejects…", "DuckDB can't…") is
  pinned by an assert in the page's script, a compat claim, or a cited
  upstream source pinned to `blob/vX`.
- Script claims (`[tool.docs-factory] claims.<interface>`) cover the journeys
  the page demonstrates, and the compat tables are re-rendered
  (`docsnip compat --fix`), never edited.
- Facts that move with a release (version floors, absences, error strings)
  have one home (R01, `release.yml`, R02's matrix) and the page links it.
- No sensitive example data. Placeholders are `name@example.com`, documentation
  IP ranges, and obviously fake keys; `docsnip prose` fails on a real-looking
  credential.

### (b) Reader altitude & Diátaxis fit

- The page does the job of its bucket: a tutorial teaches one happy path, a
  how-to completes one task for a reader who knows their tools, an explanation
  builds understanding without steps, a reference is complete and scannable.
- No implementation detail the reader never acts on (how a token is brokered
  inside the server, internal code paths). Test each paragraph: does the reader
  do anything differently for knowing this?
- Explanations stay engine-neutral. A tutorial's side information (what
  `python -m asyncio` is, why a call runs where it does) goes in a `:::note` or
  `:::tip`, not the step.
- How-tos don't narrate the session. Show the pinned command ("Start Python
  with the SDK:") without explaining shells.
- Databricks-only concepts (workspaces, Catalog Explorer, `/Volumes` paths)
  appear only to mark a boundary.

### (c) Procedures are concrete

- Procedures are numbered steps or one `##` per task, named with an imperative.
  Each step is one action with the exact command, field, or value.
- A step that can't be written concretely is a missing fact, not a vague
  sentence. Flag it as an open question.
- Required privileges close each task; consequences get `:::warning`
  (surprising replacement, data loss) or `:::danger` (irreversible cascade).
- The page's environment comes from its scripts' compose: no prose that starts
  a server, lists ports, or tells the reader to run Docker
  ([Starting the environment](../../content/README.md#starting-the-environment)).

### (d) Structure & information architecture

- The page sits in the right bucket and has a `nav.yml` entry (or fills a
  `planned:` slot). A new page needs one; orphans fail the build.
- An explanation declares `explains: <element>` for its one canonical concept;
  other pages cite elements with `references:` and inline `model:` links.
- Cross-references follow the model: the concepts the page's element relates to
  (`docsnip query explain <element>`, `out` and `in`) and the tested examples
  for it (`examples-for`) are the first candidates for links and next steps.
- H2 for tasks or main ideas, H3 for detail, no H4 on non-reference pages. A
  page that needs H4 is two pages.
- One topic per page. Split on distinct reader goals; merge sections that only
  make sense together.
- How-tos follow the [anatomy](../../content/README.md#how-to-page-anatomy): intro,
  `:::prerequisites`, a task per section, privileges, consequences, next steps.

### (e) Style

`docsnip prose` handles the mechanical rules: product names (from the model's
public titles and [`content/terms.yml`](../../content/terms.yml)), prohibited and marketing terms,
temporal hedges, future "will", undefined acronyms, and secrets. The reviewer
judges the rest:

- Present tense, active voice, second person. Contractions are fine.
- No absolutes stated as guarantees ("always returns", "never fails") and no
  performance numbers without the script or source that measured them.
- No AI tells: inflated significance, copula avoidance ("serves as"), forced
  rule-of-three, synonym cycling, mechanical bold. The `humanizer` skill in
  `docs` mode catches these without adding opinion.
- Bold marks UI labels and terms in a definition list, not emphasis.
- Every code block has a lead-in sentence ("To create the catalog, run:").
- Titles: how-tos are "Manage X", not "Create and manage X"; tutorials name
  the outcome. H1 at most 60 characters.

### (f) Citability (human + AI)

The docs sites already ship `.md` twins, `llms.txt`, and JSON-LD; the page's
job is to be quotable:

- **`summary`** answers the page's question in at most 160 characters, names the
  subject, and doesn't start with "Learn how to" or "This page".
- **The intro** states the answer in one or two sentences, names the product,
  and stands alone when an AI quotes it. It never restates the `summary`, which
  renders right above it.
- **Section leads** answer their heading in the first sentence.
- **Canonical names and versions** match the model (`docsnip query explain`),
  so the page matches the reader's vocabulary. Where a name is overloaded
  (Unity Catalog the specification versus the OSS server), say which one.
- **Buried numbers surface:** limits, supported types, and defaults stated
  elsewhere on the page come up into the passage that answers the question.
  Never invent one.
- Skip "What is X?" headings, keyword stuffing, and forced FAQs.

## Exemplars

The pages to imitate, per type, live in the `authoring-prime` skill
(`.claude/skills/authoring-prime/references/exemplars.md`), so an agent reads
only its own type's examples.
