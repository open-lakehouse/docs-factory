# Delta Lake User Journey Inventory
**Synthesized from:** Wave 1 reports 01–15
**Date:** 2026-03-27
**Framework:** Diátaxis (Guides / How-tos / Explanation / Reference)

**Engine abbreviations used in this document:**
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

---

## Summary

This inventory collects **70 distinct user journeys** across the Delta Lake ecosystem, drawn from official docs (docs.delta.io, delta-rs docs), seven engine-specific reports (DuckDB, Polars, Daft, DataFusion, Spark, Trino, PrestoDB, Flink, ClickHouse), the protocol feature reference, and the ecosystem landscape scan. Journeys are structured into four Diátaxis categories.

Key findings:
- The **official docs are almost entirely Spark-centric**; 80%+ of documented operations have Spark-only examples.
- **Non-Spark engines lack a comparative home**: DuckDB, Polars, Daft, DataFusion, Trino, PrestoDB, Flink, and ClickHouse are each covered in their own silos with no cross-engine operation matrix.
- **Conceptual content (Explanation) is the thinnest category**: only three pages exist in delta-rs docs; docs.delta.io has no dedicated Explanation section.
- **Community signals** surface MERGE + schema evolution, S3 concurrent writes, VACUUM + time travel, and the OSS/Databricks parity gap as the highest-demand underdocumented journeys.
- **Protocol versioning and feature flags** are poorly explained outside Spark-specific docs; no cross-engine reference for which protocol reader/writer version each engine requires exists.
- Priority tiers: **P0** = fundamentals every new user needs; **P1** = intermediate operations with known community demand; **P2** = advanced or specialist use cases.

---

## Guides (Tutorials)

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

## How-tos

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
| Rename or drop a column using Column Mapping | Spark, Trino | Yes (Spark) — docs.delta.io; delta-rs: NOT SUPPORTED (open issue #930, 14 comments); Polars: NOT SUPPORTED without PyArrow fallback; Daft: NOT SUPPORTED; Trino: `column_mapping_mode` supports ID, NAME, and NONE modes (read and write); Flink: NOT SUPPORTED (connector does not use Delta Kernel for reads) (corrected — Flink previously unlisted but is explicitly NOT SUPPORTED per report 12) | P1 |
| Enable Deletion Vectors and understand their performance impact | Spark, delta-rs, Trino | Yes (Spark) — docs.delta.io; delta-rs: TableAlterer.add_feature() documented; no dedicated usage guide; Polars: reads supported; DuckDB: reads supported; Daft: NOT SUPPORTED (raises NotImplementedError); Trino: reads and writes deletion vectors (`deletion_vectors_enabled` table property or global config); PrestoDB: correctness risk — connector reads Parquet directly without calling `transformPhysicalData()`, so logically deleted rows may surface; Flink: NOT SUPPORTED — tables with `enableDeletionVectors=true` cause `InvalidProtocolVersionException` (corrected — Flink is NOT SUPPORTED, previously unlisted) | P1 |
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

## Explanation

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
| How Deletion Vectors work and why they improve DML performance | Spark, delta-rs, DuckDB (read), Polars (read), Trino (read+write) | Partial — docs.delta.io deletion vectors page explains enable + REORG; delta-rs best practices mentions DV performance benefit; no unified conceptual explanation of DV mechanics; Flink: NOT SUPPORTED (corrected — Flink cannot read DV-enabled tables) | P1 |
| How Delta Lake's protocol versioning system works (reader/writer versions, feature flags) | All (protocol-level) | Yes (Spark) — docs.delta.io versioning page is comprehensive; delta-rs 1.0.0 upgrade guide covers breaking protocol changes; no unified multi-engine explanation; PrestoDB pins Delta Kernel 3.3.2 (reader/writer protocol constraints apply per that version) | P1 |
| Why Spark is required for most write operations (Delta Lake engine architecture) | Spark vs. non-Spark | No — the docs.delta.io site assumes Spark throughout; no page explains why Spark is the reference write engine or what the non-Spark alternatives are and their trade-offs; PrestoDB and ClickHouse (read-only for most operations) exemplify this gap | P0 |
| OSS Delta Lake vs. Databricks Delta: what features are exclusive to each | Spark (OSS) vs. Databricks | No — docs.delta.io covers only OSS; community frustration is high (#1775, 16 comments); no official page draws the OSS/Databricks boundary | P1 |
| Understand Delta Protocol reader/writer versions and table feature flags | All (protocol-level) | Partial — docs.delta.io versioning page lists version numbers and features but does not explain the mental model of how reader/writer versions relate to each other, what table features replace, or how an engine determines what protocol version a table requires; report 15 provides the authoritative reference but no user-facing explanation page exists | P1 |

---

## Reference

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
| Check and upgrade the protocol version of an existing Delta table | Spark (primary), delta-rs | No — docs.delta.io versioning page explains what versions mean but does not provide a step-by-step reference for checking a table's current reader/writer version, identifying which features are enabled, and upgrading the protocol to enable a new feature (e.g., enabling deletion vectors requires writer version 7 + readerFeatures/writerFeatures); no cross-engine equivalent exists | P1 |
| Understand which Delta Protocol features each engine supports | All (protocol-level) | No — no single reference exists mapping each named table feature (deletionVectors, columnMapping, typeWidening, icebergCompatV2, clustering, etc.) to the engines that can read or write it; the closest approximation is Trino's internal table features matrix, which only covers Trino; report 15 provides the protocol spec side; an engine × feature matrix is a critical missing reference | P0 |
