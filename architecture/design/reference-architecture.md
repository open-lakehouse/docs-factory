# Reference Open Lakehouse (the abstract layer)

The model is **layered**. This doc describes the *logical* layer — the abstract,
technology-agnostic reference open lakehouse: its capabilities and how they
compose. The *concrete* layer — our services realizing these capabilities across
deployment topologies — is in [`deployments.md`](./deployments.md). The
cross-cutting governance decomposition is in [`governance.md`](./governance.md).

> **Why two layers.** The generic reference architecture and our specific
> implementation are the *same architecture at different levels of realization*.
> LikeC4 expresses that with a **logical model** (technology-agnostic capabilities)
> and a **deployment model** (`instanceOf` places a capability into a concrete
> service/node). So the logical layer here carries **no repo, service, or infra
> names** — those appear only in deployment. See
> [ADR-0003](../adr/ADR-0003-logical-abstract-deployment-concrete.md).

## The capabilities

An open lakehouse serves warehouse-style governance and query over open table
formats on object storage. The reference model factors that into six capabilities:

| Capability | What it is |
|---|---|
| **Query engine** | Resolves tables through the catalog and executes over open table formats. Catalog-native: credentials, policy, and lineage attach at resolution/planning time. |
| **Catalog** | Governs tables, schemas, and credentials — the surface every query resolves through. Issues short-lived scoped storage credentials at resolution time (**credential vending**). |
| **Open table format** | Gives raw object-storage bytes *table semantics* — ACID transactions, schema, snapshots. The technology-agnostic layer that turns bytes into a governed, transactional table. |
| **Object storage** | The byte container where table data files are written. Beneath the table format. |
| **Lineage** | Captures dataset- and column-level provenance (OpenLineage) at query **planning time**. |
| **Governance** | Decides "can this principal do this here?" and governs what they see (row filters, column masks). A cross-cutting zero-trust decomposition — see [`governance.md`](./governance.md). |

## The capability chain

```
  query engine ──resolves──▶ catalog ──▶ table format ──manifests as──▶ object storage
       │                        │
       │ (planning time)        └─ vends short-lived scoped credentials
       ├──▶ governance   (policy decided + enforced in-plan)
       └──▶ lineage      (column-level provenance)
```

The load-bearing distinction the model makes explicit: **the table format is not
the object storage**. Object storage is *where the bytes live*; the open table
format is the layer that makes those bytes a coherent, versioned, governed table.
Both are first-class.

## Open table formats are first-class — and peer

**Delta Lake** and **Apache Iceberg** are modeled as **peer concrete formats**
that realize the abstract `tableFormat` capability. Neither is privileged in the
*concept* — the open lakehouse is deliberately multi-format. Where the *estate's
implementation* reality matters (we read via Delta today; Iceberg arrives via
Iceberg-REST interop through Lakekeeper), that shows up on **deployment** edges,
tagged for maturity — not on the format concept itself. See
[`deployments.md`](./deployments.md).

## The foundations (assemble on)

The reference lakehouse assembles on open source: **Apache DataFusion** (the
query/compute core), **Delta Lake** & **Apache Iceberg** (table formats),
**AWS Cedar** (the policy decision engine), **OpenLineage** (the lineage standard),
and **Unity Catalog** (the governance API surface the catalog builds and
integrates with). **Lakekeeper** is an Iceberg-REST catalog the estate can interop
with. The through-line: *assemble these foundations + build the connective tissue
they don't ship.*
