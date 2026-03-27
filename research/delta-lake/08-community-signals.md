# Community Signals Report: Delta Lake Documentation Gaps

**Task:** #150 (Plan #139)
**Date:** 2026-03-27
**Sources:** GitHub (delta-io/delta, delta-io/delta-rs), Stack Overflow, Reddit (indirect via web search), Databricks Community

---

## Summary

Community signals across GitHub, Stack Overflow, and public forums consistently surface five recurring themes: (1) missing how-to guides for non-Spark engines and the Python/Rust API, (2) engine-specific feature gaps — especially between OSS Delta and Databricks-managed Delta, and between Spark and non-Spark engines, (3) outdated or incomplete documentation that lags behind releases, (4) confusing or ambiguous explanations for VACUUM, time travel, schema evolution, and concurrent writes, and (5) underdocumented operational topics such as S3 locking, partition predicates, and identity/generated columns.

The highest-signal pain points by volume of community engagement are: MERGE/upsert complexity, schema evolution behavior differences across engines, S3 concurrent write safety, and the gap between OSS Delta and Databricks Delta feature sets.

Delta Slack (>6,000 members) is not publicly searchable. No public Slack archive was found. This is noted as a research gap.

---

## Themes

### Theme A: Missing How-Tos

**Signal strength: High** — Multiple documentation issues filed in both repos, recurring Stack Overflow patterns, referenced in Databricks blog FAQ.

Representative examples:

| # | Repo | Issue | Comments | Signal |
|---|------|-------|----------|--------|
| 2252 | delta-rs | Document how to use `deletedFileRetentionDuration` | 6 | Direct doc gap request |
| 3345 | delta-rs | Documentation improvement request: Merge table | 1 | Missing merge how-to |
| 3329 | delta-rs | Improve docs and coding environment for tblproperties and features | 3 | Missing tblproperties guide |
| 3191 | delta-rs | User guide: Add standalone page for working with partitions | 0 | Missing partition guide |
| 598 | delta | Doc DeltaOptions as public API or make it a delta private class | 15 | Undocumented options |
| 1497 | delta | How to retrieve the last generated identity value | 4 | No how-to exists |
| 1379 | delta | [Question] How does Z-Order work with single column filter? | 2 | Missing explanation |

Additional patterns from Stack Overflow tag `delta-lake` (not all answers accepted):
- How to use `deletedFileRetentionDuration` (referenced in delta-rs #2252 as triggered by SO questions)
- How to set up DynamoDB locking for S3 writes (delta-rs S3 docs thin on examples)
- How to configure `auto compaction` vs. `optimize write` (confusion documented in delta #4045)
- How to use `foreachBatch` with Delta merge for streaming upserts

Databricks' own 2021 blog post "Top Questions from Customers about Delta Lake" (https://www.databricks.com/blog/2021/03/31/top-questions-from-customers-about-delta-lake.html) documented persistent questions around: when to use partitioning, how time travel interacts with VACUUM, how schema enforcement works vs. schema evolution, and how to handle concurrent writes safely. These same questions continue to appear in GitHub issues 5 years later, indicating the documentation has not definitively resolved them.

---

### Theme B: Engine X Doesn't Support Y

**Signal strength: Very High** — Dozens of open issues across both repos; recurring frustration in community searches.

Representative examples:

| # | Repo | Issue | Comments | Missing Feature |
|---|------|-------|----------|-----------------|
| 1775 | delta | [BUG] Delta chronically behind Databricks | 16 | OSS/Databricks parity |
| 553 | delta | Delta merge doesn't update schema (automatic schema evolution enabled) | 20 | Merge + schema evolution |
| 5228 | delta | [Feature Request][Flink] Add support of Flink 2.0 | 9 | Flink 2.0 not supported |
| 3057 | delta | [BUG][FLINK] Delta log not updated after Flink job checkpoint | 7 | Flink correctness gap |
| 1923 | delta-rs | No support for OR in partition predicates | 14 | Partition predicate limitation |
| 930 | delta-rs | Support column mapping | 14 | Column mapping missing in delta-rs |
| 2043 | delta-rs | Liquid clustering | 11 | Liquid clustering not in delta-rs |
| 4247 | delta-rs | Checkpoint formats incompatible with Databricks Photon engine | 7 | Cross-engine compatibility |
| 3782 | delta-rs | delta-rs fails to read table written by delta-spark 4.0.0 | 6 | delta-rs/delta-spark compat gap |
| 1100 | delta | [Feature Request] SQL syntax for GENERATED columns in OSS | 19 | OSS missing generated columns SQL |

Key finding: The Flink connector is still in Preview status and only supports the DataStream API (not Flink Table API/SQL). It does not reflect DELETE operations, and errors out on commits that both add and delete files (row-level updates/deletes). This is a known but poorly documented limitation. Delta 4.0 explicitly noted that Delta Flink, Delta Standalone, and Delta Hive are "not available yet" in the 4.0 preview.

DuckDB's delta extension (using delta-kernel-rs) supports read and limited write (blind INSERT only). No UPDATE, DELETE, or MERGE support. This is documented in DuckDB docs but not prominently flagged in Delta Lake's own engine comparison pages.

Trino supports read and write but concurrent writes to S3 are not safe without explicit `delta.enable-non-concurrent-writes` and no collision detection for multi-engine environments.

---

### Theme C: Docs Are Outdated

**Signal strength: Medium-High** — Several issues cite documentation inconsistencies vs. behavior; auto-compaction bug is the clearest example.

Representative examples:

| # | Repo | Issue | Comments | Outdated Area |
|---|------|-------|----------|---------------|
| 4045 | delta | [BUG][Spark] Auto Compaction trigger logic is not consistent with documentation | 9 | Auto compaction config |
| 2001 | delta-rs | Documentation error for `write_table` file_options argument | 0 | API reference wrong |
| 2013 | delta-rs | Wind down the old documentation pages | 1 | Stale docs still live |
| 1284 | delta | [PROTOCOL] Checkpoint documentation for writers is ambiguous | 2 | Protocol spec ambiguity |
| 1975 | delta | [Feature Request] Protocol: clarify immutability guarantees | 8 | Protocol spec unclear |
| 6094 | delta | Clarify valid range for add.modificationTime (can it be 0 or negative?) | 4 | Protocol spec gap |

The Medium article "Important Changes Coming to Delta Lake Time Travel (Databricks, December 2025)" highlights that the interaction between VACUUM, time travel, and the 7-day default retention window is a persistent source of confusion — users discover they can still time-travel past the 7-day window after running VACUUM, contradicting their expectations. This confusion stems from documentation that explains the mechanics correctly but does not model expected user mental models.

---

### Theme D: Confusing/Unclear Explanations

**Signal strength: High** — Driven by high comment counts on foundational issues; multiple third-party blog posts exist specifically to clarify topics the official docs leave unclear.

Representative examples:

| # | Repo | Issue | Comments | Confusing Topic |
|---|------|-------|----------|-----------------|
| 524 | delta | Why bucket table is not supported in Delta | 19 | Fundamental capability confusion |
| 553 | delta | Delta merge doesn't update schema (auto evolution enabled) | 20 | Merge + schema evolution interaction |
| 1111 | delta | [Feature Request] Support data type changes for schema evolution | 12 | Type widening confusion |
| 2882 | delta-rs | Non-nullable columns implies invariants but invariants not enabled | 18 | Schema invariant behavior |
| 3339 | delta-rs | Schema merge failed since switch to DataFusion if a field is a list of structs | 7 | Nested struct merge |
| 1830 | delta | [BUG] Concurrent write to _delta_log on AWS S3 results in data loss | 9 | S3 consistency confusion |
| 779 | delta | Delta log getting too big, resulting in Spark job failures | 6 | Log compaction / checkpoint confusion |

The Stack Overflow tag `delta-lake` (https://sm-stackoverflow.azurefd.net/questions/tagged/delta-lake) shows persistent unanswered or poorly answered questions around:
- When and how VACUUM interacts with time travel queries
- How to correctly configure concurrent writes to S3 (DynamoDB locking setup)
- How schema evolution behaves differently in MERGE vs. append writes
- How Z-Order interacts with partition pruning

---

### Theme E: Other (Operational / Ecosystem Gaps)

**Signal strength: Medium** — Operational topics that are either underdocumented or surface confusing behaviors.

Representative examples:

| # | Repo | Issue | Comments | Topic |
|---|------|-------|----------|-------|
| 3852 | delta-rs | Error performing GET `_last_checkpoint` after 10 retries | 23 | Checkpoint recovery |
| 2434 | delta | [BUG][Spark] Exception while using 3-layer-namespace on Spark | 47 | Catalog/namespace integration |
| 1679 | delta | [Design Doc] Catalog implementation for AWS Glue Data Catalog | 15 | Glue catalog setup |
| 3551 | delta-rs | Mapped network drives in Windows no longer work | 13 | Windows/local path support |
| 3790 | delta-rs | Panic `overflow` while running ZOrder optimization | 12 | Z-order on large tables |
| 3645 | delta-rs | Error with concurrent append and `full=True` vacuum | 6 | Vacuum concurrency |
| 3172 | delta-rs | Nested fields count towards limit of stats calculation of first 32 columns | 8 | Stats behavior underdocumented |

---

## Top Requested Journeys

Ranked by frequency signal (GitHub comment count + cross-repo recurrence + SO presence):

1. **MERGE / upsert with schema evolution** — How to perform MERGE operations while safely evolving the schema; what happens when source has new columns (delta #553, #558, #3336; delta-rs #3339, #2355). Highest combined signal.

2. **Setting up concurrent writes safely on S3** — How to configure DynamoDB locking provider with delta-rs; difference between single-cluster and multi-cluster safety guarantees (delta #1830; delta-rs S3 docs; SO recurring pattern).

3. **Time travel + VACUUM retention configuration** — How to set `deletedFileRetentionDuration` and `logRetentionDuration` to match business time-travel requirements; why VACUUM doesn't always remove files you expect (delta-rs #2252; Medium article Dec 2025; Databricks community FAQ).

4. **Z-Order / liquid clustering — when and how to use** — How Z-Order interacts with partitioning and single-column filters; when to prefer liquid clustering (delta #1379, #1311; delta-rs #3790, #3906).

5. **Column mapping (rename/drop columns) in non-Spark engines** — How column mapping works; what engines support it; migration path from physical name mode to name mode (delta-rs #930; delta #3154).

6. **Generated columns in OSS Spark SQL** — SQL DDL syntax for generated columns; which features are OSS vs. Databricks-only (delta #1100, #2580, #1497).

7. **Schema enforcement vs. schema evolution — mental model** — When schema enforcement rejects writes; how to enable and scope schema evolution; how it interacts with type widening (delta #1111; delta-rs #2464, #3688).

8. **Delta 4.0 compatibility with delta-rs / non-Spark clients** — Which features in Delta 4.0 (v3 features, managed commits) are readable by delta-rs and other engines (delta-rs #3782, #4247; delta #5898).

9. **Streaming + Delta — checkpoint behavior and log management** — How Spark Structured Streaming checkpoints interact with Delta log retention; how to prevent Delta log growth causing Spark job failures (delta #779, #859, #1396).

10. **Catalog integration (Glue, Unity Catalog, Hive Metastore)** — How to configure Delta tables to register with external catalogs; 3-layer namespace support (delta #2434, #1679, #1045).

---

## Engine-Specific Complaints

### Apache Spark (delta-io/delta)
- **OSS vs. Databricks parity**: Issue #1775 "[BUG] Delta chronically behind Databricks" (16 comments) explicitly documents community frustration that features like generated columns (SQL DDL), identity columns, liquid clustering, and certain table properties are Databricks-only or lag significantly behind.
- **Spark Connect (preview only)**: Delta Connect is preview-only in Delta 4.0+; not all Delta operations work over the Spark Connect wire protocol.
- **Auto compaction config inconsistency**: Delta #4045 documents that auto compaction trigger logic does not match official documentation.
- **Merge behavior**: Merge with `mergeSchema=true` has edge cases with type widening and new columns from source that are not clearly documented (delta #553, #558, #3336).
- **Subqueries in DELETE**: Not supported in DELETE WHERE predicate (delta #730, 14 comments).

### Apache Flink (delta-io/delta)
- Connector is in **Preview** status; only DataStream API is supported — no Flink Table API / SQL.
- Does not reflect DELETE operations; errors on commits containing both AddFile and RemoveFile entries (row-level updates/deletes). This makes it unsuitable for CDC pipelines without workarounds.
- Flink 2.0 support requested (delta #5228, 9 comments) but not yet available.
- Delta 4.0 explicitly noted Delta Flink is "not available yet."

### Rust / Python (delta-rs)
- **Column mapping**: Not supported (delta-rs #930, 14 comments); blocks rename/drop column workflows entirely for non-Spark users.
- **Liquid clustering**: Not available (delta-rs #2043, 11 comments).
- **OR in partition predicates**: No support for OR conditions in partition filters (delta-rs #1923, 14 comments), forcing full scans in certain query patterns.
- **Schema merge for nested structs**: Broken when merging schemas containing lists of structs (delta-rs #3339, 7 comments).
- **MERGE behavior**: MERGE does not raise an error when multiple source rows match a single target row (delta-rs #2407, 11 comments) — silent incorrect behavior that Spark raises as an error.
- **Checkpoint format compatibility with Databricks Photon**: delta-rs checkpoint output is incompatible with Photon engine in some configurations (delta-rs #4247, 7 comments).
- **delta-rs fails to read Delta Spark 4.0 tables**: Compatibility gap between delta-rs and tables written by delta-spark 4.0 (delta-rs #3782, 6 comments).
- **`get_add_actions` returns no records**: Confusing API behavior with no clear documentation of cause (delta-rs #2507, 11 comments, marked "good first issue").

### DuckDB (duckdb/duckdb-delta)
- Read-only in practical terms; write support is blind INSERT only (`delta_scan` function).
- No UPDATE, DELETE, or MERGE support.
- Unity Catalog integration issues reported (open for ~6 months as of research date).
- These limitations are documented in DuckDB's own docs but not clearly surfaced in Delta Lake's engine comparison pages.

### Trino
- Write support requires explicit `delta.enable-non-concurrent-writes` flag for S3; no collision detection when writing alongside other engines — data corruption risk that is technically documented but easy to miss.
- Time travel support was added later (Trino blog, April 2024) and not uniformly covered in Delta Lake's own Trino integration docs.
- Data type mapping differences between Trino and Delta Lake cause silent lossy conversions in both directions.

### DataFusion / Python (delta-rs post-DataFusion migration)
- Schema merge regressions introduced in the DataFusion migration (delta-rs #3339).
- Memory leak reported (delta-rs #4241, 2 comments, labeled CRITICAL).

---

## Source Links

### GitHub — delta-io/delta (selected high-signal issues)
- https://github.com/delta-io/delta/issues/1775 — Delta chronically behind Databricks (16 comments)
- https://github.com/delta-io/delta/issues/553 — Merge doesn't update schema (20 comments)
- https://github.com/delta-io/delta/issues/524 — Why bucket table is not supported (19 comments)
- https://github.com/delta-io/delta/issues/1100 — SQL syntax for GENERATED columns in OSS (19 comments)
- https://github.com/delta-io/delta/issues/1307 — Roadmap 2022 H2 discussion (32 comments)
- https://github.com/delta-io/delta/issues/598 — Doc DeltaOptions as public API (15 comments)
- https://github.com/delta-io/delta/issues/1679 — Catalog implementation for AWS Glue (15 comments)
- https://github.com/delta-io/delta/issues/1111 — Support data type changes for schema evolution (12 comments)
- https://github.com/delta-io/delta/issues/4045 — Auto Compaction logic inconsistent with docs (9 comments)
- https://github.com/delta-io/delta/issues/1830 — Concurrent write to S3 results in data loss (9 comments)
- https://github.com/delta-io/delta/issues/5228 — Flink 2.0 support request (9 comments)
- https://github.com/delta-io/delta/issues/730 — Subqueries not supported in DELETE predicate (14 comments)
- https://github.com/delta-io/delta/issues/2434 — Exception with 3-layer-namespace on Spark (47 comments)
- https://github.com/delta-io/delta/issues/779 — Delta log getting too big (6 comments)
- https://github.com/delta-io/delta/issues/1497 — How to retrieve last generated identity value (4 comments)

### GitHub — delta-io/delta-rs (selected high-signal issues)
- https://github.com/delta-io/delta-rs/issues/3852 — Error performing GET `_last_checkpoint` (23 comments)
- https://github.com/delta-io/delta-rs/issues/2882 — Non-nullable columns + invariants behavior (18 comments)
- https://github.com/delta-io/delta-rs/issues/3300 — Parquet Modular Encryption (15 comments)
- https://github.com/delta-io/delta-rs/issues/1923 — No support for OR in partition predicates (14 comments)
- https://github.com/delta-io/delta-rs/issues/930 — Support column mapping (14 comments)
- https://github.com/delta-io/delta-rs/issues/1909 — Expose table alterations under `alter` namespace (13 comments)
- https://github.com/delta-io/delta-rs/issues/3790 — Panic overflow while running ZOrder (12 comments)
- https://github.com/delta-io/delta-rs/issues/2043 — Liquid clustering (11 comments)
- https://github.com/delta-io/delta-rs/issues/2507 — get_add_actions returns no records (11 comments)
- https://github.com/delta-io/delta-rs/issues/2407 — MERGE should raise on multiple source matches (11 comments)
- https://github.com/delta-io/delta-rs/issues/3339 — Schema merge failed for list of structs (7 comments)
- https://github.com/delta-io/delta-rs/issues/4247 — Checkpoint formats incompatible with Photon (7 comments)
- https://github.com/delta-io/delta-rs/issues/3782 — delta-rs fails to read delta-spark 4.0 tables (6 comments)
- https://github.com/delta-io/delta-rs/issues/2252 — Document how to use deletedFileRetentionDuration (6 comments)
- https://github.com/delta-io/delta-rs/issues/3329 — Improve docs for tblproperties and features (3 comments)
- https://github.com/delta-io/delta-rs/issues/3191 — User guide: standalone page for partitions (0 comments)

### Stack Overflow
- Tag: https://stackoverflow.com/questions/tagged/delta-lake
- Tag: https://stackoverflow.com/questions/tagged/delta-rs
- Persistent unanswered/poorly-answered patterns: time travel + VACUUM interaction, S3 locking setup, streaming merge with foreachBatch, schema evolution in MERGE

### Official Documentation and Blog Posts
- https://www.databricks.com/blog/2021/03/31/top-questions-from-customers-about-delta-lake.html — Top customer questions (2021, still relevant)
- https://delta.io/blog/2025-09-25-delta-lake-40/ — Delta 4.0 known gaps (Flink, Hive, Standalone, Uniform)
- https://medium.com/@cralle/important-changes-coming-to-delta-lake-time-travel-databricks-december-2025-644b6fd03d9e — Time travel/VACUUM changes Dec 2025
- https://rmoff.net/2024/08/27/adventures-with-apache-flink-and-delta-lake/ — Flink/Delta practical limitations documented
- https://duckdb.org/docs/stable/core_extensions/delta — DuckDB delta extension (read-only limitations)
- https://trino.io/docs/current/connector/delta-lake.html — Trino Delta connector (S3 write limitations)
- https://www.buoyantdata.com/blog/2023-11-27-concurrency-limitations-with-deltalake-on-aws.html — S3 concurrency limitations
- https://delta-io.github.io/delta-rs/usage/writing/writing-to-s3-with-locking-provider/ — S3 locking provider setup (delta-rs)

### Research Gap
- **Delta Lake Slack** (delta-users, >6,000 members): Not publicly searchable. No public Slack archive found. Community discussions on Slack likely contain additional signal on documentation gaps, but this source is inaccessible to automated research. Recommend manual outreach or monitoring of #help and #questions channels if access is available.
