# The docs site as a model-driven information system

**Status:** design (companion to [ADR-0001](../decisions/ADR-0001-model-driven-information-system.md)).
**Scope:** cross-cutting — spans the LikeC4 model (`architecture/`), `blogs/`,
`content/`, `tools/docsnip`, and `site/`.

This document specifies the **connection mechanism** that lets the estate LikeC4
model impose structure and internal linkage on the documentation site. It is
deliberately independent of the model's *current* shape: the logical layer keeps
evolving, so what we commit to here is *how content joins the model* and *how that
join grows more correct over time* — not today's element list.

We turned `site/` from a docs+blog renderer into an **information system**: a reader
(human or agent) arriving at any page can see where the concept sits in the estate,
which specifications and implementations realize it, where the authoritative
external explanations live, how mature it is, and what else references it — without
any of that being hand-maintained per page. The model is the backbone; content links
*into* it and the model links *back out* to content.

Three framing commitments:

- **The model is evolving.** The durable deliverable is the join mechanism, not a
  commitment to today's capabilities/roles. References must tolerate rename and
  rework (see §5).
- **Specifications and how-tos are the primary anchor.** Specifications (Delta,
  Iceberg, the Iceberg REST & UC catalog specs, Parquet, the S3 API — see
  `architecture/adr/ADR-0004`) have the most stable external identities, already map
  to blog tags, and already carry `link`s to expert sites; implementations
  (DataFusion, Spark, Lakekeeper, …) are the next anchor. How-tos are where readers
  land. We start linkage there and expand into the abstract layer as it settles.
- **The index grows more correct over time.** Partial coverage is expected and
  *tracked*, never fatal (see §4). Correctness ratchets upward.

Narrative stays in `blogs/`; structural fact stays in the model
(`architecture/adr/ADR-0002`). This system is the connective tissue between them.

## 1. The join contract (hybrid)

Two vocabularies exist and must not be conflated: blog **tags** (discovery labels,
[`../../blogs/tags.yml`](../../blogs/tags.yml)) and model **element ids** (`ucSpec`,
`lakehouse.catalog`, …). The hybrid contract lets each do what it is good at.

```mermaid
flowchart LR
  content["Blog / How-to frontmatter"] -->|"tags[] (discovery)"| tagsyml["tags.yml entry"]
  content -->|"references[] (precise)"| elem["model element id"]
  tagsyml -->|"optional element:"| elem
  tagsyml -->|"optional externalRefs:"| ext["external expert sites"]
  elem -->|"resolve / alias"| modeljson["architecture/dist/model.json"]
  modeljson --> ui["explanation pages · ModelRef · focused diagrams · concepts.json · llms.txt"]
```

The review app reads the `.likec4` workspace live (via the
`likec4:single-project` Vite plugin over `architecture/model`). Emit and
`docsnip` read the committed
[`architecture/dist/model.json`](../../architecture/dist/model.json). Reader
artifacts (`llms.txt`, sitemap, `.md` twins, `concepts.json`) come from the
docs-site emitter ([`emit/docs`](../../emit/docs/)). (The former
`examples-manifest.json` — an engine/coverage matrix nothing consumed — was
removed; see [`build-pipeline.md`](./build-pipeline.md) §10.)

### 1.1 Tags gain optional structure (backward-compatible)

Today each entry in [`tags.yml`](../../blogs/tags.yml) is `tag: { description }`. We
extend it so a tag *may* additionally carry a model anchor and curated external
references. Description-only entries stay valid — this is purely additive.

```yaml
# blogs/tags.yml (extension)
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
When a tag has no `element:`, it remains a pure discovery label — the designed escape
hatch for the ~40% of tags with no structural counterpart.

### 1.2 Pages may declare precise references

For exact anchoring beyond coarse tags, blog drafts and `content/**` pages may add an
optional `references:` list of model element ids to frontmatter:

```yaml
# a how-to page's frontmatter
title: Read and write managed tables via the UC Delta API
diataxis: how-to
project: unitycatalog
references: [ucSpec, lakehouse.catalog]   # optional, precise, validated
```

Anchor targets may be *any* element id, but authors are guided to prefer
**specifications and implementations** (concrete, stable) over abstract
capabilities/roles while the logical layer is unsettled. See `content/README.md` for
the authoring surface (the inline `model:<id>` link and the page-level `references:`
list).

### 1.3 Worked example (specification-anchored)

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
specifies, the canonical design doc
([`catalog-plane.md`](../../architecture/design/catalog-plane.md)), the service that
realizes it, and the reference implementation — all derived, none hand-written. The
anchor is the *specification* (`ucSpec`), the most stable identity in the estate, so
the page's linkage survives even if `lakehouse.catalog` is renamed in a model rework.

## 2. Reading the model in `site/`

The review app consumes the LikeC4 estate model **live**. `site/src/explain.ts`
loads it via the `likec4:single-project` Vite plugin over `architecture/model`
and enumerates page-worthy kinds (`capability`, `concern`,
`openSpecification`, `implementation`). `site/src/explain-bindings.ts` maps
each `explains:` id to the content page that is that element's canonical URL.
There is no `/explain/<id>` route.

From the live model plus content frontmatter the app derives:

- `kind`, `title`, and `summary` (element `summary`, else the first sentence of
  `description`);
- typed neighbours (`specifies` / `implements` / `consumes` / `realizes` /
  `governs` / `dependsOn` / …);
- focused diagrams from `element.defaultView` (the `explain_*` views);
- inline `model:` links as `ModelRef` (label + neighborhood modal);
- the explanation backlog at `/plan/coverage`.

The **emitted** docs sites do **not** read the live plugin. They load the
committed [`architecture/dist/model.json`](../../architecture/dist/model.json)
and project only `#public` elements into `concepts.json`, JSON-LD, resolved
`model:` links, and environment service lists
([`emit/docs/model.mjs`](../../emit/docs/model.mjs),
[`projection.mjs`](../../site/src/content-core/projection.mjs)).

`docsnip query` also reads `model.json` (plus compatibility.json and generated
environments). No `graph.json` or `examples-manifest.json` is written.

## 3. Validation & coverage (tiered gate)

The gate is `docsnip check` (`docsnip validate` for frontmatter). Unknown
element ids **fail CI**. Coverage that lags the model **warns**.

- **Fails CI.** A `references:`, `explains:`, tag `element:`, or inline
  `model:` id that is not in `model.json`; a duplicate `explains:`; malformed
  frontmatter or `externalRefs` missing `role`/`url`.
- **Warns (stderr, not fatal).** Page-worthy elements with no `explains:`
  page (`explanation coverage: X/Y`); content pages with no model references
  (`model-reference coverage: X/Y`); `#public` citations missing, floating
  specs/implementations, Trestle concern gaps, unmodeled compat interfaces.

The live, human-facing equivalent of the explanation ratchet is
[`CoverageGaps.tsx`](../../site/src/components/plan/CoverageGaps.tsx) at
`/plan/coverage`. There is no on-disk coverage record.

Renames still fail until content is updated (the alias map in §4 is unbuilt).
Partial explanation coverage is expected and tracked, never fatal.

## 4. Id-stability / alias policy

Content references are only durable if element ids are. Since the model gets
reworked, we protect references with two rules:

1. **Stable slugs.** An element's id is treated as a stable public slug once it is
   referenced by content. Renames are discouraged; when unavoidable, they go through
   the alias map.
2. **Alias map.** A small map records prior/alternate ids for an element. Reference
   resolution passes through aliases before declaring a reference unresolved.

The alias map lives with the model (candidate: a `metadata { aliases "…" }` entry on
the element, or a sibling `architecture/aliases.yaml` if the DSL is awkward). The
same alias set doubles as a **disambiguation dictionary** for agents (§7): `"uc"`,
`"Unity Catalog"`, and `"the catalog"` all resolve to one canonical id.

## 5. `canonicals.yaml`

[`../../architecture/canonicals.yaml`](../../architecture/canonicals.yaml) is a small
hand-curated registry mapping capability/service → design-doc → source-repo. Much of
it overlaps `metadata.canonicalDoc` (logical elements) and `metadata.sourceRepo`
(deployment services), both already in `model.json`; a residue (per-service
`realizes` role lists, per-topology `trust`/`note`, prose notes) has no model home
today.

Because the site reads the model live rather than generating a join index, there is
**no generated registry to subsume `canonicals.yaml` into**. It is therefore
**kept** as-is: a live input to the `update-architecture` skill and a home for the
residual, non-model-expressible facts. When it drifts from the `.likec4` model
(historically it has run ahead of it), the fix is to reconcile the two — not to
delete the file. If a future rework can express every residual field as model
`metadata`/`instanceOf`, the file becomes deletable then; until then it stays.

## 6. UX surfaces (prioritized)

> **Status (2026-10).** The `/explain/<id>` pages and reader routes left the
> factory app in #153; readers now meet the model on ordinary explanation
> pages (`explains:`) and on the emitted docs sites. What ships there, and
> the re-prioritized plan, is in [`model-leverage.md`](./model-leverage.md).
> The numbered list below is the **historical factory UX**, not current
> behavior.

Ordered by value-to-effort as designed for `/explain` (do not implement from
this list; see `model-leverage.md`):

1. **Entity pages + hover cards.** Every model element resolves to a canonical
   card/page: summary, maturity badge, external expert links, canonical doc,
   neighbors (in/out edges), and "referenced by" backlinks. This was the join hub —
   served at `/explain/<id>`.
2. **Backlinks & related-by-topic.** Auto "referenced by" and "related content" (via
   shared references) — the graph-native replacement for hand-maintained see-also
   lists.
3. **Inline focused estate diagrams.** Embed estate views with the referenced node
   focused ("you are here" in the architecture).
4. **Contextual 1-hop mini-map.** A small live subgraph centered on the page's
   references, linking out to entity pages and expert sites.
5. **Dynamic/sequence views as embedded how-to explainers.** Flow views
   (`credentialVending`, a future `policyDecisionFlow`) rendered inside
   explanation/how-to pages.
6. **Deployment-topology toggle.** "How this capability is realized across
   topologies" — the differentiator static docs can't match.
7. **Maturity honesty badges.** `#built`/`#designed`/`#prototype` auto-stamp content.
8. **Glossary auto-linking.** Terms from
   [`../../architecture/glossary.md`](../../architecture/glossary.md) auto-link on
   first mention; terms that are also model elements get the full entity card.

## 7. Agent & LLM surface

> **Status (2026-10).** See [`model-leverage.md`](./model-leverage.md) §2–§3
> for an assessment of which of these surfaces earn their cost.

The same join makes the site and the domain legible to machines. Agents are
first-class consumers — the estate is itself about agentic workloads.

- **Model-aware `llms.txt` / `llms-full.txt`.** The generator
  ([`emit/docs/discovery.mjs`](../../emit/docs/discovery.mjs)) organizes the index by
  capability/specification and carries element descriptions, external expert links,
  maturity tags, and typed cross-references — the "understand the domain at large"
  artifact and the published machine surface.
- **Structured grounding / retrieval.** The model's typed nodes and edges give agents
  *structured* retrieval, not just embedding similarity: a question resolves to a
  capability + its `canonicalDoc` + the specs and implementations that realize it +
  related content + the right LikeC4 view to cite.
- **Per-page machine context.** Each content page exposes its resolved references so
  an agent reading one page gets the typed neighborhood, not only prose.
- **Deterministic entity linking.** The alias map (§4) doubles as a disambiguation
  dictionary: `"uc"` / `"Unity Catalog"` / `"the catalog"` → one canonical id.
- **Maturity-honest answers.** Maturity tags let downstream agents avoid asserting
  unshipped behavior as fact.
- **Grounded citations & view selection.** Because nodes link to `canonicalDoc`,
  external sites, and `sourceRepo`, agents can answer with pinned citations and pick
  the correct diagram/view.
- **Queryable surface (documented future option).** Expose the model via a small API
  or MCP tool (cf. the spark-api MCP) so estate agents share one structural source of
  truth. Deferred behind the static `llms.txt`, not rejected.

## 8. Phasing

- **Name the journeys first.** Before building surfaces, name the top 2–3 reader
  journeys *and* agent journeys the system serves, so features serve them.
- **Phase 1 — specifications + how-tos.** Extend `tags.yml` with
  `element:`/`externalRefs:` for the spec/implementation-mapped tags; add
  `references:` support and the tiered validation; ship entity pages + backlinks +
  external links from the live model. This is where the model is stable and the
  payoff is immediate.
- **Phase 2 — diagrams inline.** Add focused views, mini-map, dynamic-view
  explainers, topology toggle.
- **Phase 3 — expand upward.** Expand references into capabilities/roles as the
  logical layer settles; reconcile `canonicals.yaml` against the model as it drifts.
- **Ratcheting.** At every phase the tiered gate (§3) reports where linkage is thin;
  correctness improves monotonically rather than arriving complete.

## 9. Open questions

- **Entity pages: generated skeleton or authored?** Fully derived from the model, or
  a derived skeleton authors can enrich with prose?
- **Mini-map: build-time or runtime?** Precompute 1-hop neighborhoods, or query the
  model client-side?
- **Alias map home:** element `metadata` in the DSL vs a sibling
  `architecture/aliases.yaml` — depends on how cleanly the LikeC4 DSL expresses
  multi-valued alias metadata.
- **`canonicals.yaml` residual:** can per-service `realizes` role lists and
  per-topology `trust` eventually be fully modeled (making the file deletable), or is
  a minimal residual file permanent?
