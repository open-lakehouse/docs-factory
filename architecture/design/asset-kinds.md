# Governed asset kinds (the subject axis)

The model is **layered** (logical vs deployment; see
[`reference-architecture.md`](./reference-architecture.md)) and, within the
logical layer, **typed by altitude** (capability ← specification ←
implementation; see [ADR-0004](../adr/ADR-0004-capability-specification-implementation.md)).
This doc describes a third dimension the logical layer carries: the **governed
asset kinds** — the *nouns* the lakehouse manages along the data & AI value chain.

> **Verbs vs nouns.** Capabilities are what the platform *does* (catalog, query
> engine, table format, governance, model tracking). Asset kinds are what it
> *governs* (table, volume, function, model, agent skill). Both are first-class;
> they meet at two edges — `dependsOn` and `governs`. **Concerns** (governance,
> lineage, observability) span both, through a third edge, `appliesTo`.

## What an asset kind is

An **asset kind** (`element asset`) is a technology-agnostic, **type-level**
subject: the *kind* "table", not a specific table. A specific table or model is
an *instance*, created by users at runtime — it lives in the runtime/deployment
world and never appears in the logical model, exactly as a running process is a
deployment `service` and not a logical `capability` (see
[ADR-0003](../adr/ADR-0003-logical-abstract-deployment-concrete.md)).

Unity Catalog's name for an asset kind is a **securable**. The logical layer uses
the vendor-neutral term `asset`; the glossary records the mapping.

The set, limited to kinds a tracked compatibility journey acts on:

| Asset kind | What it is |
|---|---|
| **Schema / namespace** | The container securable — the namespace other kinds are organized and governed within. |
| **Table** | The tabular securable: rows and columns with ACID semantics. The one kind every catalog handles. |
| **Volume** | Governed non-tabular files — a catalogued path in object storage. |
| **Function** | A governed, reusable unit of computation (UDF / routine) the query engine resolves and runs. |
| **Model** | A governed ML model — versions, stages, and lineage catalogued like data. |
| **Agent skill** | An emerging kind: a shareable, governed capability an AI agent can discover and invoke. |
| **View** (`sqlView`) | A stored query with a schema and no data of its own; the engine expands it at query time. `view` is a LikeC4 keyword, hence the ID. |
| **Metric view** | A view that declares measures and dimensions once, so every engine computes a metric the same way. |
| **Credential** | A catalogued long-lived cloud identity, used only to mint scoped storage credentials. |
| **External location** | A governed storage path prefix bound to the credential that reaches it. |

Deferred until a journey acts on them: shares, connections, and MCP servers.

## The three edges

### `dependsOn` — what a kind is materialized on

An asset kind `dependsOn` the capabilities (or other kinds) it is materialized
on. ADR-0005 named this edge `requires`, but no such relationship kind was ever
declared; the model uses the generic `dependsOn` (ADR-0006,
[ADR-0007](../adr/ADR-0007-cross-cutting-concerns.md)). The edges in
`model/logical/assets.likec4` today:

```
  namespace        ──dependsOn──▶ catalog
  table            ──dependsOn──▶ table format, object storage, catalog
  view             ──dependsOn──▶ table, query engine
  metric view      ──dependsOn──▶ view, query engine
  volume           ──dependsOn──▶ object storage, catalog
  function         ──dependsOn──▶ query engine, catalog
  model            ──dependsOn──▶ object storage, model tracking, catalog
  skill            ──dependsOn──▶ volume, sharing, catalog
  credential       ──dependsOn──▶ storage credential issuer
  external location──dependsOn──▶ object storage, credential
```

This is the capability-coverage lens: a platform that only has table-format and
object-storage capabilities can materialize **tables**, and nothing else. Views
and metric views reach the catalog through what they're defined over.

### `governs` — which catalog covers which kinds (breadth)

The breadth of asset kinds a catalog covers is a property of the **catalog
specification**, so it is modeled there:

- **Unity Catalog** governs the full set: schema, table, volume, function, model,
  agent skill.
- **Iceberg REST catalog** is table-centric: namespaces + tables (+ views).

That gap — one catalog spec governs data **and** AI assets; the other governs
tables — is the differentiator, and here it is a **structural fact of the graph**
rather than a marketing claim. The `assetGovernanceBreadth` view renders it
directly.

### `operatesOn` — which clients and engines act on which kinds

An implementation `operatesOn` an asset kind when the software is
architecturally able to act on that kind through one or more contracts. The
edge belongs to the implementation, not to a versioned compatibility
interface: Spark 4.1 and Spark 4.2 both map to `apacheSpark`.

This edge records breadth, not an operation result. It does not imply that
create, read, update, or delete all work. `architecture/journeys/` names those
reader journeys, and runnable claims or recorded evidence determine each
cell. A ready working claim can verify an `operatesOn` edge; a modeled edge
without a claim remains modeled but unverified.

## Maturity

Asset *kinds* are conceptual and carry no maturity tag. A `governs` edge may
be tagged `#designed` where a catalog's coverage of a kind is not yet real
(the tag is declared; do not bulk-apply). The agent-skill augmentation is
built today (Open Sharing "agent skills" as a resource type — see
[`catalog-plane.md`](./catalog-plane.md)), so its edge is not degraded.
Incomplete realization of built coverage uses `#partial`.

## The sharing capability

Agent skills exposed this dimension's first genuinely new *capability*: they are
governed by the catalog but *distributed* through **Sharing** — a first-class,
technology-agnostic capability specified by **Open Sharing** (the open profile of
the Delta Sharing protocol). "Sharing" is deliberately the right altitude: wider
("data exchange") dilutes it, narrower ("agent-skill distribution") wrongly ties a
capability to one asset kind. A table *can* be shared but doesn't depend on
sharing to exist, so it has no edge to it; an agent skill does, so
`agentSkill ──dependsOn──▶ sharing` ("distributed through").

## Views

- **`assetGovernanceBreadth`** — the hero: catalog specifications and the asset
  kinds they `govern`. Shows UC's data & AI breadth against the table-centric
  Iceberg REST catalog.
- **`assetCapabilities`** — asset kinds and the capabilities they are
  `registeredIn`, `locatedAt`, or `dependsOn`, without the capability chain.
- **`concernMatrix`** — the concerns and the asset kinds and capabilities they
  `appliesTo` ([ADR-0007](../adr/ADR-0007-cross-cutting-concerns.md)).
