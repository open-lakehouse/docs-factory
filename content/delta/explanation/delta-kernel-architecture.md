---
title: Delta kernel architecture
summary: How a shared kernel library lets many engines speak Delta without diverging.
diataxis: explanation
project: delta
engines: []
delta_features: []
status: published
---

As more engines read and write Delta, each one reimplementing the protocol risks
divergence — subtle disagreements about what a table contains. The **Delta kernel**
addresses this: a shared library that implements the protocol once, so engines
consume it rather than rewriting it.

## The idea

A kernel splits responsibilities in two:

- **The kernel** owns everything protocol-specific: reading the transaction log,
  resolving the current set of files, applying features like deletion vectors and
  column mapping, and planning scans.
- **The engine** owns everything environment-specific: reading bytes from storage,
  parsing Parquet and JSON, evaluating expressions, and representing data in memory.

The engine implements a small interface the kernel calls into; the kernel hands
back a plan the engine executes. Because protocol logic lives in one place, a new
feature is implemented once and every kernel-backed engine gets it correctly.

## Two implementations

- **`delta-kernel-rs`** (Rust) — powers DuckDB, ClickHouse, and delta-rs.
- **Java Delta Kernel** — powers engines such as StarRocks and Apache Druid.

Both expose the same conceptual split (a protocol core plus an engine/connector
interface), so this explanation is deliberately language-agnostic.

## Related

- [What is Delta Lake?](./what-is-delta-lake.md)
- [Table features](../reference/table-features.md)
