# Delta Lake: Apache Spark Engine Coverage Report

**Sources crawled:** docs.delta.io/latest, github.com/delta-io/delta releases, delta.io/blog
**Research date:** 2026-03-27
**Scope:** Apache Spark as the primary Delta Lake engine — Spark-exclusive capabilities, version compatibility, and gaps versus official documentation

---

## Summary

Apache Spark is Delta Lake's native and reference engine. Every core Delta feature — DML, DDL, streaming, optimization, schema evolution, and protocol management — is implemented and documented exclusively against Spark. Non-Spark engines (Trino, Presto, Flink, Hive) can read Delta tables but cannot perform write operations, schema evolution, clustering, compaction, or protocol upgrades.

The current state as of Delta 4.1.0 (March 2026):

- Delta 4.x requires Spark 4.x and Java 17; Spark 3.5 support was dropped in Delta 4.1.0.
- Delta Connect (Spark Connect integration) shipped in Delta 4.0.0 and is in Preview — not recommended for production.
- Catalog-Managed Tables reached production support in Delta 4.1.0 with Unity Catalog as the reference implementation.
- Server-Side Planning (Preview in 4.1.0) enables fine-grained access control by delegating query planning to the catalog.
- Every optimization operation (OPTIMIZE, Z-Order, Liquid Clustering, Auto Compaction, Optimized Write) requires Spark as the writer engine.

The Spark connector is the only path to exercising the full Delta protocol. No other open-source engine implements the writer side of Delta at comparable feature depth.

---

## Spark-exclusive Features

The following features are available only when Spark is the writer engine. No other publicly documented open-source engine (Trino, Presto, Flink, Hive) supports these as of the research date.

### Write and DML Operations

| Feature | Details |
|---|---|
| INSERT / Append writes | Core API via `DataFrameWriter` or `INSERT INTO` SQL |
| Overwrite (full and predicate-based `replaceWhere`) | Requires Delta 1.1.0+ for predicate overwrites |
| Dynamic Partition Overwrite | Requires Delta 2.0+ and `spark.sql.sources.partitionOverwriteMode=dynamic` |
| DELETE with predicate | Partition-predicate acceleration available; physical removal requires VACUUM |
| UPDATE with predicate | Partition-predicate optimization; Deletion Vectors accelerate soft deletes (Delta 3.0+) |
| MERGE / Upsert | Full `WHEN MATCHED / WHEN NOT MATCHED / WHEN NOT MATCHED BY SOURCE` semantics |
| MERGE with schema evolution | Requires `spark.databricks.delta.schema.autoMerge.enabled=true` |
| MERGE — `WHEN NOT MATCHED BY SOURCE` | Delta 2.3+ (SQL syntax in 2.4+); enables deleting unmatched target rows |
| MERGE auto-materialization of nondeterministic sources | Delta 2.2+ prevents duplicate evaluation of expressions |
| Idempotent writes via `txnAppId` / `txnVersion` | Delta 2.0+; used with `foreachBatch` in streaming pipelines |
| CONVERT TO DELTA (from Parquet or Iceberg) | Spark SQL only; Iceberg merge-on-read limitation applies |
| SHALLOW CLONE / CLONE | Spark SQL only; can clone from Parquet or Iceberg sources |
| RESTORE | Spark SQL only |

### Schema Management

| Feature | Details |
|---|---|
| Schema enforcement (write validation) | Automatic on all Spark writes |
| Schema evolution — `mergeSchema` | Per-write option or session config |
| `ALTER TABLE ADD COLUMNS` | DDL via Spark SQL |
| `ALTER TABLE ALTER COLUMN` (reorder, comment) | DDL via Spark SQL |
| `ALTER TABLE RENAME COLUMN` | Delta 1.2.0+; requires Column Mapping |
| `ALTER TABLE DROP COLUMN` | Delta 2.0+; requires Column Mapping; metadata-only |
| Generated Columns | Delta 1.0.0+; computed on write by Spark; enforced in predicates |
| Identity Columns | Delta 3.3+ GA; auto-increment; concurrent transactions not supported |
| Default Column Values | DDL via Spark SQL; irreversible protocol upgrade |
| Column Mapping (enable, rename, drop with special characters) | Delta 1.2.0+; requires reader v2 / writer v5 |
| Type Widening (manual) | Preview in Delta 3.2, GA in Delta 4.0; `ALTER TABLE ALTER COLUMN` via Spark |
| Type Widening (automatic schema evolution) | Integer→decimal and integer→double excluded from auto-promotion |
| NOT NULL constraint | DDL via Spark SQL |
| CHECK constraint | Delta 0.8.0+ DDL via Spark SQL |

### Streaming (Spark Structured Streaming Only)

Delta's streaming integration is entirely Spark Structured Streaming — no other engine implements a native Delta streaming source or sink.

| Feature | Details |
|---|---|
| Delta as stream source (`readStream`) | All new data and subsequent arrivals; rate-limiting via `maxFilesPerTrigger` / `maxBytesPerTrigger` |
| Delta as stream sink (`writeStream`) | Append and Complete output modes |
| `ignoreDeletes` / `ignoreChanges` source options | Handle DML against source tables without failing the stream |
| `startingVersion` / `startingTimestamp` | Specify initial read position |
| `withEventTimeOrder` | Prevents data drops during initial snapshot; divides event-time into per-microbatch buckets |
| Schema tracking (`schemaTrackingLocation`) | Delta 3.0+; enables streaming from Column Mapping tables through non-additive schema changes |
| CDF streaming read | `readChangeFeed=true`; returns inserts/updates/deletes as a stream |
| Idempotent streaming writes (`txnAppId` + `txnVersion`) | Delta 2.0+; deduplication via `foreachBatch` |
| DStream API | **Not supported.** Delta explicitly rejects DStream; Structured Streaming is required. |

### Optimization and Compaction (Write-side)

All optimization operations below require Spark as the executing engine. Read-side benefits (data skipping, file layout) are available to any Delta reader.

| Feature | Details |
|---|---|
| OPTIMIZE (bin-packing compaction) | Delta 1.2.0+; idempotent; produces evenly-balanced files |
| Z-Ordering | Delta 2.0+; non-idempotent; functionally superseded by Liquid Clustering for new tables |
| Liquid Clustering — `CLUSTER BY` on table creation | Delta 3.1.0 (preview flag required); 3.2.0+ (no flag); max 4 columns |
| `OPTIMIZE FULL` (force recluster all data) | Delta 3.3.0+ |
| `ALTER TABLE ... CLUSTER BY` (change clustering columns) | Delta 3.3.0+ |
| Auto Compaction | Delta 3.1.0+; experimental; runs synchronously after a successful write |
| Optimized Write | Delta 3.1.0+; disabled by default; improves file size at write time |
| Multi-part Checkpointing | Delta 2.0.0+; experimental; Spark-specific trigger |
| REORG TABLE ... APPLY (PURGE) | Physically removes rows soft-deleted by Deletion Vectors; Spark SQL only |
| VACUUM | Spark SQL; removes files unreferenced beyond the retention threshold |
| VACUUM blocked for catalog-managed tables | Delta 4.1.0; lifecycle managed through the catalog instead |

### Protocol and Table Management

| Feature | Details |
|---|---|
| ALTER TABLE SET TBLPROPERTIES | Enables/disables table features; Spark SQL only |
| ALTER TABLE DROP FEATURE | Delta 4.0.0+; removes a reader/writer feature (24-hour TRUNCATE HISTORY procedure) |
| Protocol version upgrades | Triggered automatically by enabling features; irreversible |
| Catalog-Managed Tables | Delta 4.0.1+ (preview), 4.1.0 (production); Unity Catalog as reference implementation; filesystem-based access not supported |
| UniForm — Iceberg metadata generation | Delta 3.1.0+; Spark triggers async Iceberg metadata writes; external engines read-only |
| UniForm — Hudi metadata generation | Delta 3.2.0+ (preview); Spark triggers async Hudi metadata writes |
| Row Tracking (enable, `_metadata.row_id`, `_metadata.row_commit_version`) | Delta 3.2.0+; enable on new tables; Delta 3.3.0+ for existing non-empty tables |
| Deletion Vectors (enable) | Delta 2.3.0+; tables with DVs are unreadable by clients without DV support |
| Change Data Feed (enable and read) | Delta 2.0.0+; CDF reads are Spark-centric (no confirmed support from Trino/Presto/Flink stubs) |

### Delta Connect (Spark Connect Integration)

| Feature | Details |
|---|---|
| Delta Connect | Delta 4.0.0+, Spark 4.0.0+, Java 17; **Preview — not for production** |
| Supported clients | Python (`pyspark==4.0.0`, `delta-spark==4.0.0`), Scala via spark-shell |
| Architecture | Decoupled client-server over gRPC; identical DeltaTable API against remote SparkSession |
| Feature coverage | Basic reads, writes, updates confirmed; advanced Delta features not documented as supported under Connect |
| Production status | Not recommended for production as of Delta 4.1.0 |

### Server-Side Planning (Delta 4.1.0, Preview)

Query planning is delegated to the catalog server rather than executed on the Spark driver. Enables row-level and column-level Fine-Grained Access Control (FGAC) without exposing raw storage paths to the driver. Spark-only; requires catalog support.

---

## Version Compatibility Matrix

### Delta Lake ↔ Apache Spark

| Delta Lake Version | Spark Version | Scala | Java | Notes |
|---|---|---|---|---|
| 4.1.0 | 4.1.0, 4.0.1 | 2.13 | 17+ | Spark 3.5 dropped; versioned Maven artifact naming (e.g., `delta-spark_4.1_2.13`) |
| 4.0.x | 4.0.x | 2.13 | 17+ | Hadoop 3.4.x required (3.3.x causes conflicts) |
| 3.3.x (3.3.0–3.3.2) | 3.5.x | 2.12, 2.13 | 8+ | |
| 3.2.x (3.2.0–3.2.1) | 3.5.x | 2.12, 2.13 | 8+ | |
| 3.1.0 | 3.5.x | 2.12, 2.13 | 8+ | |
| 3.0.x | 3.5.x | 2.12, 2.13 | 8+ | |
| 2.4.x | 3.4.x | 2.12, 2.13 | 8+ | |
| 2.3.x | 3.3.x | 2.12, 2.13 | 8+ | |
| 2.2.x | 3.3.x | 2.12 | 8+ | |

### Delta Feature → Minimum Delta Version

| Delta Feature | Min Delta Version | Min Spark Version (for feature) | Status |
|---|---|---|---|
| CHECK constraints | 0.8.0 | 3.x | GA |
| Generated columns | 1.0.0 | 3.x | GA |
| Column mapping | 1.2.0 | 3.x | GA |
| OPTIMIZE / compaction | 1.2.0 | 3.x | GA |
| Change Data Feed | 2.0.0 | 3.x | GA |
| Dynamic Partition Overwrite | 2.0.0 | 3.x | GA |
| ALTER TABLE DROP COLUMN (with col mapping) | 2.0.0 | 3.x | GA |
| Idempotent streaming writes | 2.0.0 | 3.x | GA |
| Z-Ordering | 2.0.0 | 3.x | GA |
| Multi-part Checkpointing | 2.0.0 | 3.x | Experimental |
| Deletion Vectors (scan) | 2.3.0 | 3.x | GA |
| WHEN NOT MATCHED BY SOURCE in MERGE | 2.3.0 | 3.x | GA |
| Deletion Vectors (DELETE) | 2.4.0 | 3.x | GA |
| UniForm / Iceberg metadata generation | 3.0.0 | 3.5.x | GA |
| Log Compaction | 3.0.0 | 3.5.x | GA |
| Deletion Vectors (UPDATE) | 3.0.0 | 3.5.x | GA |
| Streaming with Column Mapping (schema tracking) | 3.0.0 | 3.5.x | GA |
| Deletion Vectors (MERGE) | 3.1.0 | 3.5.x | GA |
| Liquid Clustering (preview flag) | 3.1.0 | 3.5.x | Preview → GA in 3.2 |
| UniForm / Hudi metadata generation | 3.2.0 | 3.5.x | Preview |
| Liquid Clustering (no flag) | 3.2.0 | 3.5.x | GA |
| Row Tracking (new tables) | 3.2.0 | 3.5.x | GA |
| Type Widening (preview) | 3.2.0 | 3.5.x | Preview |
| Auto Compaction | 3.1.0 | 3.5.x | Experimental |
| Optimized Write | 3.1.0 | 3.5.x | GA |
| OPTIMIZE FULL | 3.3.0 | 3.5.x | GA |
| ALTER TABLE CLUSTER BY | 3.3.0 | 3.5.x | GA |
| Row Tracking (existing non-empty tables) | 3.3.0 | 3.5.x | GA |
| Identity Columns | 3.3.0 | 3.5.x | GA (no concurrent txn support) |
| Variant Type | 4.0.0 | 4.0.x | GA |
| Type Widening (GA) | 4.0.0 | 4.0.x | GA |
| ALTER TABLE DROP FEATURE | 4.0.0 | 4.0.x | GA |
| Delta Connect / Spark Connect | 4.0.0 | 4.0.0 | Preview |
| Catalog-Managed Tables | 4.0.1 | 4.0.x | Preview → Production in 4.1 |
| Atomic CTAS | 4.1.0 | 4.1.x | GA |
| Server-Side Planning | 4.1.0 | 4.1.x | Preview |
| Conflict-Free DV + Column Mapping enablement | 4.1.0 | 4.1.x | GA |

---

## Gaps vs Official Docs

### Underdocumented Spark-Specific Behaviors

1. **Delta Connect feature coverage**: The `delta-spark-connect` page confirms Preview status but does not enumerate which Delta features are unsupported under Spark Connect. Advanced features (MERGE, OPTIMIZE, table properties, streaming) have no documented compatibility matrix against Connect.

2. **Server-Side Planning (4.1.0)**: Only announced in the 4.1.0 blog post; not yet reflected in docs.delta.io at time of research. No configuration reference, supported operations list, or FGAC integration guide exists in the official docs.

3. **Atomic CTAS (4.1.0)**: Announced in the 4.1.0 release blog but absent from the batch operations page (`/delta-batch/`). No documentation of the prior non-atomic behavior or migration notes.

4. **Spark 3.5 deprecation path**: Delta 4.1.0 dropped Spark 3.5 support. No migration guide or bridge documentation exists for users upgrading from the Delta 3.x/Spark 3.5 stack to the Delta 4.x/Spark 4.x stack.

5. **Streaming best practices**: The Best Practices page (`/best-practices/`) covers only batch scenarios. No Spark Structured Streaming best practices exist: no guidance on checkpoint location management, schema tracking for long-running streams, or interaction between streaming writes and OPTIMIZE.

6. **DStream migration**: The FAQ states Delta does not support DStream, but no migration path from DStream to Structured Streaming is provided.

7. **Multi-table transactions**: The FAQ notes multi-table atomicity is not supported, but no approximation patterns or Spark-specific workarounds are documented.

8. **Auto Compaction × Liquid Clustering interaction**: Auto Compaction is marked experimental; its interaction with Liquid Clustering (both affect file layout post-write) is not documented.

9. **VACUUM blocked for catalog-managed tables (4.1.0)**: This behavioral change is documented in the release blog but not yet reflected in the `/delta-utility/` VACUUM page.

10. **In-Commit Timestamps**: Required for Catalog-Managed Tables and referenced on the Drop Feature page, but has no dedicated documentation explaining what it does, how to enable it, or its implications for time travel.

11. **Checkpoint Protection and V2 Checkpoints**: Listed as droppable features on the Drop Feature page; no standalone documentation for either.

### Features That Appear Spark-Exclusive but Are Undocumented as Such

- **Row Tracking metadata (`_metadata.row_id`, `_metadata.row_commit_version`)**: The docs do not explicitly state that only Spark can read these hidden metadata columns, but no other connector documentation mentions them.
- **CDF streaming reads**: Documented only in Spark Structured Streaming context; no statement about support in Flink or other engines.
- **UniForm write restrictions**: The docs acknowledge external Iceberg/Hudi clients can write to UniForm tables and cause data loss via GC, but do not provide catalog-enforcement or tooling mitigation.

---

## Source Links

- Delta Lake Official Docs — Spark Connector overview: https://docs.delta.io/latest/delta-batch.html
- Delta Lake Streaming (Spark Structured Streaming): https://docs.delta.io/latest/delta-streaming.html
- Delta Connect / Spark Connect: https://docs.delta.io/latest/delta-spark-connect.html
- Catalog-Managed Tables: https://docs.delta.io/latest/delta-catalog-managed-tables.html
- Liquid Clustering: https://docs.delta.io/latest/delta-clustering.html
- Deletion Vectors: https://docs.delta.io/latest/delta-deletion-vectors.html
- Row Tracking: https://docs.delta.io/latest/delta-row-tracking.html
- Type Widening: https://docs.delta.io/latest/delta-type-widening.html
- Column Mapping: https://docs.delta.io/latest/delta-column-mapping.html
- Change Data Feed: https://docs.delta.io/latest/delta-change-data-feed.html
- Universal Format (UniForm): https://docs.delta.io/latest/delta-uniform.html
- Optimizations (OPTIMIZE, Z-Order, Auto Compaction, etc.): https://docs.delta.io/latest/optimizations-oss.html
- Feature Compatibility and Protocol Versioning: https://docs.delta.io/latest/versioning.html
- DML Operations (DELETE, UPDATE, MERGE): https://docs.delta.io/latest/delta-update.html
- Delta Lake Releases / Version Compatibility Matrix: https://docs.delta.io/releases/
- Delta Lake 4.1.0 Release Blog: https://delta.io/blog/2026-03-01-delta-lake-4-1-0-released/
- GitHub — Delta Connect feature request (issue #3240): https://github.com/delta-io/delta/issues/3240
- GitHub — Delta Lake releases and changelogs: https://github.com/delta-io/delta/releases
- Delta Protocol specification: https://github.com/delta-io/delta/blob/master/PROTOCOL.md
