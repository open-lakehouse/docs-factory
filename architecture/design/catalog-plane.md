# Catalog capability — realized by mangrove

**Logical capability:** `lakehouse.catalog` (also the resource **PIP** and the
credential-vending **PA** — see [`governance.md`](./governance.md)).
**Realized by:** `open-lakehouse/mangrove` (project: `unitycatalog-rs`).

The **catalog** capability governs **tables, schemas, and credentials** — the
surface every query resolves through. In our deployments it is realized by
**mangrove**, **a pluggable framework for building Unity Catalog APIs and
integrating with UC** — deliberately *not* a competing reimplementation of Unity
Catalog OSS.

## What it is (and isn't)

- It uses generic resource APIs + trestle codegen to stand up UC surfaces fast and
  **explore functionality ahead of** the official Java UC OSS.
- It can **proxy** to an upstream OSS Java UC for supported securables while
  **managing others itself**.
- It can **augment** surfaces UC doesn't cover yet (e.g. exposing Open Sharing
  "agent skills" as a resource type — built today).
- Scope also spans **Delta Sharing / Open Sharing** servers and the **Delta API**
  (the Delta v1 REST API also feeds Lakekeeper).

> **Trade-off, always stated:** mangrove moves faster but makes *fewer guarantees*
> than UC OSS. This is deliberate. Not a drop-in replacement.

## The piece being hardened

The **UC-backed DataFusion catalog provider** (`crates/datafusion`, modeled as the
`ucDatafusion` exemplar component) is the ecosystem-integration piece the estate
explicitly intends to **mature** for the Rust ecosystem — distinct from the
move-fast exploratory surface. It resolves tables through UC so credentials,
policy, and lineage can attach at resolution time (see credential vending).

## What it publishes

`olai-uc-*` crates (common / client / delta-api / sharing-client / object-store /
postgres / sqlite / datafusion / server / cli), the `uc` CLI, the `uc-server`
binary, and the `mangrove` Docker image.

## Patterns

Applies **composition** and **composable-UI** (its reusable UC components). See
[`patterns.md`](./patterns.md).

## Orientation

- `crates/delta-api/` (UC Delta v1 REST API → also Lakekeeper)
- `crates/datafusion/` (the provider to mature)
- `crates/query-wasm/` (in-browser query engine)
- `docs/src/content/docs/explanation/` (Starlight architecture docs)
