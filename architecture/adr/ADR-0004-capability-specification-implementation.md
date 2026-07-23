# ADR-0004: Capability / specification / implementation typing

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-18 |
| Supersedes | — |
| Superseded by | — |

## Context

The logical layer had a single kind, `foundation`, for every external technology
the lakehouse assembles on. In practice it conflated three genuinely different
things:

- **Delta / Iceberg** — these are *specifications* of the open-table-format
  concept, not runnable software.
- **DataFusion / Spark / Lakekeeper / MLflow** — these are *implementations*
  (some libraries, some servers).
- **Unity Catalog** — *both* a specification (the UC REST/catalog API) *and*
  reference implementations of it.

Two industry references sharpened the fix. The Lance "Lakehouse Stack" layering
separates, at every layer, the **spec/definition** ("just libraries and
definitions") from the **compute** ("things that have servers"): a catalog spec
(Iceberg REST, UC) vs a catalog service; a table-format spec (Delta, Iceberg) vs
an engine that reads it. Backstage's software catalog makes **API a first-class
entity, separate from the Component that implements it** — "APIs are implemented
by components and form boundaries between components." Both point at the same
distinction our single `foundation` kind was hiding.

We also hit the recurring "how do I model the interface to infrastructure?"
question (object storage): is it a capability, a resource, a spec? The answer
falls out of the same typing (see below).

## Considered Options

- **Keep `foundation`** — one kind, minimal vocabulary, but permanently
  conflates concept / contract / software and can't express "X implements spec Y."
- **Two logical systems (reference + implementation)** — duplicates structure;
  rejected in [ADR-0003](./ADR-0003-logical-abstract-deployment-concrete.md).
- **Split by altitude: capability / specification / implementation (chosen)** —
  three kinds along one axis, with edges (`specifies`, `implements`, `consumes`,
  `realizes`) that make the chain explicit. Matches Backstage (API↔Component) and
  the Lance layering.

## Decision

The logical technology catalog is typed along three altitudes:

- **`capability`** — the abstract concept (catalog, query engine, table format,
  file format, object storage, lineage, governance, model tracking,
  observability). The reference architecture.
- **`openSpecification`** — an open standard / protocol / format definition; the
  contract side (Backstage's "API"). Pure definition, no compute. It `specifies`
  the capability it defines. (The kind id is `openSpecification` because
  `specification` is a reserved LikeC4 block keyword; its label is "Specification".)
- **`implementation`** — concrete software. It `implements` a specification
  (Backstage `providesApi`) and/or `consumes` one (`consumesApi`), or `realizes`
  a capability directly when there is no shared spec (query engines). Compute
  posture is an intrinsic, optional `#service` / `#library` / `#infra` marker;
  *running* instances live in the deployment layer as `service` / `datastore`
  nodes (per ADR-0003).

Edges added: `specifies` (spec→capability), `implements` (impl→spec, dotted),
`consumes` (impl→spec, dashed). `realizes` (impl→capability) is retained.

The `foundation` kind is **retired**. Existing foundations were re-typed:
Delta/Iceberg → table-format specs; Iceberg REST + UC → catalog specs; Parquet →
file-format spec; DataFusion/Spark → query-engine implementations; Lakekeeper →
implements the Iceberg REST spec; UC-OSS → implements the UC spec; MLflow →
realizes model tracking. Two new capabilities were added: **`fileFormat`**
(beneath table format) and **`observability`**; `mlLifecycle` was renamed
**`modelTracking`**.

### Modeling infrastructure (the object-storage / S3 example)

Infrastructure fits the *same* typing — it is not special. Object storage appears
at four altitudes, and the confusion comes from collapsing them:

- **Concept** — `capability objectStorage` (kept; it is a real layer of the
  reference chain `tableFormat → fileFormat → objectStorage`).
- **Interface** — `openSpecification s3Api` `specifies → objectStorage`. The S3
  API is the de-facto contract; this is the "interface to infrastructure."
- **Implementation** — `implementation` (MinIO, AWS S3, …) `implements → s3Api`,
  tagged `#infra`.
- **Instance** — a provisioned bucket is a deployment `datastore` node (Backstage
  "Resource"), where trust posture lives.

General rule: **concept = capability, contract = specification, provider =
implementation, provisioned thing = deployment resource/datastore.** Where the
contract is a real standard (S3 API, JDBC, SQL) you get a specification node;
where it is not, the implementation realizes the capability directly. A dependency
like "the catalog requires an object store" is `consumes → s3Api` at the contract
altitude and `service → datastore` at the runtime altitude.

## Consequences

### Positive
- The model expresses "X implements spec Y" and "engine Z consumes API Y" — the
  distinctions the Lance stack and Backstage treat as first-class.
- Specifications are the most stable, most externally-documented anchors in the
  estate, which strengthens the content-to-model join in the docs-factory
  [information-system decision](../../docs/decisions/ADR-0001-model-driven-information-system.md).
- The infrastructure-modeling question has one reusable answer.
- The reference chain gained `fileFormat` and `observability`, closing obvious gaps.

### Negative / Trade-offs
- More element kinds and edges to keep coherent; the `foundation → spec/impl`
  split is a one-time migration that touched views and prose.
- Brand splits (Delta = spec + implementations; UC = spec + UC-OSS) mean a single
  product name can now be several model elements; authors must pick the right one.
- The current catalog is deliberately shallow (a first set of examples); coverage
  grows over time rather than being exhaustive today.
