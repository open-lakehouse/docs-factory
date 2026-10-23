# ADR-0008: One meaning per relationship kind, and the rules for applying the vocabulary

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-23 |
| Supersedes | — |
| Superseded by | — |
| Amends | [ADR-0006](./ADR-0006-system-boundary-and-generic-relations.md) (`partOf`, the `dependsOn` refinements), [ADR-0007](./ADR-0007-cross-cutting-concerns.md) (asset → capability edges, parent concerns) |

## Context

ADRs 0003–0007 set the vocabulary: capabilities, specifications,
implementations, asset kinds, and concerns, joined by typed edges. The
vocabulary held up; how it was applied did not.

- **`dependsOn` carried five meanings.** An asset registered in the catalog, an
  asset's files at a storage path, a view defined over a table, an engine built
  on another engine, and a deployment node calling a datastore were all
  `dependsOn`, told apart only by free-text titles. ADR-0006 named the specific
  edges that would refine it (`resolves`, `reads`, `vends`, `enforces`); only
  `reads` was ever declared, and nothing used it.
- **`realizes` and `implements` had no rule.** `mangrove` implements the Unity
  Catalog spec and realizes the catalog capability; `unityCatalogOSS` and
  `lakekeeper` only implement a spec, so "what realizes the catalog?" needed two
  hops for some catalogs and one for others. A connector (`deltaSpark`)
  realized the query engine it plugs into.
- **Concern scope was declared twice.** `governance` and its facet
  `governance.authorization` each applied to the same ten asset kinds.
- **`instanceOf` pointed at both altitudes.** Generated deployment nodes are
  instances of implementations; hand-drawn ones were instances of capabilities.
- **Titles repeated the kind** ("realizes the query-engine capability",
  "implements", "governs"), and ids followed no rule (`ucSpec` vs `s3Api`,
  `ucCli` vs `unityCatalogPythonSdk`).
- Declared vocabulary went unused: the `store` element kind, the `browser`
  deployment node, `partOf`, and `reads`.

## Considered Options

- **Controlled titles on `dependsOn`.** No new kinds; a lint holds the titles to
  a fixed verb list. Cheapest, but the meaning stays in a string that no view
  predicate or consumer can select on.
- **A few specific kinds that refine `dependsOn` (chosen).** Each kind has one
  meaning and fixed endpoint kinds; `dependsOn` stays as the true fallback.
- **One kind per verb.** Precise, but it multiplies the kinds every consumer and
  view has to know.

## Decision

**Dependency refinements.** Five kinds refine `dependsOn`. A coarse traversal
takes their union with `dependsOn`.

| Kind | Source → target | Meaning |
|---|---|---|
| `registeredIn` | asset → catalog | The catalog records the asset. Every asset kind has one. |
| `locatedAt` | asset → objectStorage or volume | The asset names a path there. |
| `derivedFrom` | asset → asset | Type-level: an instance can be defined over instances of the target. One edge per allowed source kind. |
| `builtOn` | implementation → implementation | The required core the implementation can't run without. |
| `uses` | person → capability; deployment node → node | A caller and what it calls. |

`dependsOn` remains for what no refinement fits: the capability chain
(`queryEngine → catalog → tableFormat → fileFormat → objectStorage`), a
credential's issuer, a concern's dependency on a capability, and an optional
integration between implementations, which carries `#optional`
(`polars -[dependsOn]-> deltaRs { #optional }`). `flows` is kept for data or
control flow only: orchestration, gateway routes, and dynamic-view steps.

`partOf` and `reads` are removed. Nesting already expresses composition inside
the boundary, and `builtOn` covers composition between implementations.

**A volume stores nothing.** A volume is catalog metadata that names a path, so
it is `locatedAt` object storage like an external location, never "stored in"
it. Other catalogs are converging on the same concept as a directory; the model
keeps the Unity Catalog term until a specification exists.

**Every implementation realizes directly.** An implementation that provides a
capability or concern has a `realizes` edge to it, whether or not it also
implements a specification. When it `implements` a spec that `specifies` a
capability, it also `realizes` that capability, so the question "what realizes
X?" is always one hop. A connector or extension is `builtOn` its host and does
not realize the host's capability. Clients (`#client`) and infrastructure
(`#infra`) are exempt: they consume specs and act on assets.

**A parent concern carries no `appliesTo` of its own.** When a concern has
facets, its scope is the union of its facets' edges.

**`instanceOf` targets an implementation.** A deployment node is an instance of
software, never of a capability. The capability is reached through the
implementation's `realizes`.

**Titles add information or are omitted.** A title that restates the kind is
dropped. Otherwise it is a short lowercase verb phrase that completes "source …
target" (`operatesOn "creates and lists"`).

**Ids follow one rule per kind.**

- Specifications: `<name>Spec`.
- Implementations: the upstream project's name in camelCase; the Unity Catalog
  family is `unityCatalog*`.
- Asset kinds: a singular noun, qualified only when the bare noun is a LikeC4
  keyword (`sqlView`, `mlModel`).

**Compute posture is a tag**: `#service`, `#library`, `#client` (CLIs, SDKs,
agent-tool bridges), or `#infra`.

## Consequences

### Positive
- A view predicate or a consumer can select a meaning by kind instead of
  parsing titles.
- "What realizes X?" and "what does this deployment run?" are one hop
  everywhere.
- The rules are mechanical, so `docsnip check` can hold the model to them.

### Negative / Trade-offs
- More relationship kinds for authors and consumers to know; a coarse
  dependency query has to name the refinements.
- Direct `realizes` duplicates what `implements` + `specifies` imply. The lint
  keeps the two in step rather than the author.
- The id rule renames ids that content, compatibility journeys, and the Trestle
  catalog reference, so the rename lands as one migration together with a
  Trestle release.
- The model converges on these rules over several changes. Until each lands,
  parts of it still follow the old usage.
