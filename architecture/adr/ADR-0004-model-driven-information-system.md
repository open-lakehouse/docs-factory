# ADR-0004: The docs site is a model-driven information system

| Field | Value |
|---|---|
| Status | Partially superseded by implementation (see As-built) |
| Date | 2026-07-18 |
| Supersedes | — |
| Superseded by | — |

## As-built (2026-07 update)

This ADR proposed materializing the join as a build-time
`site-artifacts/graph.json` knowledge index carrying a `coverage` block. **That
artifact was never built.** The implementation diverged in two ways, and the
`graph.json` decision below should be read as *historical* — the alternative it
rejected ("runtime model query") is closer to what actually shipped:

- **No `graph.json`.** `site/` consumes the LikeC4 estate model *live* at build
  time via the `likec4:single-project` Vite plugin (workspace
  `../architecture/model`), rather than reading a generated join artifact. Entity
  pages, backlinks, and focused diagrams derive from that live model plus content
  frontmatter — see `site/src/explain.ts`, which notes explicitly there is "no
  graph.json." `docsnip generate` emits only `examples-manifest.json` and the
  per-project `*.llms.txt`.
- **The coverage "block" is an ephemeral CI signal, not a persisted artifact.**
  The tiered gate did ship, but the tier-2 result is printed to stderr by
  `docsnip validate` (`model-reference coverage: X/Y`, `explanation coverage:
  X/Y`) and never written to a file or failed on. There is no persisted coverage
  record and no `unresolved`/`unreferencedElements` structure on disk.

The hybrid join, the `references:`/`explains:` frontmatter contract, and the
tiered (tier-1 fatal / tier-2 non-fatal) validation are all real and current;
only the `graph.json` materialization and its on-disk coverage block are not.

## Context

The preview harness (`site/`) began life as a throwaway renderer for docs and
blog drafts. We are reframing it as the **incubator for the next-generation
documentation site** for the open-lakehouse estate: less "read blog ABCD," more
an *information system* where explanations, how-tos, and narrative are woven
together by the structure of the estate itself.

We already own the rare, hard part of such a system: a typed, CI-validated
LikeC4 model (`architecture/model/`) exported to
[`dist/model.json`](../dist/model.json), with typed nodes (capability,
specification, implementation, role, service — see
[ADR-0005](./ADR-0005-capability-specification-implementation.md)), typed edges
(`specifies`, `implements`, `realizes`, `resolves`, `flows`, `vends`, `enforces`,
…), maturity tags (`#built`/`#designed`/`#prototype`), and
per-element metadata (`link`, `canonicalDoc`, `sourceRepo`). That is a knowledge
graph, not a folksonomy. The question is how content *joins* it so the model can
impose structure and internal linkage on the site — and how that join survives
the fact that **the model's shape is still evolving** (the logical layer will
likely be reworked).

Three forces are in play:

1. **Two vocabularies that overlap in words, not identity.** Blog `tags.yml` is a
   flat set of discovery labels with prose descriptions; the model speaks element
   ids (`ucSpec`, `lakehouse.catalog`, `lakehouse.governance.pdp`). Some
   tags map cleanly to model elements (`unity-catalog`→`ucSpec`); many
   (`wasm`, `codegen`, `devrel`) map to nothing structural.
2. **Abstract model, concrete content.** [ADR-0003](./ADR-0003-logical-abstract-deployment-concrete.md)
   keeps the logical layer technology-agnostic; blogs and how-tos name concrete
   technologies. The natural, least-churn anchor is therefore the
   **specification / implementation** layer (the Delta & Iceberg formats, the
   Iceberg REST & UC catalog specs, engines like DataFusion — which already carry
   `link`s to expert sites) routing *up* via `specifies` / `realizes` to
   capabilities.
3. **Humans and agents are both consumers.** The estate is itself about agentic
   workloads (Omnigent, agentic CLIs, the `update-architecture` skill already
   traverses the model). A canonical, machine-readable index is exactly what lets
   LLMs and agents understand the site and the domain without hallucinating
   structure.

We also inherited [`canonicals.yaml`](../canonicals.yaml) from another repo. It
largely duplicates `metadata.canonicalDoc`/`sourceRepo` and is currently *ahead*
of the `.likec4` model (it lists `browserWasm` and multi-role `realizes`
the model does not yet encode), so its value as a distinct layer is in doubt.

## Considered Options

**How content joins the model:**

- **Tags-as-join** — promote `tags.yml` into the semantic registry; every tag
  maps to a model element. Simple, but forces ~40% of today's folksonomy tags to
  dangle or be retired, and couples discovery labels to a churning model.
- **Separate `references:` channel** — keep tags purely folksonomic, add a new
  precise `references:` frontmatter. Clean separation, but a second vocabulary
  with full authoring burden and no reuse of the tag work already done.
- **Hybrid (chosen)** — tags stay discovery labels but may optionally carry a
  model `element:` id + curated `externalRefs:`; pages may *additionally* declare
  precise `references: [<elementId>]`. Reuses existing tags, allows exact
  anchoring where it matters.

**How the join is materialized:**

- **Runtime model query** — the site queries `model.json` live. No new artifact,
  but nothing is validated in CI and every consumer re-derives the join.
- **Build-time generated index (chosen)** — `docsnip` emits a
  `site-artifacts/graph.json` joining model elements ↔ content ↔ tags ↔ external
  links, freshness-checked in CI like the existing `llms.txt`/manifest artifacts.

**How references are validated (given an evolving model):**

- **Resolve-or-fail** — any unresolved reference fails CI. Maximally strict, but
  hard-blocks model rework and punishes authoring ahead of the model.
- **Tiered coverage gate (chosen)** — malformed references fail CI; references to
  not-yet-modeled (but well-formed) elements are recorded as **coverage gaps** in
  `graph.json`. Correctness *ratchets upward* over time instead of blocking change.

**The `canonicals.yaml` layer:**

- **Keep as-is** — a hand-curated historization layer alongside the model.
- **Subsume into the generated index (recommended)** — let `graph.json` derive the
  registry from `model.json` metadata; retain in `canonicals.yaml` only what the
  model genuinely cannot express.

**The agent surface:**

- **Static model-aware `llms.txt`/`llms-full.txt` (chosen for v1)** — extend the
  existing generator to be organized by capability/specification with descriptions,
  external links, maturity, and cross-references.
- **Queryable API / MCP tool (documented future option)** — expose the index as a
  tool (cf. the spark-api MCP) so estate agents share one structural source of
  truth. Deferred, not rejected.

## Decision

We adopt a **hybrid join** materialized as a **build-time generated knowledge
index** (`site-artifacts/graph.json`), gated by a **tiered coverage check**, with
element ids protected by an **id-stability / alias policy** so references survive
model rework. The index is a first-class product for **both humans and agents**;
its v1 machine surface is a model-aware `llms.txt`, with a queryable/MCP surface
as a documented future option. `canonicals.yaml` is slated to be **subsumed** by
the generated index, retaining only facts the model cannot express.

Content anchors first on **specifications and how-tos** — the stable, high-value
surface — and expands into capabilities/roles as the logical layer settles. The
index is explicitly a **living artifact that grows more correct over time**;
partial coverage is expected and tracked, never fatal.

The full mechanism (schema, frontmatter contract, validation tiers, alias policy,
UX surfaces, agent surface) is specified in
[`design/information-system.md`](../design/information-system.md).

## Consequences

### Positive

- The model imposes real structure and internal linkage on the site — entity
  pages, backlinks, focused diagrams, and related-content all derive from one
  validated graph rather than hand-maintained "see also" lists.
- The join is decoupled from the model's current shape: authors can reference
  stable specifications today while the logical layer is reworked, and the
  `graph.json` coverage block shows exactly where linkage is still thin.
- Agents and LLMs get a canonical, maturity-honest, machine-readable index —
  grounding retrieval and citations in fact, directly serving the estate's own
  agentic tooling.
- One generated artifact (`graph.json`) becomes the single source powering
  navigation, backlinks, search, `llms.txt`, and any future query surface.

### Negative / Trade-offs

- New coupling: `site/` (which today codegens LikeC4 only from `blogs/`) must
  consume the estate `dist/model.json`, and `docsnip`'s generate/check pipeline
  gains a new artifact and a new validation tier.
- Load-bearing pressure on the thinnest layers: navigation quality now depends on
  specification/implementation/deployment accuracy, surfacing the existing
  `canonicals.yaml`↔`.likec4` drift as work to reconcile.
- The id-stability alias map is a new thing to maintain; a rename that skips the
  alias silently breaks content links (mitigated by the tiered gate flagging it).
- Retiring/subsuming `canonicals.yaml` is a migration with its own churn, and some
  consumers (the `update-architecture` skill, human readers) reference it today.
