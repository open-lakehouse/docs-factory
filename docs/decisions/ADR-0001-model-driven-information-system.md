# ADR-0001: The docs site is a model-driven information system

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-18 |
| Supersedes | — |
| Superseded by | — |

## Context

The preview harness (`site/`) began life as a throwaway renderer for docs and blog
drafts. We reframed it as the **incubator for the next-generation documentation
site** for the open-lakehouse estate: less "read blog ABCD," more an *information
system* where explanations, how-tos, and narrative are woven together by the
structure of the estate itself.

We already own the rare, hard part of such a system: a typed, CI-validated LikeC4
model (`architecture/model/`) exported to `architecture/dist/model.json`, with typed
nodes (capability, specification, implementation, role, service — see
`architecture/adr/ADR-0004`), typed edges (`specifies`, `implements`, `realizes`,
`resolves`, `flows`, `vends`, `enforces`, …), maturity tags
(`#built`/`#designed`/`#prototype`), and per-element metadata (`link`,
`canonicalDoc`, `sourceRepo`). That is a knowledge graph, not a folksonomy. The
question was how content *joins* it so the model can impose structure and internal
linkage on the site — and how that join survives the fact that **the model's shape
keeps evolving**.

Three forces were in play:

1. **Two vocabularies that overlap in words, not identity.** Blog `tags.yml` is a
   flat set of discovery labels with prose descriptions; the model speaks element
   ids (`ucSpec`, `lakehouse.catalog`, `lakehouse.governance.pdp`). Some tags map
   cleanly to model elements (`unity-catalog`→`ucSpec`); many (`wasm`, `codegen`,
   `devrel`) map to nothing structural.
2. **Abstract model, concrete content.** `architecture/adr/ADR-0003` keeps the
   logical layer technology-agnostic; blogs and how-tos name concrete technologies.
   The natural, least-churn anchor is therefore the **specification / implementation**
   layer (the Delta & Iceberg formats, the Iceberg REST & UC catalog specs, engines
   like DataFusion — which already carry `link`s to expert sites) routing *up* via
   `specifies` / `realizes` to capabilities.
3. **Humans and agents are both consumers.** The estate is itself about agentic
   workloads. A canonical, machine-readable index is exactly what lets LLMs and
   agents understand the site and the domain without hallucinating structure.

## Considered Options

**How content joins the model:**

- **Tags-as-join** — promote `tags.yml` into the semantic registry; every tag maps
  to a model element. Simple, but forces ~40% of today's folksonomy tags to dangle
  or be retired, and couples discovery labels to a churning model.
- **Separate `references:` channel** — keep tags purely folksonomic, add a new
  precise `references:` frontmatter. Clean separation, but a second vocabulary with
  full authoring burden and no reuse of the tag work already done.
- **Hybrid (chosen)** — tags stay discovery labels but may optionally carry a model
  `element:` id + curated `externalRefs:`; pages may *additionally* declare precise
  `references: [<elementId>]`. Reuses existing tags, allows exact anchoring where it
  matters.

**How the site reads the model:**

- **Live model read (chosen)** — `site/` consumes the LikeC4 estate model directly
  at build time via the `likec4:single-project` Vite plugin (workspace
  `../architecture/model`). Entity pages, backlinks, and focused diagrams derive from
  that live model plus content frontmatter. No new persisted artifact; the model is
  the single source and never goes stale relative to a generated copy.
- **Build-time join artifact** — have `docsnip` emit a `site-artifacts/graph.json`
  joining model ↔ content ↔ tags, freshness-checked in CI. Rejected: it duplicates
  the model into a second on-disk structure that must be kept in sync, and the live
  read gives the same result with nothing to drift against.

**How references are validated (given an evolving model):**

- **Resolve-or-fail** — any unresolved reference fails CI. Maximally strict, but
  hard-blocks model rework and punishes authoring ahead of the model.
- **Tiered gate (chosen)** — malformed references fail CI (author mistakes);
  references to well-formed-but-not-yet-modeled elements are reported as coverage
  gaps, not failures. Correctness *ratchets upward* over time instead of blocking
  change.

## Decision

We adopt a **hybrid join** — tags may carry an optional `element:` + `externalRefs:`,
and pages may add a precise `references:` list — read by the site from the **live
LikeC4 model** (`likec4:single-project` over `architecture/model`), gated by a
**tiered validation check** in `docsnip validate`. The information system is a
first-class product for **both humans and agents**; its machine surface is a
model-aware `llms.txt`. Element ids are treated as stable public slugs (an
id-stability / alias policy) so content references survive model rework.

Concretely, as shipped:

- **The site reads the model live.** `site/src/explain.ts` joins model elements to
  content frontmatter at build/render time; there is no generated join artifact.
  `docsnip generate` emits only the per-project `*.llms.txt`. (At the time of this
  ADR it also emitted `examples-manifest.json`; that engine/coverage artifact was
  later removed — see [`design/build-pipeline.md`](../design/build-pipeline.md) §10.)
- **Content anchors two ways** (`content/README.md`): an inline `model:<id>` link
  mid-prose, and a page-level `references: [<id>]` frontmatter list that renders a
  concept header and drives the reverse "Referenced by" index on each `/explain/<id>`
  page.
- **Validation is tiered and ephemeral.** `docsnip validate` fails on malformed
  references (tier 1) and reports well-formed-but-unresolved references as a
  non-fatal coverage signal (tier 2) — printed to stderr (`model-reference coverage:
  X/Y`, `explanation coverage: X/Y`), not persisted. The live UI equivalent is the
  "No explanation yet" gap rows in `site/src/pages/AxisIndex.tsx`.
- **`architecture/canonicals.yaml` stays.** It remains a small hand-curated
  element → design-doc → source-repo registry and a live input to the
  `update-architecture` skill. (An earlier iteration expected it to be subsumed by a
  generated index; with the live-read design there is no such index, so the file is
  kept and simply reconciled against the model when it drifts.)

Content anchors first on **specifications and how-tos** — the stable, high-value
surface — and expands into capabilities/roles as the logical layer settles. Partial
coverage is expected and tracked, never fatal.

The full mechanism (join contract, validation tiers, alias policy, UX surfaces,
agent surface) is specified in [`../design/information-system.md`](../design/information-system.md).

## Consequences

### Positive

- The model imposes real structure and internal linkage on the site — entity pages,
  backlinks, focused diagrams, and related-content all derive from one validated
  graph rather than hand-maintained "see also" lists.
- Reading the model live means there is no join artifact to keep fresh: the site is
  always consistent with `dist/model.json`, and the only generated artifact is the
  per-project `llms.txt` (`examples-manifest.json` was later removed — see above).
- The join is decoupled from the model's current shape: authors can reference stable
  specifications today while the logical layer is reworked, and the tiered gate shows
  exactly where linkage is still thin.
- Agents and LLMs get a canonical, maturity-honest, machine-readable surface —
  grounding retrieval and citations in fact.

### Negative / Trade-offs

- New coupling: `site/` now consumes the estate `architecture/model` (it previously
  codegened LikeC4 only from `blogs/`), so the site build depends on the architecture
  package.
- Load-bearing pressure on the thinnest layers: navigation quality now depends on
  specification/implementation/deployment accuracy in the model.
- The id-stability alias map is a thing to maintain; a rename that skips the alias
  silently breaks content links (mitigated by the tiered gate flagging it).
- The coverage signal is ephemeral (stderr / live UI gap rows), so there is no
  historical coverage record on disk — an accepted simplicity trade for not
  maintaining a persisted index.
