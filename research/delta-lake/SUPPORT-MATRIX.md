# Delta Lake Engine Support Matrix

**Plan:** #139 — Wave 2 consolidation (Task #155)
**Date:** 2026-03-27
**Sources:** Wave 1 research reports 01–09 + Wave 2 synthesis files

---

## Overview

Nine Wave 1 research reports surveyed Delta Lake documentation coverage across eight compute engines (Apache Spark, delta-rs/DataFusion, DuckDB, Polars, Daft, Trino, Apache Flink, and AWS Athena) plus the official delta.io and delta-rs documentation sites. The research produced three Wave 2 synthesis files: a per-journey × per-engine coverage matrix (173 cells across 55 journeys), a gap analysis identifying 23 distinct documentation gaps ranked by community signal strength and engine reach, and a 55-journey Diátaxis-structured inventory. The overarching finding is that **Apache Spark is the only fully documented engine**, that the delta-rs ecosystem (Python/Rust, Polars, Daft) covers a substantial portion of operations but almost entirely without cross-engine comparison content, and that a small set of high-traffic journeys — MERGE with schema evolution, concurrent S3 writes, VACUUM + time travel retention, and column mapping — account for the majority of community frustration signals. The 23 gaps break into three types: documentation gaps (feature implemented but not explained), engine coverage gaps (feature absent in non-Spark engines), and content clarity gaps (documentation exists but generates persistent community confusion). Twelve ecosystem outreach opportunities were identified where working with engine maintainers (delta-rs, Daft, DuckDB, Trino, Flink) would close gaps more efficiently than writing Delta-side documentation alone.

---

## Engine Support Matrix

> **Legend:**
> - ✅ Supported and documented
> - ⚠️ Supported but undocumented, unstable, or requires manual delta-rs call (not exposed via engine's own API)
> - ❌ Not supported
> - — Not applicable

### Fundamentals

| Journey / Operation | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | Flink |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Read — full table scan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read — predicate pushdown (filter) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read — projection pushdown (column pruning) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read — partition pruning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Read — deletion vector support | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ❌ |
| Write — create table | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Write — append | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Write — overwrite (full table) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Write — overwrite (predicate / replaceWhere) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Write — dynamic partition overwrite | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Time travel — by version number | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Time travel — by timestamp | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Table metadata inspection (schema, history, detail) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ |
| Storage config — S3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Storage config — Azure ADLS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Storage config — GCS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Idempotent writes (txnAppId / txnVersion) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Quick-start / getting-started tutorial | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ |

### Table Operations

| Journey / Operation | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | Flink |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| DELETE (row-level predicate) | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ |
| UPDATE (row-level predicate) | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ |
| MERGE / upsert | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| MERGE — WHEN NOT MATCHED BY SOURCE | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| MERGE — schema evolution | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ |
| Schema enforcement on write | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ❌ |
| Schema evolution — merge (add columns) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Schema evolution — overwrite (replace schema) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Schema evolution — add columns via ALTER | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ |
| Schema evolution — rename / drop columns (Column Mapping) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Generated columns | ✅ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| Identity columns | ✅ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| Default column values | ✅ | ❌ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| NOT NULL constraint | ✅ | ❌ | — | ❌ | ❌ | ❌ | ✅ | ❌ |
| CHECK constraint | ✅ | ✅ | — | ❌ | ❌ | ✅ | ✅ | ❌ |
| Type widening (manual / auto schema evolution) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| VACUUM | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ |
| OPTIMIZE — bin-packing compaction | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ |
| OPTIMIZE — Z-Order | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ✅ | ❌ |
| Liquid Clustering (CLUSTER BY) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Auto Compaction | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Optimized Write | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RESTORE | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ |
| SHALLOW CLONE / CLONE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CONVERT TO DELTA (from Parquet) | ✅ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| CONVERT TO DELTA (from Iceberg) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| GENERATE (manifest files for external engines) | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| REORG TABLE (apply / purge) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deletion Vectors — enable | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Row Tracking | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Concurrent writes — S3 safety (DynamoDB locking) | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ |
| ALTER TABLE DROP FEATURE | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Catalog-Managed Tables | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Change Data / Streaming

| Journey / Operation | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | Flink |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Change Data Feed — enable on table | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ |
| Change Data Feed — batch read | ✅ | ✅ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ |
| Change Data Feed — streaming read | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change Data Feed — write (emit change files during DML) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delta as streaming source (readStream) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delta as streaming sink (writeStream) | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ |
| Streaming — ignoreDeletes / ignoreChanges | ✅ | ❌ | — | — | — | — | — | ❌ |
| Streaming — startingVersion / startingTimestamp | ✅ | ❌ | — | — | — | — | — | ❌ |
| Streaming — schema tracking (Column Mapping compat) | ✅ | ❌ | — | — | — | — | — | ❌ |
| Idempotent streaming writes (txnAppId / txnVersion) | ✅ | ❌ | — | — | — | — | — | ❌ |
| Streaming — foreachBatch + merge pattern | ✅ | ❌ | — | — | — | — | — | ❌ |

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

## Top 10 Priority Journeys for Content Generation

Ranked by combined priority score from the gap analysis (community signal strength × engines affected) and confirmed against the journey inventory's P0/P1 prioritization.

### 1. Engine feature comparison matrix
**Gap:** G03 (Priority score: 28) | **Journey inventory:** Reference — "Engine support matrix" (P0)
**Rationale:** No page on docs.delta.io answers "can engine X do operation Y?" with any completeness. Delta issue #1775 explicitly names this gap with 16 comments. This single deliverable would address the most-asked class of community questions and is cited as the input dependency for all other content decisions. The research reports now contain the raw data to produce this matrix.

### 2. MERGE / upsert with schema evolution
**Gap:** G01 (Priority score: 20) | **Journey inventory:** How-to — "MERGE with schema evolution" (P0)
**Rationale:** Highest community signal strength (5/5). Delta #553 (20 comments), delta-rs #3339, and Databricks' 2021 FAQ still cited 5 years later. The official docs treat MERGE and schema evolution as separate pages without a worked example that combines them. Edge cases (new columns from source, list-of-structs, type widening) are undocumented. A single how-to walking through the full MERGE + schema evolution workflow, with explicit callouts for which engines support which variant, would close this.

### 3. Concurrent writes safely on S3
**Gap:** G02 (Priority score: 20) | **Journey inventory:** How-to — "Set up concurrent writes safely on AWS S3" (P0)
**Rationale:** Community signal 5/5. Recurring data-loss reports (Delta #1830, 9 comments). DynamoDB locking on S3 is marked experimental with no graduation timeline. No single page explains the safe concurrency story across Spark, delta-rs, Trino, and DuckDB. A concurrency safety guide with per-engine guidance and explicit warnings for DuckDB (no locking) and Trino (non-concurrent mode required) would address a safety-critical gap.

### 4. VACUUM + time travel retention model
**Gap:** G05 (Priority score: 20) | **Journey inventory:** Explanation — "How VACUUM interacts with time travel" (P0)
**Rationale:** Community signal 4/5. Persistent SO questions and a Medium article (Dec 2025). `deletedFileRetentionDuration` vs. `logRetentionDuration` are documented but the interaction is not demonstrated. Users run VACUUM and get unexpected behavior because the mental model is not built before the reference material. A worked-example explanation would reduce support load across all five engines affected.

### 5. Column mapping in non-Spark engines
**Gap:** G04 (Priority score: 16) | **Journey inventory:** How-to — "Rename or drop a column using Column Mapping" (P1)
**Rationale:** Community signal 4/5. Delta-rs #930 has 14 comments; users get hard errors at runtime with no warning in the docs. Polars and Daft users discover silently or hit protocol errors. A short how-to explaining the column mapping gap per engine, with workarounds and links to tracking issues, prevents frustrated runtime discovery and sets ecosystem engagement expectations.

### 6. Liquid Clustering availability and limitations for non-Spark users
**Gap:** G06 (Priority score: 16) | **Journey inventory:** How-to — "Enable and use Liquid Clustering" (P1)
**Rationale:** Community signal 4/5. Delta-rs #2043 (11 comments). The official Spark docs recommend Liquid Clustering over Z-Order for new tables, but LC is entirely absent from delta-rs, Polars, Daft, and DuckDB. Users who follow official best practices for Spark then cannot maintain those tables from Python. A single page that surfaces this engine boundary and provides the Z-Order fallback path for non-Spark engines prevents wasted table migrations.

### 7. Delta 4.0 / delta-spark 4.x cross-engine compatibility
**Gap:** G07 (Priority score: 16) | **Journey inventory:** Reference — "delta-rs version compatibility and breaking changes" (P1)
**Rationale:** Community signal 4/5. Delta-rs #3782, #4247. Delta 4.0 introduced protocol features (managed commits, in-commit timestamps, V3 checkpoints) that break compatibility with delta-rs in some configurations. DuckDB raises read errors on V2Checkpoint tables. A cross-engine compatibility matrix for Delta protocol versions — analogous to the existing Spark version matrix — would allow non-Spark users to understand which Delta features are safe to enable.

### 8. Non-Spark connector stub pages (Trino, Flink, Presto, BigQuery)
**Gap:** G21 (Priority score: 16) | **Journey inventory:** How-to — per-engine getting-started pages (P1)
**Rationale:** Community signal 4/5. All four connector pages on docs.delta.io are one-sentence stubs. Users landing from the Delta docs cannot learn what Trino supports, that Flink only works with DataStream API (not Table API/SQL), or that DuckDB has an active write-path bug. Expanding each stub to include: supported operations, known limitations, compatible versions, and links to tracking issues would close a navigation dead-end that affects every new non-Spark user.

### 9. Deletion vectors cross-engine readability
**Gap:** G12 (Priority score: 16) | **Journey inventory:** How-to — "Enable Deletion Vectors and understand their performance impact" (P1)
**Rationale:** Community signal 4/5. DVs are enabled by default in Databricks Runtime 14+ and delta-rs 1.4.0+. Daft raises `NotImplementedError` on DV-enabled tables (Daft #1954). DuckDB can read but not write. Flink errors on mixed add/remove commits. A cross-engine DV compatibility table, paired with a migration note for users moving tables from Databricks to Python engines, would prevent data-access failures.

### 10. Streaming best practices (checkpoint management, schema tracking)
**Gap:** G09 (Priority score: 16) | **Journey inventory:** Guide — "Build a streaming lakehouse pipeline with Spark Structured Streaming" (P0)
**Rationale:** Community signal 4/5. Delta #779, #859, #1396. The docs.delta.io Best Practices page covers batch scenarios only. Streaming-specific topics with known community demand — checkpoint/log retention interaction, `schemaTrackingLocation` for long-running streams, `ignoreDeletes`/`ignoreChanges` semantics — are entirely absent. A streaming best practices page (even Spark-only) addresses the P0 journey "Build a streaming lakehouse pipeline" which currently has only scattered coverage.

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
**Gaps addressed:** G17 (DuckDB write path maturity), G02 (concurrent writes on S3)
**Opportunity:** DuckDB's own docs accurately describe the write path as "blind insert only" and list open issues. The gap is that docs.delta.io's DuckDB integration page is a stub that implies read-only. Coordinate with the DuckDB team to: (a) publish a write-path status update once the partitioned-write bug (#280) is fixed, and (b) add a concurrency warning to the DuckDB page on docs.delta.io noting that DuckDB inserts to S3 have no locking mechanism.

### 4. Trino maintainers — S3 concurrent write safety documentation
**Gaps addressed:** G02 (concurrent writes on S3), G21 (non-Spark connector stubs)
**Opportunity:** Trino's Delta Lake connector supports full DML but concurrent writes to S3 are unsafe without explicit configuration, and there is no collision detection when writing alongside other engines. The Trino docs document this in their connector page, but docs.delta.io's Trino stub page does not. Coordinating with the Trino community to produce a joint "multi-engine write safety" guide would serve users running Trino alongside Spark or delta-rs.

### 5. Apache Flink community — Document DataStream-only limitation and 2.0 roadmap
**Gaps addressed:** G13 (Flink connector status), G21 (non-Spark connector stubs)
**Opportunity:** The Flink Delta connector is in Preview, only supports DataStream API (not Flink Table API/SQL), and is not yet compatible with Flink 2.0 (#5228). The connector's README and delta.io's Flink stub page do not clearly explain these constraints. Outreach to the Flink Delta connector maintainers to produce: (a) a limitations section in the integration page, (b) a Flink 2.0 compatibility statement, and (c) an explanation of why the connector cannot reflect DELETE operations.

### 6. delta-rs / delta-io documentation team — Engine comparison matrix
**Gaps addressed:** G03 (engine feature comparison matrix), G21 (non-Spark connector stubs)
**Opportunity:** The single highest-impact documentation deliverable identified in this analysis is an engine capability matrix on docs.delta.io. This requires coordination across multiple engine teams to verify accuracy. A community-maintained matrix (similar to the Apache Iceberg Engine Support page) would address the most-asked class of questions. Propose this to the delta.io documentation working group with an offer to draft the initial version based on these research reports.

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

55 distinct user journeys across four Diátaxis categories. Priority tiers: **P0** = fundamentals every new user needs; **P1** = intermediate operations with known community demand; **P2** = advanced or specialist use cases.

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
| Append data to a Delta table | Spark, delta-rs, Polars, Daft, DataFusion, DuckDB (blind insert) | Yes (Spark, delta-rs, Polars, Daft) — scattered across individual engine docs; DuckDB append is documented but marked immature | P0 |
| Overwrite a Delta table (full and predicate-based) | Spark, delta-rs, Polars, DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/appending-overwriting; Daft supports full overwrite; no unified how-to | P0 |
| Read a Delta table with time travel (by version number) | Spark, delta-rs, Polars, Daft, DataFusion, DuckDB | Yes (Spark) — docs.delta.io; Yes (delta-rs, Polars, Daft) — individual engine docs; DuckDB: version only (no timestamp), partially documented | P0 |
| Read a Delta table with time travel (by timestamp) | Spark, delta-rs, Polars, Daft, DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs, Polars, Daft) — individual engine docs; DuckDB: NOT SUPPORTED (open issue #227) | P0 |
| Perform a MERGE / upsert on a Delta table | Spark, delta-rs, Polars (via delta-rs), DataFusion | Yes (Spark) — docs.delta.io comprehensive; Yes (delta-rs) — usage/merging-tables; Polars wraps delta-rs merge; DuckDB/Daft: NOT SUPPORTED | P0 |
| MERGE with schema evolution (new columns from source) | Spark, delta-rs (with caveats), DataFusion | Partial — Spark docs cover schema evolution in MERGE; delta-rs has edge-case bugs with List<Struct>; no unified how-to; highest-signal community gap | P0 |
| DELETE rows from a Delta table with a predicate | Spark, delta-rs, Polars (via delta-rs), DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/deleting-rows; Polars: undocumented in Polars docs; Daft: NOT SUPPORTED | P0 |
| UPDATE rows in a Delta table with a predicate | Spark, delta-rs, Polars (via delta-rs), DataFusion | Yes (Spark) — docs.delta.io; delta-rs: API reference only, no usage guide page; Polars: undocumented in Polars docs; Daft: NOT SUPPORTED | P0 |
| Run VACUUM to reclaim storage and understand retention | Spark, delta-rs, DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/managing-tables; Polars: via delta-rs direct call, undocumented; Daft/DuckDB: NOT SUPPORTED | P0 |
| Run OPTIMIZE (bin-packing compaction) to reduce small files | Spark, delta-rs, DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/optimize; Polars: via delta-rs, undocumented; Daft/DuckDB: NOT SUPPORTED | P1 |
| Use Z-Ordering to co-locate similar data | Spark, delta-rs, DataFusion | Yes (Spark) — docs.delta.io; Partial (delta-rs) — dedicated page returned 404 during crawl; community confusion on interaction with partitioning | P1 |
| Enable and use Liquid Clustering instead of Z-Ordering | Spark only | Yes (Spark) — docs.delta.io comprehensive; NOT available in delta-rs, Polars, DuckDB, Daft | P1 |
| Enable and read Change Data Feed (CDF) | Spark, delta-rs, DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/read-cdf; Polars: undocumented in Polars docs (requires delta-rs direct call); Daft/DuckDB: NOT SUPPORTED | P1 |
| Set up concurrent writes safely on AWS S3 (DynamoDB locking) | delta-rs, DataFusion | Yes — delta-rs has a locking-provider page; community demand is high (recurring Stack Overflow pattern); no cross-engine comparison | P0 |
| Configure schema enforcement and handle write rejections | Spark, delta-rs | Yes (Spark) — docs.delta.io; Partial (delta-rs) — schema_mode options documented per write API; no standalone how-to explaining the enforcement model | P1 |
| Evolve a schema by adding columns (mergeSchema / schema_mode=merge) | Spark, delta-rs, Polars, DataFusion | Yes (Spark) — docs.delta.io; Yes (delta-rs, Polars) — covered in write docs; Daft: schema merge NOT SUPPORTED | P1 |
| Rename or drop a column using Column Mapping | Spark | Yes (Spark) — docs.delta.io; delta-rs: NOT SUPPORTED (open issue #930, 14 comments); Polars: NOT SUPPORTED without PyArrow fallback; Daft: NOT SUPPORTED | P1 |
| Enable Deletion Vectors and understand their performance impact | Spark, delta-rs | Yes (Spark) — docs.delta.io; delta-rs: TableAlterer.add_feature() documented; no dedicated usage guide; Polars: reads supported; DuckDB: reads supported; Daft: NOT SUPPORTED (raises NotImplementedError) | P1 |
| Use RESTORE to revert a table to a prior version | Spark, delta-rs | Yes (Spark) — docs.delta.io; delta-rs: API reference only, no usage guide; Polars: undocumented | P1 |
| Clone a Delta table (SHALLOW CLONE / CLONE) | Spark only | Yes (Spark) — docs.delta.io; NOT available in delta-rs, DuckDB, Polars, Daft | P2 |
| Convert an external table to Delta and register with a catalog (Glue, Unity Catalog, HMS) | Spark, delta-rs (UC) | Partial — Spark covers CONVERT TO DELTA; delta-rs has Unity Catalog loading (uc://); no Glue how-to; high community demand (#1679, #2434) | P1 |
| Use Delta Sharing to share data across organizations | Spark (write); any engine (read) | Yes (Spark) — docs.delta.io; delta-rs: NOT SUPPORTED; Daft: NOT SUPPORTED (open feature #4927) | P2 |
| Set up Delta Kernel to build a custom non-Spark connector | Java, Rust (via Delta Kernel APIs) | Yes — docs.delta.io Delta Kernel section; comprehensive; Java more detailed than Rust | P2 |
| Generate symlink manifests for manifest-based connectors (Redshift Spectrum, legacy Snowflake) | Spark, delta-rs (API only) | Yes (Spark) — docs.delta.io GENERATE page; delta-rs: API reference only, no usage guide; manifest-based connectors are increasingly deprecated | P2 |
| Configure storage credentials for cloud object stores (per-engine) | Spark, delta-rs, DuckDB, Polars, Daft | Partial — delta-rs has per-cloud pages; DuckDB has CREATE SECRET docs; Spark has /delta-storage/; no unified cross-engine credentials how-to | P1 |
| Enable UniForm to expose a Delta table to Iceberg readers | Spark only | Yes (Spark) — docs.delta.io; write-safety enforcement gap documented; external writes risk GC data loss with no mitigation guidance | P1 |
| Use Type Widening to change a column's data type safely | Spark | Yes (Spark) — docs.delta.io; delta-rs: NOT SUPPORTED; Polars: NOT SUPPORTED | P2 |
| Set NOT NULL and CHECK constraints on a table | Spark, delta-rs | Yes (Spark) — docs.delta.io; Yes (delta-rs) — usage/constraints; delta-rs only supports CHECK; NOT NULL absent from delta-rs docs | P1 |
| Use Row Tracking to identify and track individual rows | Spark only | Yes (Spark) — docs.delta.io; NOT available in delta-rs, DuckDB, Polars, Daft | P2 |
| Drop a Delta table feature (ALTER TABLE DROP FEATURE) | Spark only | Yes (Spark) — docs.delta.io; NOT available in delta-rs, DuckDB, Polars, Daft | P2 |

---

### Explanation

Conceptual content for users who want to understand how and why Delta Lake behaves the way it does.

| Journey | Engines | Currently documented? | Priority |
|---|---|---|---|
| How the Delta transaction log works (architecture, JSON log files, checkpoints) | All (protocol-level) | Partial — delta-rs docs have "Architecture of a Delta Table" (good); docs.delta.io has no equivalent standalone explanation; cross-engine shared | P0 |
| How ACID transactions work in Delta Lake (MVCC, atomicity, conflict detection) | All (protocol-level) | Partial — delta-rs docs have "ACID Transactions" (good); docs.delta.io covers concurrency control in reference style but lacks a dedicated explanation page | P0 |
| How file skipping and data skipping work (min/max statistics, partition pruning) | All (read-capable engines) | Partial — delta-rs docs have "File Skipping" (good); docs.delta.io explains data skipping within the optimizations page; no cross-engine explanation | P0 |
| How schema enforcement differs from schema evolution (mental model) | Spark, delta-rs, Polars | Partial — docs.delta.io covers enforcement and evolution separately without a unified mental-model explanation; community signals show this is a persistent source of confusion | P0 |
| How VACUUM interacts with time travel (retention windows, what gets deleted and when) | Spark, delta-rs | Partial — docs.delta.io VACUUM page has safety warnings; delta-rs managing-tables page mentions 7-day default; no unified explanation of the retention model; highest-signal community confusion topic | P0 |
| How concurrency control works in Delta Lake (OCC, conflict matrix, exception types) | Spark (full detail), delta-rs (partial) | Yes (Spark) — docs.delta.io concurrency control page is comprehensive; delta-rs: MVCC explained in ACID transactions page; no cross-engine conflict matrix | P1 |
| How Change Data Feed works under the hood (what gets written, what gets read) | Spark, delta-rs | Partial — docs.delta.io CDF page explains enable/read; delta-rs CDF page explains API; neither explains the internal mechanics (change_data/ files, column semantics) | P1 |
| How Deletion Vectors work and why they improve DML performance | Spark, delta-rs, DuckDB (read), Polars (read) | Partial — docs.delta.io deletion vectors page explains enable + REORG; delta-rs best practices mentions DV performance benefit; no unified conceptual explanation of DV mechanics | P1 |
| How Delta Lake's protocol versioning system works (reader/writer versions, feature flags) | All (protocol-level) | Yes (Spark) — docs.delta.io versioning page is comprehensive; delta-rs 1.0.0 upgrade guide covers breaking protocol changes; no unified multi-engine explanation | P1 |
| Why Spark is required for most write operations (Delta Lake engine architecture) | Spark vs. non-Spark | No — the docs.delta.io site assumes Spark throughout; no page explains why Spark is the reference write engine or what the non-Spark alternatives are and their trade-offs | P0 |
| OSS Delta Lake vs. Databricks Delta: what features are exclusive to each | Spark (OSS) vs. Databricks | No — docs.delta.io covers only OSS; community frustration is high (#1775, 16 comments); no official page draws the OSS/Databricks boundary | P1 |

---

### Reference

Technical specifications, compatibility matrices, and lookup resources.

| Journey | Engines | Currently documented? | Priority |
|---|---|---|---|
| Delta table properties reference (all `delta.*` properties, their defaults and effects) | All (via table properties) | Partial — docs.delta.io `/table-properties/` lists only 12 properties; the actual set used across docs is much larger and not consolidated; delta-rs #3329 is an open gap request | P0 |
| Engine support matrix (which operations are supported by which engine) | Spark, delta-rs, DuckDB, Polars, Daft, DataFusion, Trino, Flink, Athena | No — does not exist anywhere; the closest is the ecosystem landscape scan (report 09); community demand is high | P0 |
| Delta Lake ↔ Apache Spark version compatibility matrix | Spark | Yes — docs.delta.io versioning page; comprehensive; engine-specific version history in report 07 | P1 |
| Delta feature ↔ minimum Delta version reference | Spark | Yes — docs.delta.io versioning page; also in report 07; only Spark engine | P1 |
| delta-rs version compatibility and breaking changes reference | delta-rs | Partial — only the 1.0.0 upgrade guide exists; no per-version feature introduction index | P1 |
| Storage configuration keys reference (per cloud backend, per engine) | delta-rs, DuckDB, Polars, Daft | Partial — delta-rs has per-cloud pages; DuckDB has CREATE SECRET docs; Spark has /delta-storage/; no unified cross-engine reference table | P1 |
| DESCRIBE HISTORY operation metrics reference (what each operation records) | Spark | Yes — docs.delta.io DESCRIBE HISTORY page includes an operation metrics table; delta-rs history() method documented but without the metrics table | P1 |
| Supported type conversions for Type Widening | Spark | Yes — docs.delta.io type-widening page includes a supported-conversions table; Spark-only | P2 |
| Delta exception types and programmatic error handling | Spark, delta-rs | Partial — docs.delta.io concurrency control page lists exception types; delta-rs API reference documents 5 exception classes; no unified cross-engine error-handling reference | P1 |
| Delta Lake API reference (Scala, Java, Python, Rust) | Spark, delta-rs | Partial — docs.delta.io links to generated API docs; delta-rs has an API reference section; Python best-covered; no canonical cross-engine API lookup | P1 |
| Streaming source and sink options reference (maxFilesPerTrigger, startingVersion, etc.) | Spark | Partial — docs.delta.io streaming page covers options inline; no standalone reference page with all options tabulated | P1 |
| MERGE semantics reference (WHEN clauses, ordering, cardinality rules) | Spark, delta-rs | Partial — docs.delta.io MERGE page is comprehensive for Spark; delta-rs merge docs are a usage guide; no standalone reference for clause semantics including the multiple-match behavior difference between engines | P1 |
| Delta Kernel API reference (Java + Rust) | Java, Rust (connector developers) | Yes — docs.delta.io Delta Kernel section; Java more complete than Rust; targeted at connector builders | P2 |

---

## Research Files

All files produced by Plan #139 in `research/delta-coverage/`:

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
| `synthesis-coverage-matrix.md` | Wave 2: Per-journey × per-engine coverage matrix (173 cells, 55 journeys) |
| `synthesis-gap-analysis.md` | Wave 2: 23 documentation gaps ranked by community signal × engines affected |
| `synthesis-journey-inventory.md` | Wave 2: Full 55-journey Diátaxis inventory with current documentation status |
| `SUPPORT-MATRIX.md` | Wave 2: This file — consolidated findings, top 10 priorities, outreach opportunities |

---

*This file was produced by an AI agent.*
