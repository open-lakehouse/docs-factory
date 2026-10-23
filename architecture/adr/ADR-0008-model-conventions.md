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
  Catalog spec and realizes the catalog capability; `unityCatalogServer` and
  `lakekeeper` only implement a spec, so "what realizes the catalog?" needed two
  hops for some catalogs and one for others. A connector (`deltaSpark`)
  realized the query engine it plugs into.
- **Concern scope was declared twice.** `governance` and its facet
  `governance.authorization` each applied to the same ten asset kinds.
- **`instanceOf` pointed at both altitudes.** Generated deployment nodes are
  instances of implementations; hand-drawn ones were instances of capabilities.
- **Titles repeated the kind** ("realizes the query-engine capability",
  "implements", "governs"), and ids followed no rule (`unityCatalogSpec` vs `s3Spec`,
  `unityCatalogCli` vs `unityCatalogPythonSdk`).
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

**Dependency refinements.** Six kinds refine `dependsOn`. A coarse traversal
takes their union with `dependsOn`.

| Kind | Source → target | Meaning |
|---|---|---|
| `registeredIn` | asset → catalog | The catalog records the asset. Every asset kind has one. |
| `locatedAt` | asset → objectStorage or volume | The asset names a path there. |
| `derivedFrom` | asset → asset | Type-level: an instance can be defined over instances of the target. One edge per allowed source kind. LikeC4 allows no self-edge, so a kind that can derive from itself (a view over views) says so in its description. |
| `builtOn` | implementation → implementation | The required core the implementation can't run without (hydrofoil on DataFusion). |
| `integrates` | host engine → implementation | The plugin or library that adds a spec's support to the host: Delta Spark, the Iceberg Spark runtime, and the Unity Catalog connector in Spark; DuckDB's extensions; delta-rs in Polars. |
| `uses` | person → capability; deployment node → node | A caller and what it calls. |

`dependsOn` remains for what no refinement fits: the capability chain
(`queryEngine → catalog → tableFormat → fileFormat → objectStorage`), a
credential's issuer, and a concern's dependency on a capability. `flows` is kept for data or
control flow only: orchestration, gateway routes, and dynamic-view steps.

`partOf` and `reads` are removed. Nesting already expresses composition inside
the boundary, and `builtOn` and `integrates` cover composition between
implementations.

**A volume stores nothing.** A volume is catalog metadata that names a path, so
it is `locatedAt` object storage like an external location, never "stored in"
it. Other catalogs are converging on the same concept as a directory; the model
keeps the Unity Catalog term until a specification exists.

**Every implementation realizes directly.** An implementation that provides a
capability or concern has a `realizes` edge to it, whether or not it also
implements a specification. When it `implements` a spec that `specifies` a
capability, it also `realizes` that capability, so the question "what realizes
X?" is always one hop. Clients (`#client`) are exempt: they consume specs and
act on assets. So is software that provides no capability in the model, such
as a gateway or agent tooling.

**Spec support an engine gets from elsewhere sits on the integration.** A host
engine `integrates` the plugin or library that adds a spec's support, whether
it ships as a plugin (a Spark connector, a DuckDB extension) or as a library
the engine calls (delta-rs in Polars). The integration carries the spec edge,
not the engine, so "which formats and catalogs does engine X support?" is
always `X -[integrates]-> I -[implements|consumes]-> spec`, plus X's own
edges for support built into it. An integration doesn't realize its host's
capability; one that implements a table format realizes the table format.

**Formats are implemented; APIs are consumed.** Whatever reads or writes a
format's bytes `implements` the format spec (Delta Lake, Iceberg, Parquet). A
client of an API spec (Unity Catalog, Iceberg REST) `consumes` it, and a server
`implements` it.

The model records what can work. Which engine works against which catalog
server, at which release, stays in the compatibility journeys.

**A parent concern carries no `appliesTo` of its own.** When a concern has
facets, its scope is the union of its facets' edges.

**`instanceOf` targets an implementation.** A deployment node is an instance of
software, never of a capability. The capability is reached through the
implementation's `realizes`.

**Dynamic views put explanation first.** A sequence view exists to explain a
mechanism, such as credential vending, so it may mix capabilities and
implementations when that explains the mechanism better than one layer would.

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
