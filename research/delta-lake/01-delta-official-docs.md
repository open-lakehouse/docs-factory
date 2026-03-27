# Delta Lake Official Docs Coverage Report

**Source:** https://docs.delta.io/latest/
**Crawled:** 2026-03-27
**Scope:** All sidebar sections in the Apache Spark Connector section plus all connector integrations, Delta Kernel, API docs, and supporting reference pages.

---

## Summary

The Delta Lake official documentation at docs.delta.io covers approximately 35 distinct topics across the Spark connector, connector integrations, and infrastructure sections. The documentation is heavily Spark-centric: every core operation page targets Apache Spark (Python/Scala/Java/SQL), with non-Spark engines covered either as thin stubs that redirect to external vendor docs or as manifest-generation workarounds. The strongest areas are DML operations (DELETE/UPDATE/MERGE), streaming reads/writes, and newer features like Liquid Clustering and Deletion Vectors, which all include multi-language examples and limitation callouts. The weakest areas are the third-party connector pages (Trino, Presto, Flink, Starburst, BigQuery), which are largely stubs deferring to external documentation. Several connector pages carry an unacknowledged experimental status despite being listed in the main navigation.

Delta Kernel is the only section with explicit multi-engine framing, providing Java and Rust APIs for building non-Spark connectors. Delta Standalone is deprecated in favor of Kernel.

Key structural issue: the Diátaxis signal is blurred across the site. Most pages blend How-to, Reference, and Explanation without clear delineation, making it hard for readers to locate conceptual grounding vs. step-by-step guidance.

---

## Operations Catalogued

| Operation / Topic | Doc URL Slug | Diátaxis Category | Spark-Only? | Quality Notes |
|---|---|---|---|---|
| Quick Start | `/quick-start/` | Tutorial | Yes | Good multi-language coverage; no SQL streaming read example; local-path examples only |
| Create Table (DDL / DataFrameWriter / DeltaTableBuilder) | `/delta-batch/` | How-to | Yes | Comprehensive; identity columns marked Preview with limited concurrency caveats |
| Read Table (name or path) | `/delta-batch/` | How-to | Yes | Good; partition pruning/stats optimization noted |
| Time Travel (version / timestamp) | `/delta-batch/` | How-to | Yes | Warning about timestamp reliability when copying tables is buried |
| Write to Table (append / overwrite / dynamic partition overwrite) | `/delta-batch/` | How-to | Yes | Dynamic partition overwrite risks underemphasized |
| Idempotent Writes | `/delta-batch/` | How-to | Yes | Caution about data duplication assumes identical retries |
| Schema Enforcement / Validation | `/delta-batch/` | Explanation | Yes | Adequate; links out for advanced schema evolution |
| Schema Update (add / rename / reorder / drop columns) | `/delta-batch/` | How-to | Yes | Good coverage; merge schema noted |
| Schema Replacement | `/delta-batch/` | How-to | Yes | Brief; no edge-case examples |
| Generated Columns | `/delta-batch/` | How-to | Yes | Partition filter logic for generated cols is sparse |
| Identity Columns | `/delta-batch/` | Reference | Yes | Marked Preview; concurrency limitations underdocumented |
| Default Column Values | `/delta-default-columns/` | Reference / How-to | Yes | Clear; irreversible protocol upgrade warning present |
| Table Properties and Metadata (DESCRIBE DETAIL / DESCRIBE HISTORY) | `/delta-batch/` | Reference | Yes | Good; coverage of all metadata commands |
| Stream Source (Delta as Spark Structured Streaming source) | `/delta-streaming/` | How-to | Yes | Comprehensive; rate limiting, ignore deletes/updates, initial position, schema tracking all covered |
| Stream Sink (Delta as Spark Structured Streaming sink) | `/delta-streaming/` | How-to | Yes | Good; append and complete modes documented |
| Idempotent Streaming Writes (foreachBatch + txnAppId/txnVersion) | `/delta-streaming/` | How-to | Yes | Well explained |
| DELETE | `/delta-update/` | How-to / Reference | Yes | Good; multi-language examples; physical deletion requires VACUUM |
| UPDATE | `/delta-update/` | How-to / Reference | Yes | Good; partition predicates optimization noted |
| MERGE / Upsert | `/delta-update/` | How-to / Reference | Yes | Comprehensive; WHEN NOT MATCHED BY SOURCE, CDC patterns, schema evolution documented |
| Change Data Feed (enable, batch read, streaming read) | `/delta-change-data-feed/` | How-to / Reference | Yes | Good; column mapping version matrix included; no historical capture limitation noted |
| VACUUM | `/delta-utility/` | How-to / Reference | Yes | Good; safety warnings on retention threshold present |
| DESCRIBE HISTORY | `/delta-utility/` | Reference | Yes | Good; operation metrics table included |
| DESCRIBE DETAIL | `/delta-utility/` | Reference | Yes | Good |
| GENERATE (manifest files) | `/delta-utility/` | How-to | Partially (Spark generates; Presto/Athena consumes) | Adequate; basis for manifest-based connectors |
| CONVERT TO DELTA (from Parquet / Iceberg) | `/delta-utility/` | How-to | Yes | Good; Iceberg merge-on-read limitation documented |
| RESTORE | `/delta-utility/` | How-to | Yes | Good |
| SHALLOW CLONE / CLONE | `/delta-utility/` | How-to | Yes | Good; Parquet/Iceberg clone noted |
| NOT NULL Constraint | `/delta-constraints/` | Reference / How-to | Yes | Minimal examples; nested struct behavior documented |
| CHECK Constraint | `/delta-constraints/` | Reference / How-to | Yes | Minimal examples; violation exception noted |
| Feature Compatibility / Protocol Versioning | `/versioning/` | Reference | Yes | Comprehensive feature matrix; upgrade procedures with code examples |
| Column Mapping (rename / drop columns, special characters) | `/delta-column-mapping/` | Reference / How-to | Yes | Sparse examples; heavy cross-reference reliance; experimental status flagged |
| Liquid Clustering (enable, choose columns, OPTIMIZE, recluster, change columns) | `/delta-clustering/` | How-to / Reference | Mostly Yes (read is multi-engine) | Good; version-specific limitations (3.1–3.2) documented |
| Deletion Vectors (enable, apply via REORG TABLE) | `/delta-deletion-vectors/` | How-to / Reference | Yes | Good; incremental support matrix (2.3–3.1) documented |
| Catalog-Managed Tables | `/delta-catalog-managed-tables/` | Reference / How-to | Yes | Clear; requires Delta 4.0.1+; upgrade of existing tables not supported |
| Drop Delta Table Features (ALTER TABLE DROP FEATURE) | `/delta-drop-feature/` | Reference / How-to | Yes | Good; 24-hour TRUNCATE HISTORY procedure well documented; requires Delta 4.0.0+ |
| Row Tracking (enable, read metadata fields) | `/delta-row-tracking/` | Reference / How-to | Yes | Good; CDF incompatibility and irreversibility warnings present |
| Delta Connect / Spark Connect Support | `/delta-spark-connect/` | Tutorial | Yes | Preview only; not for production; basic setup only; no advanced features |
| Storage Configuration (S3, Azure Blob, ADLS Gen1/Gen2, HDFS, GCS, OCI, IBM COS) | `/delta-storage/` | Reference | Yes | Good per-platform credential config; S3 multi-cluster marked experimental |
| Type Widening (manual / auto schema evolution, supported type conversions) | `/delta-type-widening/` | Reference | Yes | Preview in 3.2; GA in 3.3; Iceberg V2 incompatibility documented |
| Universal Format / UniForm (Iceberg + Hudi interop) | `/delta-uniform/` | How-to / Reference | Mostly Yes (external engines read-only) | Critical write-from-external gap exists: external writes risk GC data loss and are not enforced as read-only |
| Delta Sharing (snapshot, time travel, CDF, streaming read) | `/delta-sharing/` | How-to / Reference | Yes | Good; advanced feature version matrix included; `Trigger.AvailableNow` unsupported gap noted |
| Concurrency Control (OCC, conflict matrix, exception types) | `/concurrency-control/` | Reference / Explanation | Yes | Good; full exception type reference; practical conflict-avoidance strategies |
| Migration Guide (Parquet-to-Delta, version upgrade paths 0.6→4.x) | `/porting/` | How-to / Reference | Yes | Good; chronologically organized version-by-version upgrade steps |
| Best Practices (partitioning, compaction, table replacement, Spark caching) | `/best-practices/` | How-to | Yes | Sparse — only 4 topics; no security, schema management, or streaming best practices |
| FAQ | `/delta-faq/` | Reference | Yes | Foundational questions answered; no performance, security, cost, or troubleshooting coverage |
| Compaction (OPTIMIZE / bin-packing) | `/optimizations-oss/` | How-to / Reference | Yes | Good; idempotent; v1.2.0+ |
| Auto Compaction | `/optimizations-oss/` | How-to / Reference | Yes | Experimental (v3.1.0+); experimental status clearly noted |
| Data Skipping | `/optimizations-oss/` | Reference / Explanation | Yes | Automatic; clear explanation of effectiveness depending on layout |
| Z-Ordering | `/optimizations-oss/` | How-to / Reference | Yes | Non-idempotent; superseded by Liquid Clustering but still documented |
| Optimized Write | `/optimizations-oss/` | How-to / Reference | Yes | Disabled by default; v3.1.0+; sparse examples |
| Multi-part Checkpointing | `/optimizations-oss/` | Reference | Yes | Experimental; v2.0.0+ |
| Log Compaction | `/optimizations-oss/` | Reference / Explanation | Yes | Automatic; v3.0.0+ |
| REORG TABLE | `/delta-deletion-vectors/` | How-to | Yes | Covered within deletion vectors page; no standalone page |
| Trino Connector | `/delta-trino-integration/` | Reference (stub) | No | Stub — single paragraph; defers entirely to Trino official docs |
| Starburst Connector | `/delta-starburst-integration/` | Reference (stub) | No | Stub — one sentence; defers to Starburst docs |
| Presto Connector | `/delta-presto-integration/` | Reference (stub) | No | Stub — brief; defers to Presto docs; may be stale (references v0.269 from 2021) |
| AWS Redshift Spectrum Connector | `/redshift-spectrum-integration/` | How-to / Reference | Partially (Spark generates manifest) | Experimental; performance untested; consistency caveats documented; partition-level consistency only |
| Snowflake Connector | `/snowflake-integration/` | How-to / Reference | Partially (Spark generates manifest) | Manifest SQL example truncated mid-query; experimental; UniForm noted as preferred alternative |
| Google BigQuery Connector | `/bigquery-integration/` | Reference (stub) | No | Stub — one sentence; defers to BigLake docs |
| Apache Flink Connector | `/flink-integration/` | Reference (stub) | No | Stub — one sentence; defers to GitHub repo |
| Other Connectors (Druid, Pulsar, ClickHouse, Hive, Kafka Delta Ingest, etc.) | `/delta-more-connectors/` | Reference / Directory | No | Directory page with brief descriptions; no in-line operational docs; links to external resources |
| Delta Kernel (Java + Rust APIs for connector development) | `/delta-kernel/` | Tutorial / Reference | No (multi-engine) | Comprehensive; Java gets more detail than Rust; covers read/write/custom engine impl |
| Delta Standalone (deprecated) | `/delta-standalone/` | Reference | No | Deprecated; replaced by Delta Kernel; Java-only; single-JVM limitation; still functional |
| Delta Lake APIs (Scala, Java, Python, Rust bindings) | `/delta-apidoc/` | Reference | Partially | Some APIs marked Evolving; Rust Python bindings noted; Delta Flink Java API listed |
| Table Properties Reference | `/table-properties/` | Reference | Yes | 12 properties documented; no experimental/deprecated markers; `dataSkippingNumIndexedCols` missing from main optimizations page |

---

## Gaps and Stubs

### Connector stubs with no actionable content
- **Trino** (`/delta-trino-integration/`): One paragraph redirecting to Trino's own docs. No configuration examples, supported operations matrix, or version compatibility table.
- **Starburst** (`/delta-starburst-integration/`): One sentence. Defers entirely to Starburst docs.
- **Presto** (`/delta-presto-integration/`): Two sentences referencing v0.269 (2021). May be stale; no feature matrix.
- **Apache Flink** (`/flink-integration/`): One sentence plus link to GitHub. No setup instructions, supported operations, or known limitations within the docs site.
- **Google BigQuery** (`/bigquery-integration/`): One sentence noting reader v3 + Deletion Vectors + Column Mapping support. Defers to BigLake docs for everything else.

### Acknowledged experimental features without production guidance
- **S3 Multi-cluster writes** (DynamoDB-based mutual exclusion): Marked experimental since at least Delta 1.x; no progression toward stable or removal documented.
- **Auto Compaction** (v3.1.0+): Marked experimental; interaction with Liquid Clustering not documented.
- **Multi-part Checkpointing** (v2.0.0+): Marked experimental; no performance benchmarks or graduation timeline.
- **Delta Connect / Spark Connect** (v4.0.0+): Preview only, not for production; no advanced Delta feature support documented.

### Operations mentioned but not documented in depth
- **REORG TABLE**: Mentioned within the Deletion Vectors page but has no standalone page. Its broader use for UniForm Iceberg upgrade is described in `/delta-uniform/` without cross-linking.
- **In-commit Timestamps**: Referenced as a prerequisite for Catalog-Managed Tables and listed in the Drop Feature page, but there is no dedicated page explaining the feature, how to enable it, or its implications.
- **Checkpoint Protection**: Listed in the Drop Feature page as droppable but has no dedicated documentation.
- **V2 Checkpoints**: Listed in the Drop Feature page and referenced obliquely in multi-part checkpointing; no standalone explanation.
- **Vacuum Protocol Check feature**: Listed as a prerequisite for Catalog-Managed Tables and as droppable; no dedicated documentation.
- **UniForm write-safety enforcement**: The docs acknowledge that external Iceberg/Hudi clients can write to UniForm tables and cause data loss via GC, but provide no mitigation guidance or tooling reference.
- **DStream API**: The FAQ explicitly states Delta does not support DStream, but there is no migration guide for users coming from DStream-based pipelines.
- **Multi-table transactions**: The FAQ notes these are not supported, but there is no guidance on patterns to approximate cross-table atomicity.
- **Security / access control**: No coverage anywhere in the official docs. Authentication for storage (S3, ADLS, GCS) is documented under Storage Configuration, but column-level security, row-level security, and audit logging are entirely absent.
- **Performance benchmarks / sizing guidance**: No quantitative guidance on cluster sizing, file size targets, or Z-Order vs Liquid Clustering trade-offs.
- **Streaming best practices**: Best Practices page covers only batch scenarios (partitioning, compaction, table replacement, caching). Streaming-specific guidance is absent.

### Stale or potentially outdated content
- **Presto connector**: References v0.269 released in 2021; current Presto capabilities likely exceed what is described.
- **Redshift Spectrum connector**: Marked experimental with "performance and scalability characteristics have not yet been tested" — likely written several years ago without updates.
- **Snowflake connector**: SQL manifest table definition example is truncated mid-query (apparent render bug). UniForm is noted as a preferred alternative without deprecating the manifest approach.
- **Z-Ordering**: Documented as a current optimization but is functionally superseded by Liquid Clustering for new tables. No explicit deprecation or migration guidance from Z-Order to Liquid Clustering.
- **Delta default-columns limitations**: `ALTER TABLE ... ADD COLUMN` cannot specify a default value — this is a notable UX gap not prominently flagged.

---

## Notes

- **Diátaxis signal is weak across the site.** Most pages blend Guide, How-to, Explanation, and Reference content without explicit labeling. Users cannot easily distinguish "I want to understand why" from "I want to do X."
- **Version-gating is inconsistent.** Some features note their minimum Delta version in the page title or first paragraph; others bury version requirements in a prerequisites section or omit them.
- **Cross-linking between related features is sparse.** For example, Deletion Vectors, REORG TABLE, and UniForm are all interrelated but linked only loosely. Type Widening and Iceberg compatibility limitations appear in both the Type Widening and UniForm pages without a canonical reference.
- **Non-Spark engines are second-class citizens.** Despite Delta Kernel's design goal of enabling multi-engine connectors, the documentation provides no guidance on which Delta features are readable by Trino, Presto, or Flink natively versus requiring manifest generation.
- **The Table Properties Reference** (`/table-properties/`) lists only 12 properties. The actual set of `delta.*` properties used across the documentation (e.g., `delta.enableRowTracking`, `delta.enableTypeWidening`, `delta.feature.catalogManaged`) is much larger and is not consolidated anywhere.
- **Delta Standalone** is deprecated in favor of Delta Kernel. Its presence in the sidebar navigation without a prominent deprecation banner may confuse new users choosing between the two.
