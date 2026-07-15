# Lineage capability — realized by headwaters

**Logical capability:** `lakehouse.lineage` (also a dynamic **PIP** — see
[`governance.md`](./governance.md)). **Realized by:** `open-lakehouse/headwaters`.

The **lineage** capability answers *"where did this data come from, and where does
it flow?"* In our deployments it is realized by **headwaters** — **OpenLineage on
Apache DataFusion**: it emits column-level data lineage at planning time and
ingests OpenLineage events into a queryable store with a read API and UI. A
Rust-native take **inspired by, not a drop-in for, Marquez**.

## The two halves

1. **Capture** — `datafusion-openlineage` instruments the DataFusion plan at
   planning time (see planning-time capture) to emit column-level lineage. This is
   the crate hydrofoil consumes.
2. **Ingest + read** — the `headwaters` service ingests OpenLineage events into a
   Postgres-backed store and exposes a read API (+ React UI) to query the lineage
   estate.

## Lead application of the agentic-CLI pattern

`hw` is the **lead, built-out application** of the estate's agent-optimized CLI
pattern (ADR-0014, `docs/agent-cli-design.md`): a multi-mode render
(table / json / agent), an interpreted `agent` envelope that prunes noise and
appends `_next` follow-up hints, a `schema` capabilities primer, and task-shaped
**question-verbs** that return the answer rather than an endpoint dump. This is
where the estate's "and AI" is real effort. See [`patterns.md`](./patterns.md).

## What it publishes

`datafusion-openlineage`, `openlineage-client` (engine-agnostic event model +
emit client), `headwaters-client` / `headwaters-proto`, the `hw` CLI, the
`headwaters` service binary, and a Docker image.

## Patterns

Applies **composition**, **composable-UI** (headless lineage components), and is
the lead of **agentic-cli**.

## Orientation

- `crates/open-lineage/src/rule.rs` (planning-time column-level lineage)
- `docs/adr/` (lineage design decisions 0001–0014)
- `docs/open-lineage-design.md`, `docs/agent-cli-design.md`
