# Delta Lake Documentation Gap Analysis — Community-Grounded Synthesis

**Task:** #153 (Plan #139)
**Date:** 2026-03-27
**Source reports:** 01-delta-official-docs, 02-delta-rs-docs, 03-engine-duckdb, 04-engine-polars, 05-engine-daft, 06-engine-datafusion, 07-engine-spark, 08-community-signals, 09-ecosystem-landscape

---

## Summary

Cross-referencing the nine Wave 1 research reports against the five community signal themes yields 23 distinct documentation gaps. The highest-priority gaps cluster around two axes: **write-path feature parity** (MERGE/upsert and schema evolution behave differently or are absent across engines, with no single comparison page explaining this) and **safety-critical operational journeys** (S3 concurrent write safety, VACUUM retention semantics) where the documentation is technically present but insufficient to prevent user error.

Three gap types are represented:

- **Documentation gaps (A)**: The feature exists and is implemented, but there is no how-to guide, the guide is thin or misleading, or the feature is undocumented in the engine's own docs.
- **Engine coverage gaps (B)**: The feature does not exist in one or more engines used by the community; the gap itself is undocumented or understated in Delta Lake's own integration pages.
- **Content clarity gaps (C)**: Documentation exists but community signals (comment volume, recurrence, third-party blog posts correcting the official content) indicate the explanation is insufficient to build a correct mental model.

Priority score = community signal strength (1–5) × number of engines affected (out of 7 scored engines: Spark, delta-rs/DataFusion, DuckDB, Polars, Daft, Flink, Trino).

---

## Gap Inventory

| # | Journey | Gap Type | Affected Engines | Community Signal Strength (1–5) | Priority Score |
|---|---------|----------|-----------------|--------------------------------|----------------|
| G01 | MERGE / upsert with schema evolution | A + C | Spark, delta-rs/DataFusion, Polars, Daft | 5 | 20 |
| G02 | Concurrent writes safely on S3 | A + C | Spark (experimental), delta-rs, Trino, DuckDB (no DML) | 5 | 20 |
| G03 | Engine feature comparison — what each engine can and cannot do | A | All 7 | 4 | 28 |
| G04 | Column mapping (rename/drop columns) in non-Spark engines | B | delta-rs, Polars, Daft, DuckDB | 4 | 16 |
| G05 | Time travel + VACUUM retention configuration | C | Spark, delta-rs, Polars, Daft, DuckDB | 4 | 20 |
| G06 | Liquid clustering — when to use vs. Z-Order, engine support | A + B | Spark (documented); delta-rs, Polars, Daft, DuckDB (absent) | 4 | 16 |
| G07 | Delta 4.0 / delta-spark 4.x compatibility with delta-rs and non-Spark clients | B | delta-rs, DuckDB, Polars, Daft | 4 | 16 |
| G08 | Z-Order / optimization for large tables — correctness and limits | C | delta-rs, Polars, Daft | 3 | 9 |
| G09 | Streaming + Delta — checkpoint behavior and log management | A | Spark (thin best practices); all others (absent) | 4 | 16 |
| G10 | Generated columns and identity columns in OSS Spark SQL | A + B | Spark (SQL DDL gap vs. Databricks), all non-Spark engines | 4 | 16 |
| G11 | Schema enforcement vs. schema evolution mental model | C | Spark, delta-rs, Polars | 4 | 12 |
| G12 | Deletion vectors — cross-engine readability and write side | B | Daft (read blocked), DuckDB (no write), Flink (no DV), delta-rs (partial) | 4 | 16 |
| G13 | Flink connector status and known limitations | A + B | Flink | 3 | 3 |
| G14 | Catalog integration (Glue, Unity Catalog, Hive Metastore) | A | Spark, delta-rs, Daft | 4 | 12 |
| G15 | Change Data Feed — enablement, retroactive add, cross-engine support | A + B | Spark (documented), delta-rs/DataFusion (CDF write absent), Polars (undocumented), DuckDB (absent), Daft (absent) | 3 | 15 |
| G16 | OR predicates / partition predicate limitations in non-Spark engines | B | delta-rs, DuckDB | 3 | 6 |
| G17 | DuckDB write path maturity and limitations | A | DuckDB | 3 | 3 |
| G18 | MERGE silent incorrect behavior (multiple source rows matching one target) | A + C | delta-rs, DataFusion | 4 | 8 |
| G19 | OSS vs. Databricks feature parity — what is OSS, what is Databricks-only | A + C | Spark (primary), all non-Spark | 5 | 15 |
| G20 | delta-rs UPDATE operation — no dedicated usage guide | A | delta-rs, Polars | 3 | 6 |
| G21 | Non-Spark connector stubs on docs.delta.io (Trino, Flink, Presto, BigQuery) | A | Trino, Flink, Presto, BigQuery | 4 | 16 |
| G22 | Streaming best practices (schema tracking, checkpoint management) | A | Spark | 4 | 4 |
| G23 | UniForm write-safety — external Iceberg writes cause silent data loss | C | Spark (UniForm), Iceberg readers | 3 | 6 |

---

## Top 10 Gaps by Priority

Ranked by priority score (community signal strength × engines affected). Ties broken by community signal strength.

### 1. G03 — Engine feature comparison matrix (Priority: 28)
**Gap type:** Documentation gap
**Community signal:** 4 / 5. Issue delta-io/delta #1775 (16 comments) explicitly names the lack of a cross-engine feature matrix. Dozens of community questions reduce to "does engine X support feature Y?" with no canonical answer page.
**Problem:** docs.delta.io has no single page comparing what Spark, Trino, Flink, DuckDB, delta-rs, Polars, and Daft can and cannot do. Connector pages are stubs (one sentence redirecting to vendor docs). Users cannot answer basic questions like "can Daft MERGE?" or "does DuckDB support deletion vectors on write?" without reading multiple external sources.
**Affected engines:** All 7.
**Fix:** Publish an engine capability matrix table (operations × engines) as a first-class page on docs.delta.io, updated with each Delta release.

### 2. G01 — MERGE / upsert with schema evolution (Priority: 20)
**Gap type:** Documentation gap + content clarity gap
**Community signal:** 5 / 5. Delta #553 (20 comments), delta-rs #3339 (7 comments), delta-rs #2355, community theme A/B/D recurrence. Databricks' own 2021 FAQ still cited 5 years later.
**Problem:** The official docs document MERGE and schema evolution on separate pages without explaining how they interact. Edge cases — new columns from source, type widening, list-of-structs schemas — are not worked through with examples. delta-rs has a known bug for list-of-struct schema merge (issue #3339, unfixed as of March 2026). Daft does not support `schema_mode="merge"` at all. Polars and DuckDB have no MERGE. The documentation gives no guidance on which engine to choose for upsert + schema evolution workflows.
**Affected engines:** Spark, delta-rs/DataFusion, Polars, Daft (4 of 7).

### 3. G02 — Concurrent writes safely on S3 (Priority: 20)
**Gap type:** Documentation gap + content clarity gap
**Community signal:** 5 / 5. Delta #1830 (9 comments, "data loss"), delta-rs S3 locking docs referenced as thin, SO recurring, buoyantdata.com blog post on S3 concurrency limitations.
**Problem:** The S3 multi-cluster write path (DynamoDB locking) is marked experimental since Delta 1.x with no graduation timeline. Delta-rs provides a setup guide but delta.io's own docs don't. Trino's concurrent write safety requires `delta.enable-non-concurrent-writes` with no collision detection in multi-engine environments. DuckDB writes to S3 are append-only with no locking. No single page explains the safe concurrency story for each engine combination.
**Affected engines:** Spark (experimental), delta-rs, Trino, DuckDB.

### 4. G05 — Time travel + VACUUM retention configuration (Priority: 20)
**Gap type:** Content clarity gap
**Community signal:** 4 / 5. Delta-rs #2252 (6 comments), Medium article Dec 2025, Databricks 2021 FAQ, SO persistent unanswered questions.
**Problem:** Users run VACUUM and then expect files older than the 7-day default to be removed, but time-travel still works past the retention window in some configurations. The docs explain the mechanics correctly but do not model the mental model mismatch. `deletedFileRetentionDuration` vs. `logRetentionDuration` are listed in table properties but not demonstrated in a worked example that shows the interaction.
**Affected engines:** Spark, delta-rs, Polars, Daft, DuckDB (5 of 7).

### 5. G04 — Column mapping in non-Spark engines (Priority: 16)
**Gap type:** Engine coverage gap
**Community signal:** 4 / 5. Delta-rs #930 (14 comments), Polars reader protocol restriction (DeltaProtocolError for columnMapping), Daft #1955 (open), DuckDB supports read side only.
**Problem:** Column mapping (rename/drop columns) is a GA Spark feature since Delta 1.2.0. Delta-rs does not implement it at all — users get a hard error. Polars raises a `DeltaProtocolError` unless using the PyArrow fallback path. Daft produces incorrect results silently. DuckDB can read column-mapped tables via delta-kernel-rs but cannot apply mapping changes. The delta-rs docs make no mention of column mapping as a known gap; users discover it at runtime.
**Affected engines:** delta-rs, Polars, Daft, DuckDB (4 of 7).

### 6. G06 — Liquid clustering availability in non-Spark engines (Priority: 16)
**Gap type:** Documentation gap + engine coverage gap
**Community signal:** 4 / 5. Delta-rs #2043 (11 comments), delta #1379 (Z-Order/clustering confusion), delta-rs #3906.
**Problem:** Liquid clustering is the recommended replacement for Z-Order for new tables in Spark (GA from Delta 3.2). However, it is entirely absent from delta-rs, Polars, Daft, and DuckDB. The official Delta docs recommend Liquid Clustering without noting that non-Spark engines cannot create or recluster tables with it. Users who follow the best practices for Spark cannot then maintain those tables from Python/Rust without dropping back to Spark.
**Affected engines:** delta-rs, Polars, Daft, DuckDB (absent); Spark (documented).

### 7. G07 — Delta 4.0 / delta-spark 4.x compatibility with delta-rs and non-Spark clients (Priority: 16)
**Gap type:** Engine coverage gap
**Community signal:** 4 / 5. Delta-rs #3782 (6 comments), delta-rs #4247 (7 comments), delta blog explicitly noting "Flink, Hive, Standalone, Uniform not available yet" in 4.0 preview.
**Problem:** Delta 4.0 introduced protocol features (V3 features, managed commits, in-commit timestamps) that delta-rs cannot yet read in all configurations. Delta-rs also produces checkpoint formats that are incompatible with Databricks Photon in some configurations (delta-rs #4247). DuckDB raises a read error on V2Checkpoint tables (#182). The Delta 4.1.0 blog notes compatibility concerns but there is no cross-compatibility matrix in the official docs.
**Affected engines:** delta-rs, DuckDB, Polars, Daft (4 of 7).

### 8. G21 — Non-Spark connector stubs on docs.delta.io (Priority: 16)
**Gap type:** Documentation gap
**Community signal:** 4 / 5. Direct evidence in all four connector pages: Trino (one paragraph), Flink (one sentence + GitHub link), Presto (two sentences, 2021 reference), BigQuery (one sentence).
**Problem:** These pages are navigation dead-ends. They do not tell users which Delta operations are supported, which versions are compatible, or what the known limitations are. A user arriving from docs.delta.io cannot learn from it that Trino supports full DML, that Flink only supports DataStream API and not Table SQL, or that DuckDB cannot perform UPDATE/DELETE.
**Affected engines:** Trino, Flink, Presto, BigQuery.

### 9. G12 — Deletion vectors cross-engine readability and write-side (Priority: 16)
**Gap type:** Engine coverage gap
**Community signal:** 4 / 5. Daft #1954 (blocking read), DuckDB (no write-side DV), Flink (errors on commits with AddFile + RemoveFile), delta-rs partial support.
**Problem:** Deletion vectors are now the default soft-delete mechanism in Databricks Runtime 14+ and are enabled by default for Delta DELETE/UPDATE in delta-rs v1.4.0+. Daft raises `NotImplementedError` when it encounters DV-enabled tables (unless `ignore_deletion_vectors=True`, which returns stale rows). DuckDB reads DV-enabled tables correctly but cannot write them. Flink errors on commits that both add and delete files. The official Delta docs do not have a page explaining which engines can read DV-enabled tables.
**Affected engines:** Daft (read blocked), DuckDB (no write), Flink (errors), delta-rs/DataFusion (partial).

### 10. G09 — Streaming + Delta checkpoint behavior and log management (Priority: 16)
**Gap type:** Documentation gap
**Community signal:** 4 / 5. Delta #779 (6 comments), delta #859, delta #1396; streaming best practices entirely absent from docs.delta.io Best Practices page.
**Problem:** Delta is heavily used as a streaming sink with Spark Structured Streaming. The docs have no guidance on: how Spark Structured Streaming checkpoints interact with Delta log retention; how to prevent Delta log growth causing Spark job failures; how to use `schemaTrackingLocation` for long-running streams with column mapping; or the interaction between `ignoreDeletes`/`ignoreChanges` source options and downstream query correctness. These topics appear repeatedly in GitHub issues and SO.
**Affected engines:** Spark (primary), with downstream effects on delta-rs CDF consumers.

---

## Outreach Opportunities

The following gaps could be meaningfully closed by working with ecosystem maintainers rather than writing Delta Lake documentation in isolation.

### 1. delta-rs maintainers — Column Mapping and MERGE silent failures
**Gaps addressed:** G04, G18
**Opportunity:** Delta-rs #930 (column mapping) and #2407 (MERGE silent multiple-source match) have been open for extended periods with community frustration. Reach out to the delta-rs core team (risinglightdb / wjones127 / roeap) to understand roadmap priority. Both gaps could be partially addressed by adding explicit error messages and documentation callouts even before full implementation. The delta-rs docs could prominently list column mapping as an unsupported feature with a link to the tracking issue.

### 2. Daft maintainers (Eventual-Inc) — Deletion vectors roadmap
**Gaps addressed:** G12
**Opportunity:** Daft #1954 (deletion vectors) is a blocking issue for reading any table authored by Databricks Runtime 14+ or delta-rs 1.4.0+. The Daft roadmap issue (#2457) lists deletion vectors. Outreach to the Daft team to understand the timeline and co-author a migration note or warning in both the Daft docs and the Delta Lake engine integration page would reduce user confusion. Consider a community blog post: "Reading Databricks-authored Delta tables in Daft today."

### 3. DuckDB maintainers — Clarify write path maturity and surface limitations in Delta docs
**Gaps addressed:** G17, G02
**Opportunity:** DuckDB's own docs accurately describe the write path as "blind insert only" and list open issues. The gap is that docs.delta.io's DuckDB integration page is a stub that implies read-only. Coordinate with the DuckDB team to: (a) publish a write-path status update once the partitioned-write bug (#280) is fixed, and (b) add a concurrency warning to the DuckDB page on docs.delta.io noting that DuckDB inserts to S3 have no locking mechanism.

### 4. Trino maintainers — S3 concurrent write safety documentation
**Gaps addressed:** G02, G21
**Opportunity:** Trino's Delta Lake connector supports full DML but concurrent writes to S3 are unsafe without explicit configuration, and there is no collision detection when writing alongside other engines. The Trino docs document this in their connector page, but docs.delta.io's Trino stub page does not. Coordinating with the Trino community to produce a joint "multi-engine write safety" guide would serve users running Trino alongside Spark or delta-rs.

### 5. Apache Flink community — Document DataStream-only limitation and 2.0 roadmap
**Gaps addressed:** G13, G21
**Opportunity:** The Flink Delta connector is in Preview, only supports DataStream API (not Flink Table API/SQL), and is not yet compatible with Flink 2.0 (#5228). The connector's README and delta.io's Flink stub page do not clearly explain these constraints. Outreach to the Flink Delta connector maintainers (delta.io/flink-integration GitHub) to produce: (a) a limitations section in the integration page, (b) a Flink 2.0 compatibility statement, and (c) an explanation of why the connector cannot reflect DELETE operations.

### 6. delta-rs / delta-io documentation team — Engine comparison matrix
**Gaps addressed:** G03, G21
**Opportunity:** The single highest-impact documentation deliverable identified in this analysis is an engine capability matrix on docs.delta.io. This requires coordination across multiple engine teams to verify accuracy. A community-maintained matrix (similar to the Apache Iceberg Engine Support page) would address the most-asked class of questions. Propose this to the delta.io documentation working group with an offer to draft the initial version based on these research reports.

---

*This file was produced by an AI agent.*
