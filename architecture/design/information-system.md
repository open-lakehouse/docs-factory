# The docs site as a model-driven information system

**Status:** design (proposed alongside [ADR-0004](../adr/ADR-0004-model-driven-information-system.md)); **partially superseded by implementation** — see As-built.
**Scope:** cross-cutting — spans the LikeC4 model, `blogs/`, `content/`,
`tools/docsnip`, and `site/`.

> **As-built note (2026-07).** The central artifact this document specifies —
> a generated `site-artifacts/graph.json` knowledge index carrying a `coverage`
> block (§3, §4) — **was never built.** The implementation kept the *contracts*
> (the hybrid tag/`references:` join, the tiered validation gate) but materialized
> them differently, so §3, §7's `graph.json` input, and the §8 "reading from
> `graph.json`" framing describe a plan, not the code:
>
> - **`site/` reads the LikeC4 model live**, not a `graph.json`. Estate views and
>   entity/backlink data come from the `likec4:single-project` Vite plugin over
>   `../architecture/model` plus content frontmatter (see `site/src/explain.ts`,
>   which states "no graph.json"). `docsnip generate` emits only
>   `examples-manifest.json` and the per-project `*.llms.txt`.
> - **The tier-2 coverage result is ephemeral**, printed to stderr by
>   `docsnip validate` (`model-reference coverage: X/Y`, `explanation coverage:
>   X/Y`) and never persisted or failed on — there is no on-disk `coverage`
>   block. The live "No explanation yet" gap rows in `site/src/pages/AxisIndex.tsx`
>   are the UI-side equivalent.
>
> The rest of the document is retained as the design record.

This document specifies the **connection mechanism** that lets the estate LikeC4
model impose structure and internal linkage on the documentation site. It is
deliberately independent of the model's *current* shape: the logical layer will
be reworked, so what we commit to here is *how content joins the model* and *how
that join grows more correct over time* — not today's element list.

## 1. Vision & scope

We are turning `site/` from a docs+blog renderer into an **information system**:
a reader (human or agent) arriving at any page can see where the concept sits in
the estate, which specifications and implementations realize it, where the
authoritative external explanations live, how mature it is, and what else
references it — without any of that being hand-maintained per page. The model is
the backbone; content links *into* it and the model links *back out* to content.

Three framing commitments:

- **The model is evolving.** The durable deliverable is the join mechanism, not a
  commitment to today's capabilities/roles. References must tolerate rename and
  rework (see §5).
- **Specifications and how-tos are the primary anchor.** Specifications
  (Delta, Iceberg, the Iceberg REST & UC catalog specs, Parquet, the S3 API — see
  [ADR-0005](../adr/ADR-0005-capability-specification-implementation.md)) have the
  most stable external identities, already map to blog tags, and already carry
  `link`s to expert sites; implementations (DataFusion, Spark, Lakekeeper, …) are
  the next anchor. How-tos are where readers land. We start linkage there and
  expand into the abstract layer as it settles.
- **The index grows more correct over time.** Partial coverage is expected and
  *tracked*, never fatal (see §4). Correctness ratchets upward.

Narrative stays in `blogs/`; structural fact stays in the model
([ADR-0002](../adr/ADR-0002-facts-here-narrative-in-writing.md)). This system is
the connective tissue between them.

## 2. The join contract (hybrid)

Two vocabularies exist and must not be conflated: blog **tags** (discovery labels,
[`../../blogs/tags.yml`](../../blogs/tags.yml)) and model **element ids**
(`ucSpec`, `lakehouse.catalog`, …). The hybrid contract lets each do what
it is good at.

```mermaid
flowchart LR
  content["Blog / How-to frontmatter"] -->|"tags[] (discovery)"| tagsyml["tags.yml entry"]
  content -->|"references[] (precise)"| elem["model element id"]
  tagsyml -->|"optional element:"| elem
  tagsyml -->|"optional externalRefs:"| ext["external expert sites"]
  elem -->|"resolve / alias"| modeljson["dist/model.json"]
  modeljson --> graph["site-artifacts/graph.json (+ coverage)"]
  graph --> ui["entity pages · backlinks · focused diagrams · llms.txt"]
```

> As-built: the `graph.json` node was never realized. `site/` reads
> `dist/model.json` live (via the `likec4:single-project` Vite plugin) to drive
> `ui`; only `*.llms.txt` and `examples-manifest.json` are generated artifacts.

### 2.1 Tags gain optional structure (backward-compatible)

Today each entry in [`tags.yml`](../../blogs/tags.yml) is `tag: { description }`.
We extend it so a tag *may* additionally carry a model anchor and curated external
references. Description-only entries stay valid — this is purely additive.

```yaml
# blogs/tags.yml (proposed extension)
unity-catalog:
  description: "Unity Catalog / data governance"
  element: ucSpec                # optional: a model.json element id (the UC spec)
  externalRefs:                  # optional: typed, curated expert links
    - { role: upstream, url: "https://www.unitycatalog.io" }
    - { role: spec,     url: "https://docs.unitycatalog.io" }
codegen:
  description: "Proto-driven / build-time code generation"
  # no element: — a legitimately folksonomy-only tag; nothing dangles
```

`externalRefs.role` vocabulary (initial): `upstream · spec · repo · paper · docs`.
When a tag has no `element:`, it remains a pure discovery label — this is the
designed escape hatch for the ~40% of tags with no structural counterpart.

### 2.2 Pages may declare precise references

For exact anchoring beyond coarse tags, blog drafts and `content/**` pages may add
an optional `references:` list of model element ids to frontmatter:

```yaml
# a how-to page's frontmatter
title: Read and write managed tables via the UC Delta API
diataxis: how-to
project: unitycatalog
references: [ucSpec, lakehouse.catalog]   # optional, precise, validated
```

Anchor targets may be *any* element id, but authors are guided to prefer
**specifications and implementations** (concrete, stable) over abstract
capabilities/roles while the logical layer is unsettled.

### 2.3 Worked example (specification-anchored)

A how-to about the UC Delta API tags itself `unity-catalog`. The join resolves:

```
tag unity-catalog
  └─ element: ucSpec                           (specification, stable id)
       ├─ externalRefs → unitycatalog.io, docs.unitycatalog.io   (expert sites)
       ├─ -[specifies]-> lakehouse.catalog      (capability, may churn)
       │      └─ metadata.canonicalDoc → design/catalog-plane.md
       │      └─ instanceOf (inverse) → mangrove (service, sourceRepo)
       └─ implemented by unityCatalogOSS -[implements]-> ucSpec  (implementation)
```

From one tag the page surfaces: authoritative external docs, the capability it
specifies, the canonical design doc ([`catalog-plane.md`](./catalog-plane.md)),
the service that realizes it, and the reference implementation — all derived, none
hand-written. Note the anchor is the *specification* (`ucSpec`), the most stable
identity in the estate, so the page's linkage survives even if `lakehouse.catalog`
is renamed in a model rework.

## 3. The knowledge index (`site-artifacts/graph.json`)

> **As-built: not implemented.** This entire section describes a generated
> artifact that was never built. `site/` instead reads the LikeC4 model live and
> joins it to content frontmatter at build/render time; `docsnip` gained no
> `graph.json` generator. Retained as the original design.

`docsnip` gains a generator that joins the model export with content frontmatter
into a single artifact under [`site-artifacts/`](../../site-artifacts), alongside
today's `examples-manifest.json` and `*.llms.txt`.

### 3.1 Shape

```jsonc
{
  "generatedFrom": { "model": "architecture/dist/model.json", "modelHash": "…" },
  "nodes": [
    {
      "id": "ucSpec",
      "kind": "specification",              // capability | specification | implementation | role | service
      "title": "Unity Catalog",
      "summary": "Open catalog specification for data & AI…",
      "maturity": "built",                  // from #built / #designed / #prototype
      "canonicalDoc": "design/catalog-plane.md",
      "sourceRepo": null,
      "links": ["https://www.unitycatalog.io"],
      "externalRefs": [ { "role": "spec", "url": "https://docs.unitycatalog.io" } ],
      "aliases": ["uc", "unity catalog"]    // §5
    }
    // …one node per model element…
  ],
  "modelEdges": [
    { "from": "ucSpec", "to": "lakehouse.catalog", "kind": "specifies" },
    { "from": "unityCatalogOSS", "to": "ucSpec", "kind": "implements" },
    { "from": "datafusion", "to": "lakehouse.queryEngine", "kind": "realizes" }
    // …typed edges lifted from model.json (specifies/implements/consumes/realizes/…)…
  ],
  "content": [
    {
      "path": "content/unitycatalog/how-to/uc-delta-api.md",
      "kind": "how-to",
      "project": "unitycatalog",
      "title": "…",
      "tags": ["unity-catalog", "delta-lake"],
      "references": ["ucSpec", "lakehouse.catalog"]  // tag-derived ∪ explicit
    }
    // …one entry per blog + content page…
  ],
  "backlinks": {
    "ucSpec": ["content/unitycatalog/how-to/uc-delta-api.md", "blogs/…"]
  },
  "coverage": { /* §4 */ }
}
```

The generator derives a content node's effective `references` as the union of
(a) explicit frontmatter `references:` and (b) `element:` ids of its tags.
`backlinks` is the inverse index — the basis for "referenced by" on entity pages.

### 3.2 Generation & freshness

Generation slots into the existing pipeline in
[`tools/docsnip`](../../tools/docsnip): `docsnip generate` writes `graph.json`
next to the other artifacts, and `docsnip check` drift-checks it exactly as it
already does for `llms.txt` and the manifest (regenerate into a temp dir, diff
against the committed copy, fail if stale). No new CI wiring is needed beyond
adding the artifact to the generate/check set.

## 4. Validation & coverage (tiered gate)

Because the model churns, we do **not** hard-fail on every unresolved reference.
The gate is tiered:

- **Tier 1 — malformed (fails CI).** A `references:` entry or a tag `element:`
  that is syntactically invalid, or an `externalRefs` entry missing `role`/`url`.
  These are author mistakes, always fatal.
- **Tier 2 — unresolved but well-formed (coverage gap, not fatal).** A reference
  to an element id that isn't (yet) in `model.json`. Recorded in the `coverage`
  block and surfaced as a warning — this is authoring ahead of the model, which we
  want to allow while the model is reworked.
- **Tier 3 — resolved (counts toward coverage).**

> **As-built: the tiered gate shipped; the persisted `coverage` block did not.**
> `docsnip validate` classifies references tier-1 (fatal) vs tier-2 (non-fatal
> coverage gap) as designed, but the tier-2 result is printed to stderr
> (`model-reference coverage: X/Y`, `explanation coverage: X/Y`) rather than
> written into a `graph.json` `coverage` block. The `unresolved` /
> `unreferencedElements` structure below is illustrative of the plan, not an
> on-disk artifact; the live UI equivalent is the "No explanation yet" gap rows
> in `site/src/pages/AxisIndex.tsx`.

The `coverage` block in `graph.json` records resolved vs unresolved references and
modeled-but-unreferenced elements:

```jsonc
"coverage": {
  "resolved": 41,
  "unresolved": [
    { "ref": "lakehouse.policyBundle", "from": ["blogs/cross-repo-abac/draft.md"] }
  ],
  "unreferencedElements": ["lakehouse.objectStorage"]   // modeled but no content yet
}
```

This makes correctness a *measurable, monotonic* property: the number of
unresolved references and unreferenced elements should trend to zero as the model
and content converge. Model rework is never blocked — a renamed element simply
shows up as a coverage gap until content (or an alias) catches up.

## 5. Id-stability / alias policy

Content references are only durable if element ids are. Since the model will be
reworked, we protect references with two rules:

1. **Stable slugs.** An element's id is treated as a stable public slug once it is
   referenced by content. Renames are discouraged; when unavoidable, they go
   through the alias map.
2. **Alias map.** A small map records prior/alternate ids for an element. The
   generator resolves a reference through aliases before declaring it unresolved,
   and emits the alias set into each node (see `aliases` in §3.1).

The alias map lives with the model (candidate: a `metadata { aliases "…" }` entry
on the element, or a sibling `architecture/aliases.yaml` if the model DSL is
awkward — decided during implementation). Crucially, the same alias set doubles as
a **disambiguation dictionary** for agents (§9): `"uc"`, `"Unity Catalog"`, and
`"the catalog"` all resolve to one canonical id.

## 6. `canonicals.yaml` — evaluation and recommendation

[`canonicals.yaml`](../canonicals.yaml) was copied from another repo. Assessing it
against the model + the generated index:

- **Overlap.** Its `capabilities`/`governance_roles`/`services` → doc/repo mapping
  duplicates `metadata.canonicalDoc` (on logical elements) and
  `metadata.sourceRepo` (on deployment services) — both already in `model.json`
  and both lifted into `graph.json`.
- **Drift.** It is currently *ahead* of the `.likec4` model: it lists
  `browserWasm` and multi-role `realizes` (e.g. `hydrofoil: [queryEngine, pdp,
  pep]`) that the model does not yet encode. Two registries that disagree is worse
  than one.
- **Irreducible remainder.** A few fields have no model home today: per-service
  `realizes` role lists, per-topology `trust`/`note`, and prose `note`s.

**Recommendation:** **subsume `canonicals.yaml` into the generated index.** Make
`model.json` (hence `graph.json`) the single source of the registry, and either
(a) move the irreducible fields into model `metadata`/`instanceOf` so they are
modeled facts, or (b) if the DSL can't express them cleanly, keep a *minimal*
`canonicals.yaml` holding only those residual fields, clearly marked as
"not derivable from the model." Either way, the human-facing navigation registry
becomes generated, not hand-maintained, eliminating the drift class entirely.
This is a migration with its own churn and existing consumers (the
`update-architecture` skill, human readers), so it is sequenced after the index
lands (§10).

## 7. Model consumption in `site/`

Today `site/` codegens LikeC4 only from `blogs/` (per-post self-contained models);
it never touches the estate model. This system adds two inputs:

- **`graph.json`** — imported like any other build input to drive nav, entity
  pages, backlinks, hover cards, and the mini-map.
- **The estate model views** — the site codegens/embeds views from
  `architecture/model` (or consumes `dist/model.json` + the generated
  webcomponent) so estate diagrams can render inline, not just per-blog ones.

This is a genuine new coupling between the site build and the architecture
package; it is called out as a trade-off in
[ADR-0004](../adr/ADR-0004-model-driven-information-system.md). Whether the site
reads `dist/model.json` directly or via a thin generated module is an
implementation choice (§11).

## 8. UX surfaces (prioritized)

Ordered by value-to-effort, all reading from `graph.json`:

1. **Entity pages + hover cards.** Every model element (capability, specification,
   implementation, role, service) resolves to a canonical card/page: summary,
   maturity badge, external expert links, canonical doc, neighbors (in/out edges),
   and "referenced by" backlinks. This is the join
   hub.
2. **Backlinks & related-by-topic.** Auto "referenced by" and "related content"
   (via shared references) — the graph-native replacement for hand-maintained
   see-also lists.
3. **Inline focused estate diagrams.** Embed estate views with the referenced node
   focused, e.g. `likec4=capabilityMap#focus=lakehouse.catalog` — "you are here"
   in the architecture.
4. **Contextual 1-hop mini-map.** A small live subgraph centered on the page's
   references, linking out to entity pages and expert sites.
5. **Dynamic/sequence views as embedded how-to explainers.** Flow views
   (`credentialVending`, and a future `policyDecisionFlow`) rendered inside
   explanation/how-to pages.
6. **Deployment-topology toggle.** "How this capability is realized across
   topologies" — the differentiator static docs can't match.
7. **Maturity honesty badges.** `#built`/`#designed`/`#prototype` auto-stamp
   content, enforcing the pre-release disclosure rule from the model.
8. **Glossary auto-linking.** Terms from [`../glossary.md`](../glossary.md)
   auto-link on first mention; terms that are also model elements get the full
   entity card.

## 9. Agent & LLM surface

The same index makes the site and the domain legible to machines. Agents are
first-class consumers, not an afterthought — the estate is itself about agentic
workloads.

- **Model-aware `llms.txt` / `llms-full.txt`.** Extend the existing generator
  ([`llmstxt.py`](../../tools/docsnip/src/docsnip/llmstxt.py)) so the index is
  organized by capability/specification and carries element descriptions, external
  expert links, maturity tags, and typed cross-references — the "understand the
  domain at large" artifact. This is the committed v1 machine surface.
- **Structured grounding / retrieval substrate.** `graph.json`'s typed nodes and
  edges give agents *structured* retrieval, not just embedding similarity: a
  question resolves to a capability + its `canonicalDoc` + the specifications and
  implementations that realize it + related content + the right LikeC4 view to cite.
- **Per-page machine context.** Each content page exposes its resolved references
  as structured metadata, so an agent reading one page gets the typed neighborhood
  (what this is, what realizes it, external sources, maturity) rather than only
  prose.
- **Deterministic entity linking.** The alias map (§5) doubles as a disambiguation
  dictionary: `"uc"` / `"Unity Catalog"` / `"the catalog"` → one canonical id.
- **Maturity-honest answers.** Maturity tags in the index let downstream agents
  avoid asserting unshipped behavior as fact — the pre-release disclosure rule,
  machine-enforced.
- **Grounded citations & view selection.** Because nodes link to `canonicalDoc`,
  external sites, and `sourceRepo`, agents can answer with pinned citations and
  pick the correct diagram/view to reference.
- **Queryable surface (documented future option).** Expose the index via a small
  API or MCP tool (cf. the spark-api MCP) so estate agents share one structural
  source of truth. Deferred behind the static `llms.txt`, not rejected.

## 10. Drift control & phasing

- **Name the journeys first.** Before building surfaces, name the top 2–3 reader
  journeys *and* agent journeys the system serves, so features are in service of
  them rather than l'art pour l'art.
- **Phase 1 — specifications + how-tos.** Extend `tags.yml` with `element:`/
  `externalRefs:` for the spec/implementation-mapped tags; add `references:` support and the
  tiered validation; generate `graph.json`; ship entity pages + backlinks +
  external links. This is where the model is stable and the payoff is immediate.
- **Phase 2 — diagrams inline.** Consume the estate model in `site/`; add focused
  views, mini-map, dynamic-view explainers, topology toggle.
- **Phase 3 — reconcile & subsume.** Reconcile the `canonicals.yaml`↔`.likec4`
  drift and subsume the registry into the generated index (§6). Expand references
  into capabilities/roles as the logical layer settles.
- **Ratcheting.** At every phase the coverage gate (§4) reports where linkage is
  thin; correctness is expected to improve monotonically, not arrive complete.
  (As-built: this is the ephemeral `docsnip validate` stderr report, not a
  persisted `graph.json` coverage block.)

## 11. Open questions

- **Entity pages: generated or authored?** Fully generated from `graph.json`, or a
  generated skeleton that authors can enrich with prose?
- **Mini-map: build-time or runtime?** Precompute 1-hop neighborhoods into
  `graph.json`, or query `model.json` client-side?
- **Alias map home:** element `metadata` in the DSL vs a sibling
  `architecture/aliases.yaml` — depends on how cleanly the LikeC4 DSL expresses
  multi-valued alias metadata.
- **`canonicals.yaml` residual:** can per-service `realizes` role lists and
  per-topology `trust` be fully modeled (making the file deletable), or is a
  minimal residual file unavoidable?
- **How aggressively to reconcile drift** before Phase 1 ships, given the model is
  slated for rework anyway.
