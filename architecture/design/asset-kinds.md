# Governed asset kinds (the subject axis)

The model is **layered** (logical vs deployment; see
[`reference-architecture.md`](./reference-architecture.md)) and, within the
logical layer, **typed by altitude** (capability ← specification ←
implementation; see [ADR-0005](../adr/ADR-0005-capability-specification-implementation.md)).
This doc describes a third dimension the logical layer carries: the **governed
asset kinds** — the *nouns* the lakehouse manages along the data & AI value chain.

> **Verbs vs nouns.** Capabilities are what the platform *does* (catalog, query
> engine, table format, governance, model tracking). Asset kinds are what it
> *governs* (table, volume, function, model, agent skill). Both are first-class;
> they meet at two edges — `requires` and `governs`.

## What an asset kind is

An **asset kind** (`element asset`) is a technology-agnostic, **type-level**
subject: the *kind* "table", not a specific table. A specific table or model is
an *instance*, created by users at runtime — it lives in the runtime/deployment
world and never appears in the logical model, exactly as a running process is a
deployment `service` and not a logical `capability` (see
[ADR-0003](../adr/ADR-0003-logical-abstract-deployment-concrete.md)).

Unity Catalog's name for an asset kind is a **securable**. The logical layer uses
the vendor-neutral term `asset`; the glossary records the mapping.

The first-pass set:

| Asset kind | What it is |
|---|---|
| **Schema / namespace** | The container securable — the namespace other kinds are organized and governed within. |
| **Table** | The tabular securable: rows and columns with ACID semantics. The one kind every catalog handles. |
| **Volume** | Governed non-tabular files — a catalogued path in object storage. |
| **Function** | A governed, reusable unit of computation (UDF / routine) the query engine resolves and runs. |
| **Model** | A governed ML model — versions, stages, and lineage catalogued like data. |
| **Agent skill** | An emerging kind: a shareable, governed capability an AI agent can discover and invoke. |

## The two edges

### `requires` — what a platform must do to manage a kind

Each asset kind `requires` the capabilities needed to manage it. **Every** kind
requires the **catalog** — that is what makes it a governed securable at all —
and then the domain capabilities that actually *materialize* it:

```
  table    ──requires──▶ catalog, table format, query engine
  volume   ──requires──▶ catalog, object storage
  function ──requires──▶ catalog, query engine
  model    ──requires──▶ catalog, model tracking
  skill    ──requires──▶ catalog, sharing
  schema   ──requires──▶ catalog
```

This is the capability-coverage lens: a platform that only has table-format and
query-engine capabilities can manage **tables**, and nothing else. Managing
models means having a model-tracking capability; managing volumes means governing
object storage as first-class securables rather than raw paths; managing agent
skills means having a **sharing** capability (Open Sharing) as the distribution
surface a catalog reuses to vend a new resource kind.

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

## Maturity

Asset *kinds* are conceptual and carry no maturity tag. A `governs` edge may be
tagged `#designed` where a catalog's coverage of a kind is not yet real; the
agent-skill augmentation is built today (Open Sharing "agent skills" as a
resource type — see [`catalog-plane.md`](./catalog-plane.md)), so its edge is not
degraded.

## The sharing capability

Agent skills exposed this dimension's first genuinely new *capability*: they are
governed by the catalog but *distributed* through **Sharing** — a first-class,
technology-agnostic capability specified by **Open Sharing** (the open profile of
the Delta Sharing protocol). "Sharing" is deliberately the right altitude: wider
("data exchange") dilutes it, narrower ("agent-skill distribution") wrongly ties a
capability to one asset kind. The edge stays specific — only `agentSkill
-[requires]-> sharing` — because a table *can* be shared but does not *require*
sharing to exist.

## Views

- **`assetGovernanceBreadth`** — the hero: catalog specifications and the asset
  kinds they `govern`. Shows UC's data & AI breadth against the table-centric
  Iceberg REST catalog.
- **`assetCapabilities`** — asset kinds and the capabilities they `require`.
