# Delta Lake Engine Support Matrix

**Plan:** #161 — Wave 3 consolidation (Task #175)
**Date:** 2026-03-27
**Sources:** Wave 1 research reports 01–15 + Wave 2 synthesis files + protocol-feature-matrix.md

---

## Overview

Fifteen Wave 1 and Wave 2 research reports surveyed Delta Lake documentation coverage across twelve compute engines (Apache Spark, delta-rs/DataFusion, DuckDB, Polars, Daft, Trino, Apache Flink, PrestoDB, ClickHouse, AWS Athena, and BigQuery) plus the official delta.io and delta-rs documentation sites. The research produced three Wave 2 synthesis files and a protocol feature matrix. The synthesis files cover: a per-journey × per-engine coverage matrix (expanded to ten write-capable/read-capable engines), a gap analysis identifying 27 distinct documentation gaps ranked by community signal strength and engine reach, and a 70-journey Diátaxis-structured inventory. A protocol feature matrix (`protocol-feature-matrix.md`) was added in Plan #161 to capture the per-feature × per-engine compatibility data across all eleven scored engines (Spark, delta-rs/DataFusion, DuckDB, Polars, Daft, Trino, PrestoDB, Flink, ClickHouse, Athena, and BigQuery).

The overarching finding is that **Apache Spark is the only fully documented engine**, that the delta-rs ecosystem (Python/Rust, Polars, Daft) covers a substantial portion of operations but almost entirely without cross-engine comparison content, and that a small set of high-traffic journeys — MERGE with schema evolution, concurrent S3 writes, VACUUM + time travel retention, UniForm compatibility, and protocol version ceiling failures — account for the majority of community frustration signals. The 27 gaps break into three types: documentation gaps (feature implemented but not explained), engine coverage gaps (feature absent in non-Spark engines), and content clarity gaps (documentation exists but generates persistent community confusion). Ecosystem outreach opportunities were identified where working with engine maintainers (delta-rs, Daft, DuckDB, Trino, Flink, PrestoDB, ClickHouse) would close gaps more efficiently than writing Delta-side documentation alone.

---

## Engine Support Matrix

> **Legend:**
> - ✅ Supported and documented
> - ⚠️ Supported but undocumented, unstable, or requires manual delta-rs call (not exposed via engine's own API)
> - ❌ Not supported
> - — Not applicable

### Fundamentals

| Journey / Operation | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Read — full table scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read — predicate pushdown (filter) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Read — projection pushdown (column pruning) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read — partition pruning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Read — deletion vector support | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| Write — create table | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Write — append | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ |
| Write — overwrite (full table) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Write — overwrite (predicate / replaceWhere) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Write — dynamic partition overwrite | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Time travel — by version number | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Time travel — by timestamp | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
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
| Schema evolution — merge (add columns) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ⚠️ | ❌ |
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
| Deletion Vectors — enable | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
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
| Delta as streaming source (readStream) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Delta as streaming sink (writeStream) | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Streaming — ignoreDeletes / ignoreChanges | ✅ | ❌ | — | — | — | — | — | — | ✅ | — |
| Streaming — startingVersion / startingTimestamp | ✅ | ❌ | — | — | — | — | — | — | ✅ | — |
| Streaming — schema tracking (Column Mapping compat) | ✅ | ❌ | — | — | — | — | — | — | ❌ | — |
| Idempotent streaming writes (txnAppId / txnVersion) | ✅ | ❌ | — | — | — | — | — | — | ❌ | — |
| Streaming — foreachBatch + merge pattern | ✅ | ❌ | — | — | — | — | — | — | ⚠️ | — |

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

## Protocol Feature Support Matrix

This matrix maps every named Delta protocol feature and protocol version requirement against eleven query and processing engines. Each cell indicates whether the engine can fully read **and** write tables that use the feature (✅), can read but not write or has partial/unconfirmed support (⚠️), is blocked entirely by the feature (❌), has no applicable relationship with the feature (—), or has unconfirmed status from available sources (?). Derived from `protocol-feature-matrix.md`.

**Legend:** ✅ Read + write supported | ⚠️ Read-only, partial, or experimental | ❌ Blocked / unsupported | — Not applicable | ? Unconfirmed

### Reader Protocol Versions

| Protocol Level | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Reader v1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reader v2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Reader v3 | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ? | ⚠️ |

Notes:
- **Flink**: Delta Standalone only supports protocol (1,2). Tables at reader v2/v3 raise `InvalidProtocolVersionException`.
- **DuckDB**: Reader v3 supported for known features; tables using unsupported v3 features (e.g., `v2Checkpoint`) cause a read error.
- **Polars**: Reader v3 supported only with an allowlist (`deletionVectors`). Other v3 features (e.g., `columnMapping`, `v2Checkpoint`, `timestampNtz`) raise `DeltaProtocolError`.
- **Daft**: Supports v3 reads for features backed by delta-rs, but `deletionVectors` raises `NotImplementedError` unless bypassed.
- **ClickHouse**: Uses delta-kernel-rs as the default read path (v25.5+), which claims v3 support in principle, but ClickHouse documentation does not explicitly confirm full reader v3 feature coverage.
- **Athena**: Native read (engine v3), reader v1–v3 claimed; advanced v3 features (deletion vectors, v2Checkpoint) not explicitly confirmed.

### Writer Protocol Versions

| Protocol Level | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Writer v1–v2 | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ❌ |
| Writer v3–v6 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Writer v7 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

Notes:
- **PrestoDB**: Read-only connector; no write path at any protocol level.
- **DuckDB**: Write is append-only blind insert at v1/v2 level; no constraint enforcement; hard-blocked at writer v3+.
- **Flink**: DeltaSink writes at v1/v2 level; no support for constraint-enforcing or advanced protocol features. In maintenance mode as of Delta 4.0.
- **ClickHouse**: Experimental write (`allow_experimental_delta_lake_writes = 1`); append-only INSERT on S3/GCS; Azure writes not supported; protocol write level not explicitly documented beyond basic append.

### Reader Table Features

| Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| columnMapping | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ? |
| deletionVectors | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ? | ? |
| v2Checkpoint | ✅ | ✅ | ❌ | ? | ? | ✅ | ⚠️ | ? | ❌ | ? | ? |
| typeWidening | ✅ | ✅ | ? | ? | ? | ✅ | ⚠️ | ? | ❌ | ? | ? |
| variantType | ✅ | ? | ? | ? | ? | ? | ? | ? | ❌ | ? | ? |

Notes:
- **columnMapping — PrestoDB** ⚠️: Logical schema resolved correctly via Delta Kernel, but physical Parquet column lookup in `id` mode has unconfirmed edge cases.
- **columnMapping — ClickHouse** ✅: `name` mode supported (fix in v25.5 PR #78921); `id` mode behavior undocumented.
- **deletionVectors — PrestoDB** ❌: `DeltaPageSourceProvider` reads Parquet files directly without calling `Scan.transformPhysicalData()`; logically deleted rows are returned (silent correctness failure).
- **deletionVectors — Flink** ❌: Delta Standalone only handles protocol (1,2); deletion-vector tables raise `InvalidProtocolVersionException`.
- **deletionVectors — ClickHouse** ?: delta-kernel-rs upstream supports deletion vectors; ClickHouse documentation does not explicitly confirm.
- **v2Checkpoint — Trino** ⚠️: Read supported; write not supported.
- **typeWidening — Trino** ⚠️: Read supported; write not supported.
- **variantType**: GA in Delta 4.0 / Spark 4.0; no other engine has confirmed support.

### Writer Table Features

| Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| invariants | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| appendOnly | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ❌ |
| checkConstraints | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| generatedColumns | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| allowColumnDefaults | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| changeDataFeed | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ | ❌ |
| rowTracking | ✅ | ? | ❌ | ? | ❌ | ? | ? | ❌ | ❌ | ❌ | ❌ |
| domainMetadata | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ? | ❌ | ❌ | ❌ | ❌ |
| icebergCompatV1 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| icebergCompatV2 (UniForm) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| vacuumProtocolCheck | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| inCommitTimestamp | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| catalogManaged | ✅ | ? | ⚠️ | ? | ❌ | ? | ❌ | ❌ | ❌ | ❌ | ❌ |
| clustering (Liquid Clustering) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ |

Notes:
- **changeDataFeed — delta-rs / DataFusion / Polars / ClickHouse** ⚠️: Can read existing CDF data but do not produce `AddCDCFile` actions during DML writes. Tables with `delta.enableChangeDataFeed = true` will have stale/empty CDF streams for writes from these engines.
- **icebergCompatV1/V2 — Trino** ⚠️: Trino can read tables with UniForm/IcebergCompat features enabled but cannot write or maintain the corresponding metadata.
- **clustering — Trino** ⚠️: Trino can read liquid-clustered tables (PR #22330) but cannot create or write them (issue #22811 open).
- **inCommitTimestamp — Trino** ⚠️: Surfaces values in `$history` table for reads; write-side generation unconfirmed.
- **icebergCompatV2 — DuckDB** ❌: DuckDB writes fail on tables with `icebergWriterCompatV1` (issue #289). Reads of UniForm-enabled Delta tables work.
- **PrestoDB** ❌ (all writer features): Read-only connector with no write path.
- **Flink** ❌ (all writer features except appendOnly): Append-only sink; no constraint enforcement, no CDF production, no protocol feature awareness beyond basic log writes.
- **ClickHouse** ❌ (most writer features): Experimental append-only write path; no constraint enforcement, no CDF production, no protocol feature enforcement.

For full footnotes and cross-engine compatibility risk scenarios, see `protocol-feature-matrix.md`.

---

## Top 10 Priority Journeys for Content Generation

Ranked by combined priority score from the gap analysis (community signal strength × engines affected) and confirmed against the journey inventory's P0/P1 prioritization. Rankings updated from Plan #139 based on the 27-gap analysis in Plan #161.

### 1. Engine feature comparison matrix
**Gap:** G03 (Priority score: 44, updated) | **Journey inventory:** Reference — "Engine support matrix" (P0)
**Rationale:** No page on docs.delta.io answers "can engine X do operation Y?" with any completeness. Delta issue #1775 explicitly names this gap with 16 comments. With eleven engines now documented (up from 7), the scope of the gap has increased materially. The Wave 2 engine deep-dives for Trino, PrestoDB, Flink, and ClickHouse raise both the engine count and the priority score from 28 to 44. This single deliverable would address the most-asked class of community questions and is the input dependency for all other content decisions.

### 2. UniForm compatibility — which engines break when UniForm is enabled
**Gap:** G27 (Priority score: 40, new) | **Journey inventory:** How-to — "Configure a Delta table to use UniForm for Iceberg reader compatibility" (P1)
**Rationale:** Community signal 5/5. DuckDB writes fail silently with `Unknown feature 'icebergWriterCompatV1'` error (issue #289). delta-rs cannot enable UniForm at all (issue #3299). Flink and PrestoDB have no documented UniForm read/write paths. ClickHouse's Iceberg engine could theoretically consume UniForm-generated metadata but this is untested. The UniForm docs page on docs.delta.io focuses entirely on Spark enablement with no guidance on what happens to non-Spark readers and writers. Eight of eleven engines are affected.

### 3. Liquid Clustering availability and limitations for non-Spark users
**Gap:** G06 (Priority score: 32, updated) | **Journey inventory:** How-to — "Enable and use Liquid Clustering instead of Z-Ordering" (P1)
**Rationale:** Community signal 4/5. Delta-rs #2043 (11 comments). Liquid Clustering is absent from delta-rs, Polars, Daft, and DuckDB. Trino can read but not write liquid-clustered tables. Flink, PrestoDB, and ClickHouse have no liquid clustering support at all. The official Delta docs recommend Liquid Clustering over Z-Order without noting that the majority of non-Spark engines cannot create or recluster tables with it.

### 4. Protocol version ceiling — engines failing silently on tables with advanced writer features
**Gap:** G26 (Priority score: 30, new) | **Journey inventory:** Explanation — "How Delta Lake's protocol versioning system works" (P1)
**Rationale:** Community signal 5/5. PrestoDB returns logically-deleted rows silently. DuckDB issues opaque errors (issue #289). Flink throws `InvalidProtocolVersionException` (issue #2874). Polars raises `DeltaProtocolError` for v3 reader features outside its allowlist. As Delta tables accumulate writer features (deletion vectors, column mapping, UniForm, inCommitTimestamp), non-Spark engines hit their protocol ceiling in distinct and poorly-documented failure modes. No page on docs.delta.io translates protocol version requirements into engine-specific operational guidance.

### 5. MERGE / upsert with schema evolution
**Gap:** G01 (Priority score: 20) | **Journey inventory:** How-to — "MERGE with schema evolution" (P0)
**Rationale:** Highest community signal strength (5/5). Delta #553 (20 comments), delta-rs #3339, and Databricks' 2021 FAQ still cited 5 years later. The official docs treat MERGE and schema evolution as separate pages without a worked example that combines them. Edge cases (new columns from source, list-of-structs, type widening) are undocumented. A single how-to walking through the full MERGE + schema evolution workflow, with explicit callouts for which engines support which variant, would close this.

### 6. Concurrent writes safely on S3
**Gap:** G02 (Priority score: 25, updated) | **Journey inventory:** How-to — "Set up concurrent writes safely on AWS S3" (P0)
**Rationale:** Community signal 5/5. Recurring data-loss reports (Delta #1830, 9 comments). DynamoDB locking on S3 is marked experimental with no graduation timeline. ClickHouse's experimental write path (v25.8+) performs blind inserts with no locking mechanism and no mention in Delta's official docs. No single page explains the safe concurrency story across Spark, delta-rs, Trino, DuckDB, and ClickHouse.

### 7. VACUUM + time travel retention model
**Gap:** G05 (Priority score: 20) | **Journey inventory:** Explanation — "How VACUUM interacts with time travel" (P0)
**Rationale:** Community signal 4/5. Persistent SO questions and a Medium article (Dec 2025). `deletedFileRetentionDuration` vs. `logRetentionDuration` are documented but the interaction is not demonstrated. Users run VACUUM and get unexpected behavior because the mental model is not built before the reference material. A worked-example explanation would reduce support load across all five engines affected.

### 8. Delta 4.0 / delta-spark 4.x cross-engine compatibility
**Gap:** G07 (Priority score: 20, updated) | **Journey inventory:** Reference — "delta-rs version compatibility and breaking changes" (P1)
**Rationale:** Community signal 4/5. Delta-rs #3782, #4247. Delta 4.0 introduced protocol features (managed commits, in-commit timestamps, V3 checkpoints) that break compatibility with delta-rs in some configurations. DuckDB raises read errors on V2Checkpoint tables. The Flink Standalone connector has been officially sunsetted as of Delta 4.0 and will not ship as part of the 4.x release series — users of the Flink connector are stranded on 3.x. A cross-engine compatibility matrix for Delta protocol versions would allow non-Spark users to understand which Delta features are safe to enable.

### 9. Deletion vectors cross-engine readability
**Gap:** G12 (Priority score: 20, updated) | **Journey inventory:** How-to — "Enable Deletion Vectors and understand their performance impact" (P1)
**Rationale:** Community signal 4/5. DVs are enabled by default in Databricks Runtime 14+ and delta-rs 1.4.0+. Daft raises `NotImplementedError` on DV-enabled tables (Daft #1954). DuckDB can read but not write. Flink errors on mixed add/remove commits. PrestoDB returns logically deleted rows with no error (silent correctness failure at production scale). A cross-engine DV compatibility table, paired with a migration note for users moving tables from Databricks to Python engines, would prevent data-access failures.

### 10. Non-Spark connector stub pages
**Gap:** G21 (Priority score: 20, updated) | **Journey inventory:** How-to — per-engine getting-started pages (P1)
**Rationale:** Community signal 4/5. Trino (one paragraph), Flink (one sentence + GitHub link), Presto (two sentences, 2021 reference), BigQuery (one sentence), ClickHouse (no page). Users landing from the Delta docs cannot learn what Trino supports, that Flink is in maintenance mode, that PrestoDB is read-only, or that ClickHouse's write path is experimental with no locking. Expanding each stub to include: supported operations, known limitations, compatible versions, and links to tracking issues would close a navigation dead-end that affects every new non-Spark user.

---

## Ecosystem Outreach Opportunities

The following gaps are best addressed by working with engine maintainers rather than writing Delta-side documentation alone. Each opportunity is mapped to the specific gaps it closes.

### 1. delta-rs maintainers — Column Mapping and MERGE silent failures
**Gaps addressed:** G04 (column mapping), G18 (MERGE silent multiple-source match)
**Opportunity:** Delta-rs #930 (column mapping) and #2407 (MERGE silent multiple-source match) have been open for extended periods with community frustration. Reach out to the delta-rs core team (risinglightdb / wjones127 / roeap) to understand roadmap priority. Both gaps could be partially addressed by adding explicit error messages and documentation callouts even before full implementation. The delta-rs docs could prominently list column mapping as an unsupported feature with a link to the tracking issue.

### 2. Daft maintainers (Eventual-Inc) — Deletion vectors roadmap
**Gaps addressed:** G12 (deletion vectors cross-engine readability)
**Opportunity:** Daft #1954 (deletion vectors) is a blocking issue for reading any table authored by Databricks Runtime 14+ or delta-rs 1.4.0+. The Daft roadmap issue (#2457) lists deletion vectors. Outreach to the Daft team to understand the timeline and co-author a migration note or warning in both the Daft docs and the Delta Lake engine integration page would reduce user confusion. Consider a community blog post: "Reading Databricks-authored Delta tables in Daft today."

### 3. DuckDB maintainers — Clarify write path maturity and surface limitations in Delta docs
**Gaps addressed:** G17 (DuckDB write path maturity), G02 (concurrent writes on S3), G27 (UniForm compatibility)
**Opportunity:** DuckDB's own docs accurately describe the write path as "blind insert only" and list open issues. The gap is that docs.delta.io's DuckDB integration page is a stub that implies read-only. Coordinate with the DuckDB team to: (a) publish a write-path status update once the partitioned-write bug (#280) is fixed, (b) add a concurrency warning to the DuckDB page on docs.delta.io noting that DuckDB inserts to S3 have no locking mechanism, and (c) document the `icebergWriterCompatV1` write-block that affects all DuckDB users pointing at Unity Catalog-managed Delta tables with UniForm enabled.

### 4. Trino maintainers — S3 concurrent write safety documentation
**Gaps addressed:** G02 (concurrent writes on S3), G21 (non-Spark connector stubs)
**Opportunity:** Trino's Delta Lake connector supports full DML but concurrent writes to S3 are unsafe without explicit configuration, and there is no collision detection when writing alongside other engines. The Trino docs document this in their connector page, but docs.delta.io's Trino stub page does not. Coordinating with the Trino community to produce a joint "multi-engine write safety" guide would serve users running Trino alongside Spark or delta-rs.

### 5. Apache Flink community — Document DataStream-only limitation, maintenance mode, and 2.0 roadmap
**Gaps addressed:** G13 (Flink connector status), G21 (non-Spark connector stubs)
**Opportunity:** The Flink Delta connector is now formally in maintenance mode as of Delta 4.0.0 (June 2025), only supports DataStream API (not Flink Table API/SQL), and is not yet compatible with Flink 2.0 (#4793, #4586). The connector's README and delta.io's Flink stub page do not clearly explain these constraints, and critically do not communicate the sunset. Outreach to the Flink Delta connector maintainers to produce: (a) a maintenance-mode notice and sunset timeline in the integration page, (b) a Flink 2.0 compatibility statement, (c) an explanation of why the connector cannot reflect DELETE operations.

### 6. PrestoDB maintainers (Meta) — Document the Delta connector capability and deletion vector correctness risk
**Gaps addressed:** G24 (PrestoDB read-only stub), G12 (deletion vectors cross-engine), G26 (protocol version ceiling)
**Opportunity:** PrestoDB's Delta connector is a production-scale, Meta-contributed integration used at significant scale. The connector is read-only and has a confirmed silent correctness failure for deletion-vector-enabled tables (deleted rows are returned). The PrestoDB docs are accurate but docs.delta.io's Presto page is a 2021 stub. Coordinate with Meta's PrestoDB team to: (a) update the docs.delta.io Presto page with current capability description, (b) add a deletion vector correctness warning, (c) document the Delta Kernel version pin (3.3.2) and what protocol features that enables/blocks.

### 7. ClickHouse team — Co-author integration page and experimental write caveat documentation
**Gaps addressed:** G25 (ClickHouse experimental write caveats), G02 (concurrent writes on S3), G21 (non-Spark connector stubs)
**Opportunity:** ClickHouse has invested significantly in Delta Lake read support (delta-kernel-rs as default, v25.5+) and is actively developing experimental write support. Despite this, docs.delta.io has no ClickHouse page. The ClickHouse team publishes detailed blog posts and changelogs; a joint documentation effort to produce an integration page on docs.delta.io would be low-friction and high-impact. Key topics: read path maturity, experimental write path and constraints, Azure write gap, Unity Catalog write-back gap, and the session-scope snapshot version bug.

### 8. delta-rs / delta-io documentation team — Engine comparison matrix
**Gaps addressed:** G03 (engine feature comparison matrix), G21 (non-Spark connector stubs), G26 (protocol version ceiling), G27 (UniForm compatibility)
**Opportunity:** The single highest-impact documentation deliverable identified in this analysis is an engine capability matrix on docs.delta.io. With eleven engines now researched, the matrix is well-specified. This requires coordination across multiple engine teams to verify accuracy. A community-maintained matrix (similar to the Apache Iceberg Engine Support page) would address the most-asked class of questions and serve as the canonical cross-reference for G26 (protocol version ceiling) and G27 (UniForm compatibility). Propose this to the delta.io documentation working group with an offer to draft the initial version based on these research reports.

---

## Full Journey Inventory

*Embedded from `synthesis-journey-inventory.md`*

### Engine abbreviations
- **Spark** = Apache Spark (delta-spark)
- **delta-rs** = delta-rs Python/Rust library (also used by Polars, DataFusion, Daft via delegation)
- **DuckDB** = DuckDB delta extension (delta-kernel-rs)
- **Polars** = Polars (delegates write/DML to delta-rs)
- **Daft** = Daft (delegates write/DML to delta-rs)
- **DataFusion** = Apache DataFusion via delta-rs
- **Trino** = Trino native connector
- **Flink** = Apache Flink connector
- **Athena** = AWS Athena v3 (read-only)
- **PrestoDB** = PrestoDB Delta Kernel connector (read-only)
- **ClickHouse** = ClickHouse DeltaLake engine / deltaLake table function (read + experimental append)

70 distinct user journeys across four Diátaxis categories. Priority tiers: **P0** = fundamentals every new user needs; **P1** = intermediate operations with known community demand; **P2** = advanced or specialist use cases.

---

### Guides (Tutorials)

Learning-oriented, beginner paths that take a user from zero to working end-to-end.

| Journey | Engines | Currently documented? | Priority |
|---|---|---|---|
| Get started with Delta Lake on local storage using Spark (create, write, read, query) | Spark | Yes — docs.delta.io Quick Start; Spark-only; local-path examples only; no SQL streaming example | P0 |
| Get started with Delta Lake without Spark using delta-rs and Python (create, write, read) | delta-rs, Polars, DuckDB | Partial — delta-rs site has Overview + Installation but no end-to-end beginner tutorial connecting all steps; no single-page path for a Python user | P0 |
| Get started with Delta Lake on S3 using Python (delta-rs + DynamoDB locking) | delta-rs, Polars, Daft | Partial — delta-rs has an S3 integration page and a locking-provider page, but they are separate; no unified beginner tutorial | P0 |
| Get started with Delta Lake on Azure ADLS using Python | delta-rs, Polars, Daft | Partial — delta-rs has an ADLS integration page; no unified tutorial | P1 |
| Get started with Delta Lake on GCS using Python | delta-rs, Polars, Daft | Partial — delta-rs has a GCS integration page; no unified tutorial | P1 |
| Build a streaming lakehouse pipeline with Spark Structured Streaming and Delta Lake | Spark | Partial — docs.delta.io streaming pages are comprehensive but scattered; no single end-to-end tutorial narrative | P0 |
| Read a Delta table from DuckDB (first use) | DuckDB | Partial — DuckDB docs have a delta extension page; docs.delta.io stub defers to DuckDB docs | P0 |
| Migrate from Parquet to Delta Lake using Spark (CONVERT TO DELTA) | Spark | Yes — docs.delta.io `/delta-utility/` CONVERT TO DELTA section; Spark-only | P1 |
| Migrate from Iceberg to Delta Lake using Spark | Spark | Partial — covered within the CONVERT TO DELTA page; merge-on-read limitation documented; no dedicated migration narrative | P1 |

---

### How-tos

Task-oriented guides for users who already understand the basics and need to accomplish a specific goal.

| Journey | Engines | Currently documented? | Priority |
|---|---|---|---|
| Create a Delta table (DDL / DataFrameWriter / builder API) | Spark, delta-rs, Polars, Daft, DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/create-delta-lake-table; Polars/Daft via delegation; no unified cross-engine how-to | P0 |
| Append data to a Delta table | Spark, delta-rs, Polars, Daft, DataFusion, DuckDB (blind insert), Trino, ClickHouse (experimental append on S3/GCS only) | Yes (Spark, delta-rs, Polars, Daft) — scattered across individual engine docs; DuckDB append is documented but marked immature; Trino INSERT fully supported; ClickHouse INSERT requires `allow_experimental_delta_lake_writes=1` | P0 |
| Overwrite a Delta table (full and predicate-based) | Spark, delta-rs, Polars, DataFusion, Trino | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/appending-overwriting; Daft supports full overwrite; Trino: `CREATE OR REPLACE TABLE` creates an atomic table replacement; no unified how-to | P0 |
| Read a Delta table with time travel (by version number) | Spark, delta-rs, Polars, Daft, DataFusion, DuckDB, Trino, PrestoDB, Flink | Yes (Spark) — docs.delta.io; Yes (delta-rs, Polars, Daft) — individual engine docs; DuckDB: version only (no timestamp), partially documented; Trino: `FOR VERSION AS OF <n>` supported; PrestoDB: `table@v<n>` suffix syntax; Flink: `versionAsOf(n)` (bounded) and `startingVersion(n)` (streaming) | P0 |
| Read a Delta table with time travel (by timestamp) | Spark, delta-rs, Polars, Daft, DataFusion, Trino, PrestoDB, Flink | Yes (Spark) — docs.delta.io; Yes (delta-rs, Polars, Daft) — individual engine docs; DuckDB: NOT SUPPORTED (open issue #227); Trino: `FOR TIMESTAMP AS OF TIMESTAMP '...'` supported; PrestoDB: `table@t<timestamp>` suffix syntax; Flink: `timestampAsOf("...")` (bounded) and `startingTimestamp("...")` (streaming); ClickHouse: session-setting only (`delta_lake_snapshot_version`), not standard SQL syntax | P0 |
| Perform a MERGE / upsert on a Delta table | Spark, delta-rs, Polars (via delta-rs), DataFusion, Trino | Yes (Spark) — docs.delta.io comprehensive; Yes (delta-rs) — usage/merging-tables; Polars wraps delta-rs merge; DuckDB/Daft: NOT SUPPORTED; Trino: MERGE DML fully supported | P0 |
| MERGE with schema evolution (new columns from source) | Spark, delta-rs (with caveats), DataFusion, Trino | Partial — Spark docs cover schema evolution in MERGE; delta-rs has edge-case bugs with List<Struct>; Trino supports schema evolution via ALTER TABLE but MERGE-specific schema evolution docs are sparse; no unified how-to; highest-signal community gap | P0 |
| DELETE rows from a Delta table with a predicate | Spark, delta-rs, Polars (via delta-rs), DataFusion, Trino | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/deleting-rows; Polars: undocumented in Polars docs; Daft: NOT SUPPORTED; Trino: DELETE DML fully supported | P0 |
| UPDATE rows in a Delta table with a predicate | Spark, delta-rs, Polars (via delta-rs), DataFusion, Trino | Yes (Spark) — docs.delta.io; delta-rs: API reference only, no usage guide page; Polars: undocumented in Polars docs; Daft: NOT SUPPORTED; Trino: UPDATE DML fully supported | P0 |
| Run VACUUM to reclaim storage and understand retention | Spark, delta-rs, DataFusion, Trino | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/managing-tables; Polars: via delta-rs direct call, undocumented; Daft/DuckDB: NOT SUPPORTED; Trino: `CALL system.vacuum(schema, table, retention)` procedure supported; PrestoDB: NOT SUPPORTED (read-only connector) | P0 |
| Run OPTIMIZE (bin-packing compaction) to reduce small files | Spark, delta-rs, DataFusion, Trino | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/optimize; Polars: via delta-rs, undocumented; Daft/DuckDB: NOT SUPPORTED; Trino: `ALTER TABLE ... EXECUTE optimize` supported with optional `file_size_threshold` parameter | P1 |
| Use Z-Ordering to co-locate similar data | Spark, delta-rs, DataFusion | Yes (Spark) — docs.delta.io; Partial (delta-rs) — dedicated page returned 404 during crawl; community confusion on interaction with partitioning | P1 |
| Enable and use Liquid Clustering instead of Z-Ordering | Spark only | Yes (Spark) — docs.delta.io comprehensive; NOT available in delta-rs, Polars, DuckDB, Daft; Trino: read-only for liquid-clustered tables (no write or clustering-aware skipping) | P1 |
| Enable and read Change Data Feed (CDF) | Spark, delta-rs, DataFusion, ClickHouse (read only) | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/read-cdf; Polars: undocumented in Polars docs (requires delta-rs direct call); Daft/DuckDB: NOT SUPPORTED; Flink: NOT SUPPORTED (connector exposes added-file content only, not the CDF `_change_data` stream); ClickHouse: CDF read supported via `delta_lake_snapshot_start_version` / `delta_lake_snapshot_end_version` settings | P1 |
| Set up concurrent writes safely on AWS S3 (DynamoDB locking) | delta-rs, DataFusion, Trino | Yes — delta-rs has a locking-provider page; Trino: S3 conditional writes via `delta.s3.transaction-log-conditional-writes.enabled`; community demand is high (recurring Stack Overflow pattern); no cross-engine comparison; PrestoDB: NOT APPLICABLE (read-only) | P0 |
| Configure schema enforcement and handle write rejections | Spark, delta-rs | Yes (Spark) — docs.delta.io; Partial (delta-rs) — schema_mode options documented per write API; no standalone how-to explaining the enforcement model | P1 |
| Evolve a schema by adding columns (mergeSchema / schema_mode=merge) | Spark, delta-rs, Polars, DataFusion, Trino, Flink (additive only via withMergeSchema) | Yes (Spark) — docs.delta.io; Yes (delta-rs, Polars) — covered in write docs; Daft: schema merge NOT SUPPORTED; Trino: column add via ALTER TABLE supported for non-nested structures; Flink: `withMergeSchema(true)` supports additive schema changes (removing columns causes commit failure) | P1 |
| Rename or drop a column using Column Mapping | Spark, Trino | Yes (Spark) — docs.delta.io; delta-rs: NOT SUPPORTED (open issue #930, 14 comments); Polars: NOT SUPPORTED without PyArrow fallback; Daft: NOT SUPPORTED; Trino: `column_mapping_mode` supports ID, NAME, and NONE modes (read and write); Flink: NOT SUPPORTED | P1 |
| Enable Deletion Vectors and understand their performance impact | Spark, delta-rs, Trino | Yes (Spark) — docs.delta.io; delta-rs: TableAlterer.add_feature() documented; no dedicated usage guide; Polars: reads supported; DuckDB: reads supported; Daft: NOT SUPPORTED (raises NotImplementedError); Trino: reads and writes deletion vectors (`deletion_vectors_enabled` table property or global config); PrestoDB: correctness risk — connector reads Parquet directly without calling `transformPhysicalData()`, so logically deleted rows may surface; Flink: NOT SUPPORTED | P1 |
| Use RESTORE to revert a table to a prior version | Spark, delta-rs | Yes (Spark) — docs.delta.io; delta-rs: API reference only, no usage guide; Polars: undocumented | P1 |
| Clone a Delta table (SHALLOW CLONE / CLONE) | Spark only | Yes (Spark) — docs.delta.io; NOT available in delta-rs, DuckDB, Polars, Daft, Trino (Trino can read shallow-cloned tables but cannot create them) | P2 |
| Convert an external table to Delta and register with a catalog (Glue, Unity Catalog, HMS) | Spark, delta-rs (UC) | Partial — Spark covers CONVERT TO DELTA; delta-rs has Unity Catalog loading (uc://); no Glue how-to; Trino: `register_table` / `unregister_table` procedures available for HMS and Glue; high community demand (#1679, #2434) | P1 |
| Use Delta Sharing to share data across organizations | Spark (write); any engine (read) | Yes (Spark) — docs.delta.io; delta-rs: NOT SUPPORTED; Daft: NOT SUPPORTED (open feature #4927) | P2 |
| Set up Delta Kernel to build a custom non-Spark connector | Java, Rust (via Delta Kernel APIs) | Yes — docs.delta.io Delta Kernel section; comprehensive; Java more detailed than Rust | P2 |
| Generate symlink manifests for manifest-based connectors (Redshift Spectrum, legacy Snowflake) | Spark, delta-rs (API only) | Yes (Spark) — docs.delta.io GENERATE page; delta-rs: API reference only, no usage guide; manifest-based connectors are increasingly deprecated | P2 |
| Configure storage credentials for cloud object stores (per-engine) | Spark, delta-rs, DuckDB, Polars, Daft, Trino, PrestoDB, ClickHouse | Partial — delta-rs has per-cloud pages; DuckDB has CREATE SECRET docs; Spark has /delta-storage/; Trino: Azure ADLS Gen2, GCS, S3, and HDFS all supported via connector config; PrestoDB: reuses Hive connector storage modules for S3, ADLS, Glue, and HDFS; ClickHouse: named collections supported for all backends; no unified cross-engine credentials how-to | P1 |
| Enable UniForm to expose a Delta table to Iceberg readers | Spark only (write); Trino (read-only awareness) | Yes (Spark) — docs.delta.io; write-safety enforcement gap documented; external writes risk GC data loss with no mitigation guidance; Trino: can read UniForm-enabled tables but cannot write or maintain UniForm (Iceberg) metadata | P1 |
| Use Type Widening to change a column's data type safely | Spark | Yes (Spark) — docs.delta.io; delta-rs: NOT SUPPORTED; Polars: NOT SUPPORTED; Trino: type widening supported for reading only | P2 |
| Set NOT NULL and CHECK constraints on a table | Spark, delta-rs | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/constraints; delta-rs only supports CHECK; NOT NULL absent from delta-rs docs | P1 |
| Use Row Tracking to identify and track individual rows | Spark only | Yes (Spark) — docs.delta.io; NOT available in delta-rs, DuckDB, Polars, Daft | P2 |
| Drop a Delta table feature (ALTER TABLE DROP FEATURE) | Spark only | Yes (Spark) — docs.delta.io; NOT available in delta-rs, DuckDB, Polars, Daft | P2 |
| Configure a Delta table to use UniForm for Iceberg reader compatibility | Spark only (write path) | Partial — docs.delta.io covers UniForm enablement (Spark only); no dedicated how-to walks through the full sequence: enable column mapping → enable UniForm → verify Iceberg snapshot is generated → validate from an Iceberg reader; write-safety gap (external writes risk GC data loss) is underdocumented | P1 |
| Read a Delta table using PrestoDB with the Delta Kernel connector | PrestoDB | Partial — official Presto 0.296 docs have a connector page; time travel via `table@v<n>` / `table@t<timestamp>` suffix is documented; deletion vector correctness risk (logically deleted rows may surface) is not documented; no cross-referenced guide from delta.io | P1 |
| Use ClickHouse as a read-only analytical query layer over Delta tables | ClickHouse | Partial — ClickHouse docs cover `DeltaLake` engine and `deltaLake` table function; no end-to-end how-to for the pattern of Spark-writes / ClickHouse-reads; no guidance on VACUUM/OPTIMIZE dependency on external engines; time travel via session setting rather than SQL syntax is not prominently documented | P1 |

---

### Explanation

Conceptual content for users who want to understand how and why Delta Lake behaves the way it does.

| Journey | Engines | Currently documented? | Priority |
|---|---|---|---|
| How the Delta transaction log works (architecture, JSON log files, checkpoints) | All (protocol-level) | Partial — delta-rs docs have "Architecture of a Delta Table" (good); docs.delta.io has no equivalent standalone explanation; cross-engine shared | P0 |
| How ACID transactions work in Delta Lake (MVCC, atomicity, conflict detection) | All (protocol-level) | Partial — delta-rs docs have "ACID Transactions" (good); docs.delta.io covers concurrency control in reference style but lacks a dedicated explanation page | P0 |
| How file skipping and data skipping work (min/max statistics, partition pruning) | All (read-capable engines) | Partial — delta-rs docs have "File Skipping" (good); docs.delta.io explains data skipping within the optimizations page; no cross-engine explanation | P0 |
| How schema enforcement differs from schema evolution (mental model) | Spark, delta-rs, Polars | Partial — docs.delta.io covers enforcement and evolution separately without a unified mental-model explanation; community signals show this is a persistent source of confusion | P0 |
| How VACUUM interacts with time travel (retention windows, what gets deleted and when) | Spark, delta-rs, Trino | Partial — docs.delta.io VACUUM page has safety warnings; delta-rs managing-tables page mentions 7-day default; Trino VACUUM uses the same 7-day minimum; no unified explanation of the retention model; highest-signal community confusion topic | P0 |
| How concurrency control works in Delta Lake (OCC, conflict matrix, exception types) | Spark (full detail), delta-rs (partial) | Yes (Spark) — docs.delta.io concurrency control page is comprehensive; delta-rs: MVCC explained in ACID transactions page; no cross-engine conflict matrix | P1 |
| How Change Data Feed works under the hood (what gets written, what gets read) | Spark, delta-rs, ClickHouse (read) | Partial — docs.delta.io CDF page explains enable/read; delta-rs CDF page explains API; neither explains the internal mechanics (change_data/ files, column semantics); ClickHouse blog post covers CDF consumption but not internals | P1 |
| How Deletion Vectors work and why they improve DML performance | Spark, delta-rs, DuckDB (read), Polars (read), Trino (read+write) | Partial — docs.delta.io deletion vectors page explains enable + REORG; delta-rs best practices mentions DV performance benefit; no unified conceptual explanation of DV mechanics; Flink: NOT SUPPORTED | P1 |
| How Delta Lake's protocol versioning system works (reader/writer versions, feature flags) | All (protocol-level) | Yes (Spark) — docs.delta.io versioning page is comprehensive; delta-rs 1.0.0 upgrade guide covers breaking protocol changes; no unified multi-engine explanation; PrestoDB pins Delta Kernel 3.3.2 (reader/writer protocol constraints apply per that version) | P1 |
| Why Spark is required for most write operations (Delta Lake engine architecture) | Spark vs. non-Spark | No — the docs.delta.io site assumes Spark throughout; no page explains why Spark is the reference write engine or what the non-Spark alternatives are and their trade-offs; PrestoDB and ClickHouse (read-only for most operations) exemplify this gap | P0 |
| OSS Delta Lake vs. Databricks Delta: what features are exclusive to each | Spark (OSS) vs. Databricks | No — docs.delta.io covers only OSS; community frustration is high (#1775, 16 comments); no official page draws the OSS/Databricks boundary | P1 |
| Understand Delta Protocol reader/writer versions and table feature flags | All (protocol-level) | Partial — docs.delta.io versioning page lists version numbers and features but does not explain the mental model of how reader/writer versions relate to each other, what table features replace, or how an engine determines what protocol version a table requires; `protocol-feature-matrix.md` provides the authoritative reference but no user-facing explanation page exists | P1 |

---

### Reference

Technical specifications, compatibility matrices, and lookup resources.

| Journey | Engines | Currently documented? | Priority |
|---|---|---|---|
| Delta table properties reference (all `delta.*` properties, their defaults and effects) | All (via table properties) | Partial — docs.delta.io `/table-properties/` lists only 12 properties; the actual set used across docs is much larger and not consolidated; delta-rs #3329 is an open gap request | P0 |
| Engine support matrix (which operations are supported by which engine) | Spark, delta-rs, DuckDB, Polars, Daft, DataFusion, Trino, Flink, Athena, PrestoDB, ClickHouse | No — does not exist anywhere; the closest is the ecosystem landscape scan (report 09); community demand is high; PrestoDB and ClickHouse deepen the gap with their read-only and experimental-write profiles | P0 |
| Delta Lake ↔ Apache Spark version compatibility matrix | Spark | Yes — docs.delta.io versioning page; comprehensive; engine-specific version history in report 07 | P1 |
| Delta feature ↔ minimum Delta version reference | Spark | Yes — docs.delta.io versioning page; also in report 07; only Spark engine | P1 |
| delta-rs version compatibility and breaking changes reference | delta-rs | Partial — only the 1.0.0 upgrade guide exists; no per-version feature introduction index | P1 |
| Storage configuration keys reference (per cloud backend, per engine) | delta-rs, DuckDB, Polars, Daft, Trino, PrestoDB, ClickHouse | Partial — delta-rs has per-cloud pages; DuckDB has CREATE SECRET docs; Spark has /delta-storage/; Trino: S3, ADLS Gen2, GCS, HDFS via connector config; PrestoDB: Hive connector config keys; ClickHouse: named collections and per-function credential params; no unified cross-engine reference table | P1 |
| DESCRIBE HISTORY operation metrics reference (what each operation records) | Spark | Yes — docs.delta.io DESCRIBE HISTORY page includes an operation metrics table; delta-rs history() method documented but without the metrics table | P1 |
| Supported type conversions for Type Widening | Spark | Yes — docs.delta.io type-widening page includes a supported-conversions table; Spark-only | P2 |
| Delta exception types and programmatic error handling | Spark, delta-rs | Partial — docs.delta.io concurrency control page lists exception types; delta-rs API reference documents 5 exception classes; no unified cross-engine error-handling reference | P1 |
| Delta Lake API reference (Scala, Java, Python, Rust) | Spark, delta-rs | Partial — docs.delta.io links to generated API docs; delta-rs has an API reference section; Python best-covered; no canonical cross-engine API lookup | P1 |
| Streaming source and sink options reference (maxFilesPerTrigger, startingVersion, etc.) | Spark, Flink | Partial — docs.delta.io streaming page covers options inline; no standalone reference page with all options tabulated; Flink connector options (`versionAsOf`, `timestampAsOf`, `startingVersion`, `startingTimestamp`, `ignoreChanges`, `ignoreDeletes`, `withMergeSchema`) are only in the connector README | P1 |
| MERGE semantics reference (WHEN clauses, ordering, cardinality rules) | Spark, delta-rs, Trino | Partial — docs.delta.io MERGE page is comprehensive for Spark; delta-rs merge docs are a usage guide; Trino MERGE follows SQL standard MERGE semantics; no standalone reference for clause semantics including the multiple-match behavior difference between engines | P1 |
| Delta Kernel API reference (Java + Rust) | Java, Rust (connector developers) | Yes — docs.delta.io Delta Kernel section; Java more complete than Rust; targeted at connector builders | P2 |
| Check and upgrade the protocol version of an existing Delta table | Spark (primary), delta-rs | No — docs.delta.io versioning page explains what versions mean but does not provide a step-by-step reference for checking a table's current reader/writer version, identifying which features are enabled, and upgrading the protocol to enable a new feature; no cross-engine equivalent exists | P1 |
| Understand which Delta Protocol features each engine supports | All (protocol-level) | No — no single reference exists mapping each named table feature (deletionVectors, columnMapping, typeWidening, icebergCompatV2, clustering, etc.) to the engines that can read or write it; `protocol-feature-matrix.md` provides the source data but no user-facing reference page exists | P0 |

---

## Research Files

All files produced by Plan #139 and Plan #161 in `research/delta-lake/`:

| File | Description |
|---|---|
| `01-delta-official-docs.md` | Wave 1: Official delta.io documentation coverage audit |
| `02-delta-rs-docs.md` | Wave 1: delta-rs Python/Rust documentation coverage audit |
| `03-engine-duckdb.md` | Wave 1: DuckDB Delta extension — feature coverage and known limitations |
| `04-engine-polars.md` | Wave 1: Polars Delta integration — feature coverage and known limitations |
| `05-engine-daft.md` | Wave 1: Daft Delta integration — feature coverage and known limitations |
| `06-engine-datafusion.md` | Wave 1: Apache DataFusion via delta-rs — feature coverage |
| `07-engine-spark.md` | Wave 1: Apache Spark (delta-spark) — feature coverage and OSS boundary |
| `08-community-signals.md` | Wave 1: Community signals — GitHub issues, SO, forums, blog posts |
| `09-ecosystem-landscape.md` | Wave 1: Ecosystem landscape scan — Trino, Flink, Athena, BigQuery, Presto, Snowflake |
| `10-engine-trino.md` | Wave 2: Trino native connector — deep-dive feature coverage and known limitations |
| `11-engine-prestodb.md` | Wave 2: PrestoDB Delta Kernel connector — feature coverage and correctness risks |
| `12-engine-flink.md` | Wave 2: Apache Flink connector — feature coverage, maintenance mode status |
| `13-engine-clickhouse.md` | Wave 2: ClickHouse DeltaLake engine — read coverage and experimental write path |
| `14-uniform-interop.md` | Wave 2: UniForm interoperability — cross-engine compatibility and write-safety gaps |
| `15-protocol-features.md` | Wave 2: Delta protocol feature reference — reader/writer version requirements |
| `protocol-feature-matrix.md` | Wave 2: Protocol feature × engine compatibility matrix (all features, all 11 engines) |
| `synthesis-coverage-matrix.md` | Synthesis: Per-journey × per-engine coverage matrix (10 engines, updated Wave 2) |
| `synthesis-gap-analysis.md` | Synthesis: 27 documentation gaps ranked by community signal × engines affected |
| `synthesis-journey-inventory.md` | Synthesis: Full 70-journey Diátaxis inventory with current documentation status |
| `SUPPORT-MATRIX.md` | Synthesis: This file — consolidated findings, top 10 priorities, outreach opportunities |

---

*This file was produced by an AI agent.*
