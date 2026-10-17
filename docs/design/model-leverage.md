# Getting value out of the estate model

**Status:** design. Phases 1 and 2 shipped (see §4, §4b); later phases proposed.
**Scope:** how the LikeC4 estate model (`architecture/model`, exported to
`architecture/dist/model.json`) reaches readers, search engines, and agents.
Builds on [ADR-0001](../decisions/ADR-0001-model-driven-information-system.md)
and [`information-system.md`](./information-system.md), whose UX and agent
surfaces (§6–§7) were designed for the factory app's `/explain` pages. Those
pages left with the reader routes (#153), so this document restates the plan for
the emitted docs sites.

## 1. Where the model stood

The model holds facts nothing else in the repo has in one place: 39 typed
elements (capabilities, open specifications, implementations, assets), 44
typed edges (`specifies`, `implements`, `realizes`, `governs`, …), maturity tags,
external links, and 27 views, two of them step-annotated sequence flows. Before
this change, almost none of it reached a reader:

- **Model links were deleted at emit.** `remark-model-links-text` unwrapped
  every `[label](model:<id>)` to plain text, because the emitted site had no
  model pages. About 20 authored links and every `explains:` binding produced
  nothing on the site, in the `.md` twins, or in `llms.txt`.
- **Diagram alt text was thrown away.** `remark-likec4-views` kept only the
  view id, so the docs site's fallback image said `alt="Diagram:
  ucCredentialVending_tableRead"`. The PNG and that string are all a crawler,
  an LLM, or a screen reader got from a diagram.
- **The model had wrong facts.** `parquetSpec`'s description was the Open
  Sharing tagline. Harmless in a modeling tool, a liability once the text is
  published as link tooltips and machine-readable summaries.
- **Interactive diagrams are fragile.** The docs site embeds the
  `<likec4-view>` web component (the whole estate model in one bundle) with a
  PNG fallback that only exists when the emit can run a Chromium export. Why
  rendering misbehaves in practice is not yet diagnosed (§5).

## 2. What actually helps SEO, GEO, and readers

Search engines and AI answer engines rank and quote passages of crawlable HTML.
They do not traverse a knowledge graph, read custom JSON, or look at diagrams.
What gets cited is clear, factual, definitional prose that is well linked
internally, kept current, and on a domain other sources link to. That sets the
priorities:

| Surface | SEO / GEO | Reader UX | Verdict |
|---|---|---|---|
| Resolved `model:` links | Modest: internal links, topic clusters | Real, when the target is substantive | Shipped (§4) |
| Diagram alt text | Real: the only part of a diagram machines read | Real: accessibility | Shipped (§4) |
| Verified compatibility matrix | High: matches real queries, unique, checkable | High | Shipped for UC (§4b) |
| Concept cards / "concepts on this page" | Small | Moderate | Cheap once links resolve (§3.2) |
| JSON-LD `about` / `mentions` / `sameAs` | Small to modest: entity disambiguation | None | Cheap, low risk (§3.3) |
| Interactive LikeC4 embeds | About zero; a heavy bundle can hurt Core Web Vitals | Good for flows in explanations, mostly ignored elsewhere | Explanation pages only, PNG first |
| One generated page per element | Negative risk: thin templated pages | Thin | Only where an `explains:` page exists |
| `llms.txt`, public `concepts.json` | Little evidence major crawlers use them | Helps agents a user points at the site | Keep cheap (§3.4) |
| MCP server | None | Niche publicly, high for our own agents | Internal first (§3.4) |
| Graph over Open Sharing | None | Demo value | A tutorial or post, not infrastructure (§3.6) |

The model's main SEO/GEO value is indirect. It makes the prose more correct,
more consistent, and better linked, and it can generate the one artifact
people search for: which engine supports what, verified. Visualizations and
graph exports are the least valuable part, though they are what we built first.

## 3. Proposals

### 3.1 Verified compatibility matrix

The model says which implementations realize which specifications and
capabilities. Colocated snippets prove which combinations work, because CI runs
them. Joined, they give one page per project: engine × operation (read or write
external and managed tables, credential vending, volumes, …). Each cell is
**verified** (links the tested how-to), **modeled but untested** (`#designed`),
or **unsupported**. This answers the questions people ask search engines and
LLMs ("can DuckDB write Unity Catalog managed tables?"), nobody else has
CI-backed claims, and it stays honest by construction. It would turn the
hand-maintained parts of R01 (features and limitations) and the Delta coverage
page into derived artifacts.

As built (§4b), a cell is ✓ (a gating CI script runs it, linked), ✗ (a gating
script asserts the failure, linked; or recorded evidence, unlinked), or "—"
(untested). There is no "modeled but untested" state: the model has no
operation-level edges, so the matrix can't derive one, and the join with the
model is a report instead (a tested interface the model doesn't connect to the
matrix's spec).

### 3.2 Concept cards and "concepts on this page"

At emit time, render static concept cards from `model.json`: summary, maturity
badge, external link, the explaining page. Attach them as hover cards on
resolved model links and as a footer block listing a page's references. Plain
HTML, no LikeC4 runtime. This is what the 1-hop mini-map was meant to deliver,
without a graph renderer most readers ignore.

### 3.3 Structured data

Per-page JSON-LD: `about` from `explains:`, `mentions` from resolved model
links, each entity a `DefinedTerm` or `SoftwareApplication` with `sameAs` to the
element's official site (and Wikidata, given a `wikidata` metadata key). It
disambiguates Unity Catalog OSS from the Databricks product and Delta Lake from
other Deltas. Rich results for docs are limited, so this is cheap hygiene, not a
growth lever.

### 3.4 A public projection and an agent surface

The emitter writes a curated `concepts.json`: logical and technology-catalog
elements only (no deployment nodes, no internal repo names, no `#designed`
internals), with id, aliases, summary, kind, maturity, typed edges, canonical
pages, and `sameAs`. `llms.txt` links it. An MCP server (`explain(id)`,
`path(a, b)`, `engines_for(capability)`) comes later, and its first users should
be our own agents (blog review facets, review-feedback, `update-architecture`),
which need grounding more than any public agent does. The raw `model.json` stays
internal: its deployment layer names our services and unbuilt designs.

### 3.5 Model as the spine of an agent-maintained wiki

Every page-worthy element without an `explains:` page is a content request,
then a `planned:` nav slot. An agent drafts the page from the element, its
neighbors, its `canonicalDoc`, and upstream docs. The review app is the curation
gate, and approval sets `status: ready`. Pages get generated only where there is
substance to say. The reverse check is as useful: flag prose claiming "X
supports Y" when the model has no such edge, and edges no page mentions.

### 3.6 The graph over Open Sharing

Publish nodes, edges, and content references as Delta tables behind an Open
Sharing endpoint, then write "Query the open-lakehouse knowledge graph with Open
Sharing and DuckDB". On-message, and a good tutorial or post. It is a showcase,
not a distribution channel: nobody consumes docs metadata through a sharing
protocol, and unlike everything above it needs a running server.

### 3.7 Smaller

- **Architecture changelog.** Diff the model between releases ("credential
  vending moved from designed to built"); pairs with the Merkle content tree.
- **Learning paths.** Next steps from edges: explanation → the how-to that uses
  the concept → the tutorial.
- **One glossary.** Generate the glossary entries that are model elements from
  the model, so the two can't drift.

## 4. Phase 1: stop losing what we have (shipped)

- **`model:` links resolve on emitted sites.** `emit/plugins/remark-model-links.mjs`
  takes a resolver; `emit/docs/model.mjs` supplies it from the committed
  `model.json`. A link goes to the published page that `explains:` the element,
  else the element's external `link`, else it unwraps to its label. A page never
  links to itself. The element's summary (or the first sentence of its
  description) becomes the link `title`. Twins get the same links, made
  absolute.
- **Diagram alt text survives.** `remark-likec4-views` passes the image's alt
  to `<LikeC4View>`. The docs site puts it on the fallback PNG (which is what
  the prerendered HTML carries), and the factory app labels the figure with it.
  An image with no alt gets the view's title and description from the model.
- **The model's reader-facing facts are linted.** `docsnip validate` reports,
  without failing, page-worthy elements with no description, specs and
  implementations with no external link, and those with no
  `specifies` / `implements` / `realizes` edge to what they stand for.
- **Fixed** `parquetSpec`'s description.

Considered and dropped: generating a numbered step list from each sequence
view's step notes, under the diagram and in the twin. Both pages that embed a
sequence view already narrate the steps in prose, so the list would duplicate
them. Reconsider if a page embeds a flow without narrating it.

Glossary anchors as a link target, between the explaining page and the
external link, wait on the emitted sites having a glossary.

## 4b. Phase 2: the verified compatibility matrix (shipped for UC)

- **Claims live on the script.** `[tool.docs-factory] claims.<interface>` lists
  what a script proves: `{ journey, region }` that a journey works, as shown in
  that region on its page, or `{ journey, fails }` that it doesn't, with `fails` the
  error text the script asserts. The interface is a declared column, never
  inferred from the language or the dependencies, which is what sank the old
  `engines:` field (`build-pipeline.md` §10).
- **The vocabulary is per project.** `content/<project>/compatibility.yml`
  declares interfaces (with the release.yml pin their header shows and their
  model element), `family.task` journeys, the tables pages embed (rows of
  journey ids), and evidence for cells no script proves. A journey is the only
  tracked unit: the calls a client makes inside it aren't modeled, because
  doing the journey implies them. (Until October 2026 the file had atomic
  `operations` plus table rows that grouped them; the two collapsed into
  journeys, which removed the "split the row" error.) `<project>:<interface>` claims let a UC
  script fill a Delta cell, for the coverage page's migration.
- **Only gating scripts count.** A claim renders once its page is `status:
  ready`, and since PR #190 the service lane fails on exactly those scripts
  (drafts run as non-strict xfails). That lane had been red, behind
  `continue-on-error`, since early October; the fixes were in the reader-facing
  environment, not CI (`envs/unitycatalog/image`).
- **Committed and checked.** `docsnip compat --fix` renders each table between
  `<!-- compat:<id> -->` markers; `docsnip check` fails on a stale table or a
  claim that doesn't hold up (missing region, anchor, or asserted text;
  scripts that disagree; evidence contradicting a ✓). The table reads in
  review, on GitHub, and in twins with no new renderer; emit strips the markers.
- **The model joins as a check.** Header cells are `model:` links, and
  `docsnip validate` reports tested interfaces with no element (Daft, pandas)
  or no `consumes`/`implements` edge to the matrix's spec. That report added
  Spark, DuckDB, and Polars `consumes ucSpec` edges.

- **Delta joined in October 2026.** `content/delta/compatibility.yml` renders
  the private coverage page's journey tables. Evidence gained `outcome: works`
  for cells the engine's own docs vouch for (`docs` on tables that set
  `documented: true`), and an `api` per interface. A table on a `private`
  page also shows draft pages' claims, marked, so the coverage record is
  complete before the Delta pages are ready.
- **The review app reads the same resolution.** `compat --fix` also writes
  `content/<project>/compatibility.json`, and `docsnip check` fails when it's
  stale. It's committed because the bare Vercel build has no `uv`. Plan →
  Compatibility renders it with each cell's proofs and evidence. "Track a
  journey" files a `JOURNEY` content request; accepting it lands a
  `journeys:` entry carrying `request: <id>` in a PR, so git stays the
  authority.

Next: derive R10's "Query engines" labels from claims, move the coverage
page's round-trip and table-feature grids onto the matrix, and project the
matrix into `concepts.json` (§3.4). Journeys now carry an asset and
per-journey contract requirements ([`trestle-integration.md`](./trestle-integration.md)
§5), and `compatibility.json` (version 2) records the model edges gating
claims exercise. Environment fit is checked against the generated
environments, and `concepts.json` carries the matrix: journeys proven on a
ready page, and the edges they verify (§8 there).

## 5. Open questions

- **Why does the interactive diagram misbehave?** Candidates: the web
  component bundle carries the whole estate model; the PNG fallback needs a
  Chromium export the Vercel and upstream builds may not run; `min-height` on
  a shadow-DOM host collapsing. Diagnose before investing in more embeds.
- **Which elements are public?** The public projection (§3.4) needs an explicit
  rule, likely a tag, rather than "everything outside the deployment layer".
- ~~Snippet → capability mapping~~ for the compatibility matrix (§3.1):
  per-script `claims` against a per-project vocabulary (§4b).
- **Alias map** (`information-system.md` §4) is still unbuilt; the public
  projection and entity linking both want it.
