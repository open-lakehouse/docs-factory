---
title: What is Delta Lake?
summary: An engine-neutral introduction to the Delta Lake open table format.
diataxis: explanation
project: delta
engines: []
delta_features: []
status: ready
references:
  - deltaSpec
  - parquetSpec
  - lakehouse.tableFormat
---

Delta Lake is an open [table format](model:deltaSpec): a specification for laying
out data files ([Parquet](model:parquetSpec)) plus a transaction log so that many
engines can read and write the same tables with ACID guarantees. It is not tied to
any single engine — Spark, the `deltalake` Python package, delta-rs (Rust), DuckDB,
and Polars all read Delta tables.

## The transaction log

A Delta table is a directory of Parquet data files alongside a `_delta_log`
directory. Each commit appends a JSON file to the log describing what changed —
which files were added or removed. Readers reconstruct the current table state by
replaying the log; periodic checkpoints keep that fast. This log is what gives
Delta its defining properties:

- **ACID transactions** — a commit either lands atomically or not at all.
- **Time travel** — because the log records every version, readers can ask for the
  table as of an earlier version.
- **Schema enforcement and evolution** — the log carries the schema and its history.

## Why "open" matters

Because the format is a published specification rather than an engine feature, a
Delta table written by one engine can be read by another. The counter-force to
fragmentation is the trend toward shared **kernels** — see
[Delta kernel architecture](./delta-kernel-architecture.md).

## Related

- [Delta kernel architecture](./delta-kernel-architecture.md)
- [Read a Delta table](../how-to/read-a-delta-table.md)
