# Delta Lake Coverage Matrix — Synthesis Report

**Task:** #152 (Plan #139) — updated by Task #172 (Plan #161)
**Date:** 2026-03-27
**Sources:** Wave 1 reports 01–13 in `research/delta-lake/`

---

## Summary

This matrix consolidates coverage findings from Wave 1 research reports into a single per-journey × per-engine view. Engines assessed: **Apache Spark**, **delta-rs** (Rust/Python), **DuckDB**, **Polars**, **Daft**, **DataFusion** (as the delta-rs execution engine), **Trino**, **PrestoDB**, **Apache Flink**, and **ClickHouse** — ten engines total.

Key findings:

- **Apache Spark** is the only engine with complete coverage across all operation categories. Every DML operation, optimization, streaming feature, schema management operation, and protocol-management capability originates in Spark.
- **delta-rs / DataFusion** provides the deepest non-Spark coverage, supporting full read/write/DML (merge, delete, update), VACUUM, OPTIMIZE, CDF reads, and time travel. Critical gaps: no streaming, no Liquid Clustering, no Column Mapping, no CLONE/RESTORE, and CDF write is not implemented.
- **Polars** and **Daft** are read/write engines that delegate all DML and maintenance to delta-rs. Neither surfaces DELETE, UPDATE, VACUUM, OPTIMIZE, or CDF through their own APIs — users must drop down to `DeltaTable` directly. Daft additionally cannot read tables with deletion vectors or column mapping without workarounds.
- **DuckDB** is effectively read-only in production. Blind INSERT via `ATTACH` is available but carries active bugs (partitioned table writes, no write statistics before March 2026). No UPDATE, DELETE, MERGE, OPTIMIZE, or VACUUM.
- **Trino** provides full read/write + DML coverage with dedicated deep-dive validation (report 10). Supports all core DML (INSERT, DELETE, UPDATE, MERGE), deletion vectors (read + write), column mapping, time travel, VACUUM, and OPTIMIZE. Key gaps: no Liquid Clustering write, no managed commits, no UniForm write.
- **PrestoDB** is read-only (`presto-delta` connector). Built on Delta Kernel Java 3.3.2. Supports time travel (by version and timestamp), predicate pushdown, and partition pruning, but does not apply deletion vectors (correctness risk: soft-deleted rows may be returned). No write path of any kind.
- **Apache Flink** has a preview-status streaming write/source connector (Delta Standalone, latest 3.3.2). Supports append-only streaming writes and continuous streaming reads (`DeltaSource.forContinuousRowData`). The connector does not handle commits mixing add and remove actions, making it unsuitable for tables with row-level DML. Flink 2.0 is incompatible; the connector is in maintenance mode as of Delta 4.0.
- **ClickHouse** provides read access via the `DeltaLake` table engine backed by delta-kernel-rs (default since v25.5). Experimental append-only INSERT write is available on S3/GCS (requires `allow_experimental_delta_lake_writes = 1`; Azure writes not yet supported). No DML beyond INSERT. Supports CDF reads, column mapping (name mode), predicate and partition pushdown, and time travel via session setting.
- **Streaming** is primarily Spark Structured Streaming. Flink supports append-only streaming sink (`DeltaSink`) and continuous streaming source (`DeltaSource`). No other engine implements a native Delta streaming source or sink.
- **Optimization operations** (OPTIMIZE, Z-Order, Liquid Clustering, Auto Compaction) require a write-capable engine. Spark is the only engine with full coverage; delta-rs supports OPTIMIZE bin-packing and Z-Order but not Liquid Clustering or Auto Compaction; Trino supports OPTIMIZE bin-packing.

**Legend:**
- ✅ Supported and documented
- ⚠️ Supported but undocumented, unstable, or requires manual delta-rs call (not exposed via engine's own API)
- ❌ Not supported
- — Not applicable

---

## Coverage Matrix

### Fundamentals

| Journey / Operation | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Read — full table scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read — predicate pushdown (filter) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Read — projection pushdown (column pruning) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (corrected) | ✅ |
| Read — partition pruning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Read — deletion vector support | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (corrected) | ❌ | ❌ | ⚠️ |
| Write — create table | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Write — append | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| Write — overwrite (full table) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Write — overwrite (predicate / replaceWhere) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Write — dynamic partition overwrite | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Time travel — by version number | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (corrected) | ✅ |
| Time travel — by timestamp | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (corrected) | ✅ |
| Table metadata inspection (schema, history, detail) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ | ⚠️ |
| Storage config — S3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Storage config — Azure ADLS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Storage config — GCS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Idempotent writes (txnAppId / txnVersion) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Quick-start / getting-started tutorial | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ |

### Table Operations

| Journey / Operation | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| DELETE (row-level predicate) | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| UPDATE (row-level predicate) | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| MERGE / upsert | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| MERGE — WHEN NOT MATCHED BY SOURCE | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| MERGE — schema evolution | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| Schema enforcement on write | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ |
| Schema evolution — merge (add columns) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ⚠️ (corrected) | ❌ |
| Schema evolution — overwrite (replace schema) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Schema evolution — add columns via ALTER | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Schema evolution — rename / drop columns (Column Mapping) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Generated columns | ✅ | ❌ | — | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Identity columns | ✅ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Default column values | ✅ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| NOT NULL constraint | ✅ | ❌ | — | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| CHECK constraint | ✅ | ✅ | — | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Type widening (manual / auto schema evolution) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| VACUUM | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| OPTIMIZE — bin-packing compaction | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| OPTIMIZE — Z-Order | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Liquid Clustering (CLUSTER BY) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Auto Compaction | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Optimized Write | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RESTORE | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| SHALLOW CLONE / CLONE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CONVERT TO DELTA (from Parquet) | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| CONVERT TO DELTA (from Iceberg) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GENERATE (manifest files for external engines) | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| REORG TABLE (apply / purge) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deletion Vectors — enable | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ✅ (corrected) | ❌ | ❌ | ❌ |
| Row Tracking | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Concurrent writes — S3 safety (DynamoDB locking) | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| ALTER TABLE DROP FEATURE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Catalog-Managed Tables | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Change Data / Streaming

| Journey / Operation | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Change Data Feed — enable on table | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Change Data Feed — batch read | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Change Data Feed — streaming read | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change Data Feed — write (emit change files during DML) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delta as streaming source (readStream) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (corrected) | ❌ |
| Delta as streaming sink (writeStream) | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Streaming — ignoreDeletes / ignoreChanges | ✅ | ❌ | — | — | — | — | — | — | ✅ (corrected) | — |
| Streaming — startingVersion / startingTimestamp | ✅ | ❌ | — | — | — | — | — | — | ✅ (corrected) | — |
| Streaming — schema tracking (Column Mapping compat) | ✅ | ❌ | — | — | — | — | — | — | ❌ | — |
| Idempotent streaming writes (txnAppId / txnVersion) | ✅ | ❌ | — | — | — | — | — | — | ❌ | — |
| Streaming — foreachBatch + merge pattern | ✅ | ❌ | — | — | — | — | — | — | ⚠️ (corrected) | — |

### Explanation (Conceptual / Architecture)

| Journey / Topic | Official Docs (delta.io) | delta-rs Docs | DuckDB Docs | Polars Docs | Daft Docs |
|---|:---:|:---:|:---:|:---:|:---:|
| Delta architecture / transaction log | ✅ | ✅ | ⚠️ | ❌ | ⚠️ |
| ACID transactions explanation | ✅ | ✅ | ❌ | ❌ | ❌ |
| File skipping / data skipping | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Concurrency control (OCC / conflict matrix) | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| Protocol versioning / feature flags | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| UniForm / Iceberg interoperability | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delta Kernel (building custom connectors) | ✅ | — | — | — | — |
| Multi-engine ecosystem overview | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| Partitioning — when and how | ✅ | ⚠️ | ❌ | ❌ | ✅ |
| Z-Order vs Liquid Clustering tradeoffs | ⚠️ | ⚠️ | ❌ | ❌ | ❌ |
| Schema enforcement vs. schema evolution | ✅ | ⚠️ | ❌ | ❌ | ❌ |

### Reference

| Reference Material | Official Docs (delta.io) | delta-rs Docs | DuckDB Docs | Notes |
|---|:---:|:---:|:---:|:---:|
| Table properties reference | ⚠️ | ⚠️ | ❌ | Official docs list only 12 of many properties |
| Version compatibility matrix (Delta ↔ Spark) | ✅ | ❌ | ❌ | Only Spark-centric; no delta-rs version matrix |
| Delta feature → minimum version table | ✅ | ❌ | ❌ | |
| Storage configuration reference (per cloud) | ✅ | ✅ | ✅ | GCS has open bugs in both DuckDB and delta-rs |
| API reference — Python (`deltalake`) | — | ✅ | — | Complete method signatures |
| API reference — Rust (`deltalake` crate) | — | ✅ | — | docs.rs coverage |
| Exception / error reference | ✅ | ⚠️ | ❌ | delta-rs exceptions page has no code examples |
| Protocol specification (PROTOCOL.md) | ⚠️ | — | — | Lives on GitHub; not linked from main docs nav |
| Migration guide (Parquet→Delta, version upgrades) | ✅ | ✅ | — | delta-rs 1.0.0 breaking changes documented |
| Best practices | ⚠️ | ⚠️ | ❌ | Spark best practices: 4 topics only; no streaming, security, or schema practices |
| FAQ | ⚠️ | ❌ | ❌ | No performance, security, cost, or troubleshooting coverage |

---

## Protocol Feature Support

This section is a condensed view of the per-engine protocol feature compatibility limited to the ten engines in this file. For the full matrix including Athena, see `protocol-feature-matrix.md`.

### Reader Protocol Versions

| Protocol Level | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Reader v1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reader v2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Reader v3 | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ? |

Notes:
- **Flink**: Delta Standalone only supports protocol (1,2). Tables at reader v2/v3 raise `InvalidProtocolVersionException`.
- **DuckDB**: Reader v3 supported for known features; tables using unsupported v3 features (e.g., `v2Checkpoint`) cause a read error.
- **Polars**: Reader v3 supported only with an allowlist (`deletionVectors`). Other v3 features (e.g., `columnMapping`, `v2Checkpoint`, `timestampNtz`) raise `DeltaProtocolError`.
- **Daft**: Supports v3 reads for features backed by delta-rs, but `deletionVectors` raises `NotImplementedError` unless bypassed.
- **ClickHouse**: Uses delta-kernel-rs as the default read path (v25.5+), which claims v3 support in principle, but ClickHouse documentation does not explicitly confirm full reader v3 feature coverage.

### Writer Protocol Versions

| Protocol Level | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Writer v1–v2 | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| Writer v3–v6 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Writer v7 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

Notes:
- **PrestoDB**: Read-only connector; no write path at any protocol level.
- **DuckDB**: Write is append-only blind insert at v1/v2 level; no constraint enforcement; hard-blocked at writer v3+.
- **Flink**: DeltaSink writes at v1/v2 level; no support for constraint-enforcing or advanced protocol features.
- **ClickHouse**: Experimental write (`allow_experimental_delta_lake_writes = 1`); append-only INSERT on S3/GCS; protocol write level not explicitly documented beyond basic append.

### Reader Table Features

| Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| columnMapping | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ |
| deletionVectors | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ? |
| v2Checkpoint | ✅ | ✅ | ❌ | ? | ? | ✅ | ⚠️ | ? | ❌ | ? |
| typeWidening | ✅ | ✅ | ? | ? | ? | ✅ | ⚠️ | ? | ❌ | ? |
| variantType | ✅ | ? | ? | ? | ? | ? | ? | ? | ❌ | ? |

Notes:
- **columnMapping — PrestoDB** ⚠️: Logical schema resolved correctly via Delta Kernel, but physical Parquet column lookup in `id` mode has unconfirmed edge cases.
- **columnMapping — ClickHouse** ✅: `name` mode supported (fix in v25.5 PR #78921); `id` mode behavior undocumented.
- **deletionVectors — PrestoDB** ❌: `DeltaPageSourceProvider` reads Parquet files directly without calling `Scan.transformPhysicalData()`; logically deleted rows are returned.
- **deletionVectors — Flink** ❌: Delta Standalone only handles protocol (1,2); deletion-vector tables raise `InvalidProtocolVersionException`.
- **deletionVectors — ClickHouse** ?: delta-kernel-rs upstream supports deletion vectors; ClickHouse documentation does not explicitly confirm.
- **v2Checkpoint — Trino** ⚠️: Read supported; write not supported.
- **typeWidening — Trino** ⚠️: Read supported; write not supported.

### Writer Table Features

| Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| invariants | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ❌ | ❌ |
| appendOnly | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ |
| checkConstraints | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| generatedColumns | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| allowColumnDefaults | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| changeDataFeed | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ |
| rowTracking | ✅ | ? | ❌ | ? | ❌ | ? | ? | ❌ | ❌ | ❌ |
| domainMetadata | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ? | ❌ | ❌ | ❌ |
| icebergCompatV1 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ |
| icebergCompatV2 (UniForm) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ |
| vacuumProtocolCheck | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| inCommitTimestamp | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| catalogManaged | ✅ | ? | ⚠️ | ? | ❌ | ? | ❌ | ❌ | ❌ | ❌ |
| clustering (Liquid Clustering) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ |

Notes:
- **changeDataFeed — delta-rs / DataFusion / Polars / ClickHouse** ⚠️: Can read existing CDF data but do not produce `AddCDCFile` actions during DML writes. Tables configured with `delta.enableChangeDataFeed = true` will have stale/empty CDF streams for writes from these engines.
- **icebergCompatV1/V2 — Trino** ⚠️: Trino can read tables with UniForm/IcebergCompat features enabled but cannot write or maintain the corresponding metadata.
- **clustering — Trino** ⚠️: Trino can read liquid-clustered tables (PR #22330) but cannot create or write them (issue #22811 open).
- **inCommitTimestamp — Trino** ⚠️: Surfaces values in `$history` table for reads; write-side generation unconfirmed.
- **PrestoDB** ❌ (all writer features): Read-only connector with no write path.
- **Flink** ❌ (all writer features except appendOnly): Append-only sink has no constraint enforcement, no CDF production, no protocol feature awareness beyond basic log writes.
- **ClickHouse** ❌ (most writer features): Experimental append-only write path; no constraint enforcement, no CDF production, no protocol feature enforcement.

---

## Notes on Data Quality

### Source reliability
All per-engine cells in the Fundamentals, Table Operations, and Change Data / Streaming sections for Spark, delta-rs, DuckDB, Polars, Daft, and DataFusion are drawn from dedicated Wave 1 per-engine reports (01–07), which are authoritative for those engines. The **Trino** column was initially sourced from the ecosystem scan (report 09) and community signals (report 08); it has been updated and corrected in this revision based on the dedicated Trino deep-dive report (10). The **PrestoDB** and **ClickHouse** columns are derived from their respective deep-dive reports (11 and 13). The **Flink** column was initially sourced from reports 08 and 09; it has been updated and corrected in this revision based on the dedicated Flink deep-dive report (12).

### Corrections from deep-dive reports

The following cells were corrected when the dedicated deep-dive reports were integrated:

**Trino corrections (from report 10 — `10-engine-trino.md`):**
- **Read — deletion vector support**: ⚠️ → ✅ (corrected). Trino supports deletion vectors for both read and write; enabled per-table via `deletion_vectors_enabled` property or globally via config. The ⚠️ was drawn from the shallower ecosystem scan.
- **Deletion Vectors — enable**: ❌ → ✅ (corrected). Trino can enable deletion vectors on tables via the `deletion_vectors_enabled` table property.
- **Time travel by version/timestamp**: Already ✅ in original — confirmed correct by deep-dive.
- **Dynamic partition overwrite**: Already ✅ in original — confirmed correct by deep-dive.

**Flink corrections (from report 12 — `12-engine-flink.md`):**
- **Read — projection pushdown**: ❌ → ✅ (corrected). `DeltaSource.forBoundedRowData` supports column projection (column pruning) in the bounded (batch) mode.
- **Time travel — by version number**: ❌ → ✅ (corrected). Bounded mode supports `versionAsOf(n)`; continuous mode supports `startingVersion(n)`.
- **Time travel — by timestamp**: ❌ → ✅ (corrected). Bounded mode supports `timestampAsOf("...")`; continuous mode supports `startingTimestamp("...")`.
- **Delta as streaming source (readStream)**: ❌ → ✅ (corrected). `DeltaSource.forContinuousRowData` provides a native streaming source. The original entry was conflating Spark Structured Streaming API with Flink streaming source capability.
- **Streaming — ignoreDeletes / ignoreChanges**: ❌ → ✅ (corrected). The Flink connector exposes `ignoreDeletes=true` and `ignoreChanges=true` options on the continuous source.
- **Streaming — startingVersion / startingTimestamp**: ❌ → ✅ (corrected). Both `startingVersion` and `startingTimestamp` options are supported on the continuous source.
- **Streaming — foreachBatch + merge pattern**: ❌ → ⚠️ (corrected). The Flink continuous source can consume incremental changes with `ignoreChanges=true`, but actual MERGE must be applied by another engine; this is a partial CDC workaround, not native foreachBatch+merge support.
- **Schema evolution — merge (add columns)**: ❌ → ⚠️ (corrected). The Flink sink supports `withMergeSchema(true)` for additive schema changes; removing columns causes commit failure.
- **Catalog integration (DeltaCatalog)**: ❌ → ✅ (SQL only) (corrected). `DeltaCatalog` is required and supported for SQL/Table API usage; DDL is reflected in `_delta_log`.

### Cell interpretation caveats

**Polars ⚠️ cells:** Polars delegates all DML and maintenance to delta-rs. A ⚠️ cell for Polars typically means the operation is possible by calling `DeltaTable` directly after importing `deltalake`, but Polars exposes no wrapper method. This creates a two-library workflow that is not documented in the Polars user guide. Examples: DELETE, UPDATE, VACUUM, OPTIMIZE, CDF batch read, RESTORE.

**Daft ⚠️ cells:** Daft's write-to-Unity-Catalog path (`UnityCatalogTable` target) is partial — catalog registration for new tables is listed as an open roadmap item. The streaming sink (`sink_delta` via Polars) is marked unstable. Daft's `ignore_deletion_vectors=True` workaround is categorized ❌ (not supported without risk) rather than ⚠️ because enabling it may return stale rows.

**DuckDB write ⚠️ cells:** The DuckDB append cell is ⚠️ rather than ✅ because of active bugs as of the research date: partitioned-table writes were broken (issue #280), and write statistics were only added in PR #290 (merged 2026-03-13). Prior inserts written by DuckDB lack data-skipping metadata.

**DataFusion ⚠️ cells:** DataFusion is the internal execution engine of delta-rs. The DataFusion column in this matrix refers to the DataFusion integration as documented in the delta-rs docs site (the `QueryBuilder` and `DeltaTableProvider` path accessible to Python users). Most cells match delta-rs because the Python API wraps the same Rust operations. Notable divergence: `schema_mode="merge"` on MERGE has a known type-coercion bug (issue #2642) and a `List<Struct>` failure mode (issue #3339).

**Trino concurrent-write ⚠️:** Trino requires `delta.enable-non-concurrent-writes` for S3 and has no collision detection when writing alongside other engines. This is technically documented in Trino's own docs but not in Delta Lake's Trino stub page.

**PrestoDB cells:** PrestoDB is read-only. All write, DML, and maintenance cells are ❌ by design. The deletion vector ❌ is a correctness risk, not an availability gap: PrestoDB opens and reads deletion-vector tables without error but returns logically deleted rows because `Scan.transformPhysicalData()` is not called. The column mapping ⚠️ reflects correct logical-schema resolution via Delta Kernel but unconfirmed physical Parquet column lookup behavior in `id` mode.

**ClickHouse ⚠️ cells:** Write cells are ⚠️ because write support is experimental (`allow_experimental_delta_lake_writes = 1`), append-only, and Azure-blocked. The Azure ADLS storage cell is ⚠️ because reads are supported but writes to Azure are explicitly not yet available. Time travel is supported but via session setting (`delta_lake_snapshot_version`) rather than SQL `FOR VERSION AS OF` syntax. Catalog-managed table support is ✅ for read (Unity Catalog, AWS Glue, OneLake via `DataLakeCatalog` engine).

**Flink streaming source ✅ cells:** The Flink `DeltaSource.forContinuousRowData` provides a streaming source, but it is limited to tables that do not mix AddFile and RemoveFile actions in the same commit (i.e., tables written exclusively by `DeltaSink` or external append-only engines). Tables that receive DELETE, UPDATE, or MERGE from Spark or other write-capable engines require `ignoreChanges=true`, which causes duplicate row processing and is not true CDC semantics. The ✅ applies to the append-only streaming use case.

### Known documentation gaps surfaced across all reports
1. **Streaming best practices** are absent from all documentation. The official docs' Best Practices page covers only batch scenarios.
2. **Multi-engine feature comparison** does not exist anywhere in official Delta docs. Users cannot determine which features are readable by which engines without consulting each engine's separate documentation.
3. **Column Mapping support matrix** is absent. Which engines support reading tables with Column Mapping enabled is underdocumented; several engines silently fail or produce wrong results on such tables.
4. **Deletion Vector compatibility matrix** is absent. Which engine versions added DV read support is not consolidated anywhere.
5. **Version-gating inconsistency** in official docs: some features note minimum Delta version in the page title; others bury it or omit it.
6. **Security / access control** is entirely absent from all documentation sites. Storage-level credential config is covered but column-level and row-level security are not.
7. **delta-rs has no streaming support** and this is not flagged as a known limitation anywhere in the delta-rs docs — users migrating from Spark would need to discover this independently.
8. **Flink connector status** is materially incomplete: the delta.io Flink stub page is one sentence; the actual capabilities and limitations (no Flink Table API SQL for some operations, no mixed add+remove commits, maintenance mode status) are underdocumented on the official site.
9. **PrestoDB deletion vector correctness risk** is undocumented in both PrestoDB and Delta Lake official documentation. No warning is surfaced to users that deletion-vector-enabled tables may return stale rows.
10. **ClickHouse write limitations** (experimental flag, Azure not supported, no DML beyond INSERT) are not consolidated in the Delta Lake documentation ecosystem; users must read ClickHouse's own changelogs and PR descriptions to discover the current write boundary.
