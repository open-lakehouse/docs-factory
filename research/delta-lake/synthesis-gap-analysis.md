# Delta Lake Documentation Gap Analysis — Community-Grounded Synthesis

**Task:** #173 (Plan #161) — updated from #153 (Plan #139)
**Date:** 2026-03-27
**Source reports:** 01-delta-official-docs, 02-delta-rs-docs, 03-engine-duckdb, 04-engine-polars, 05-engine-daft, 06-engine-datafusion, 07-engine-spark, 08-community-signals, 09-ecosystem-landscape, 10-engine-trino, 11-engine-prestodb, 12-engine-flink, 13-engine-clickhouse, 14-uniform-interop, protocol-feature-matrix

---

## Summary

Cross-referencing the fourteen Wave 1 and Wave 2 research reports against community signal themes yields **27 distinct documentation gaps** (up from 23). The highest-priority gaps continue to cluster around two axes: **write-path feature parity** (MERGE/upsert and schema evolution behave differently or are absent across engines, with no single comparison page explaining this) and **safety-critical operational journeys** (S3 concurrent write safety, VACUUM retention semantics, protocol version ceiling failures) where documentation is technically present but insufficient to prevent user error.

The addition of four new engine reports (Trino, PrestoDB, Flink, ClickHouse) and the UniForm interoperability report materially changed several priority scores. The engine feature comparison matrix (G03) now spans **11 documented engines** instead of 7, raising its priority score from 28 to 44 and reinforcing it as the single highest-impact documentation gap. PrestoDB's silent deletion-vector correctness failure (returning logically-deleted rows) is a newly documented risk at production scale.

Three gap types are represented:

- **Documentation gaps (A)**: The feature exists and is implemented, but there is no how-to guide, the guide is thin or misleading, or the feature is undocumented in the engine's own docs.
- **Engine coverage gaps (B)**: The feature does not exist in one or more engines used by the community; the gap itself is undocumented or understated in Delta Lake's own integration pages.
- **Content clarity gaps (C)**: Documentation exists but community signals (comment volume, recurrence, third-party blog posts correcting the official content) indicate the explanation is insufficient to build a correct mental model.

Priority score = community signal strength (1–5) × number of engines affected (out of 11 scored engines: Spark, delta-rs/DataFusion, DuckDB, Polars, Daft, Flink, Trino, PrestoDB, ClickHouse, Athena, BigQuery).

---

## Gap Inventory

| # | Journey | Gap Type | Affected Engines | Community Signal Strength (1–5) | Priority Score |
|---|---------|----------|-----------------|--------------------------------|----------------|
| G01 | MERGE / upsert with schema evolution | A + C | Spark, delta-rs/DataFusion, Polars, Daft | 5 | 20 |
| G02 | Concurrent writes safely on S3 | A + C | Spark (experimental), delta-rs, Trino, DuckDB (no DML), ClickHouse (experimental, no locking) (updated) | 5 | 25 (updated) |
| G03 | Engine feature comparison — what each engine can and cannot do | A | All 11 (updated) | 4 | 44 (updated) |
| G04 | Column mapping (rename/drop columns) in non-Spark engines | B | delta-rs, Polars, Daft, DuckDB, Flink, ClickHouse (id mode) (updated) | 4 | 24 (updated) |
| G05 | Time travel + VACUUM retention configuration | C | Spark, delta-rs, Polars, Daft, DuckDB | 4 | 20 |
| G06 | Liquid clustering — when to use vs. Z-Order, engine support | A + B | Spark (documented); delta-rs, Polars, Daft, DuckDB, Trino (write only), Flink, ClickHouse, PrestoDB (absent) (updated) | 4 | 32 (updated) |
| G07 | Delta 4.0 / delta-spark 4.x compatibility with delta-rs and non-Spark clients | B | delta-rs, DuckDB, Polars, Daft, Flink (maintenance mode) (updated) | 4 | 20 (updated) |
| G08 | Z-Order / optimization for large tables — correctness and limits | C | delta-rs, Polars, Daft | 3 | 9 |
| G09 | Streaming + Delta — checkpoint behavior and log management | A | Spark (thin best practices); all others (absent) | 4 | 16 |
| G10 | Generated columns and identity columns in OSS Spark SQL | A + B | Spark (SQL DDL gap vs. Databricks), all non-Spark engines | 4 | 16 |
| G11 | Schema enforcement vs. schema evolution mental model | C | Spark, delta-rs, Polars | 4 | 12 |
| G12 | Deletion vectors — cross-engine readability and write side | B | Daft (read blocked), DuckDB (no write), Flink (errors), delta-rs (partial), PrestoDB (silent correctness failure) (updated) | 4 | 20 (updated) |
| G13 | Flink connector status and known limitations | A + B | Flink | 4 (updated) | 4 (updated) |
| G14 | Catalog integration (Glue, Unity Catalog, Hive Metastore) | A | Spark, delta-rs, Daft | 4 | 12 |
| G15 | Change Data Feed — enablement, retroactive add, cross-engine support | A + B | Spark (documented), delta-rs/DataFusion (CDF write absent), Polars (undocumented), DuckDB (absent), Daft (absent) | 3 | 15 |
| G16 | OR predicates / partition predicate limitations in non-Spark engines | B | delta-rs, DuckDB | 3 | 6 |
| G17 | DuckDB write path maturity and limitations | A | DuckDB | 3 | 3 |
| G18 | MERGE silent incorrect behavior (multiple source rows matching one target) | A + C | delta-rs, DataFusion | 4 | 8 |
| G19 | OSS vs. Databricks feature parity — what is OSS, what is Databricks-only | A + C | Spark (primary), all non-Spark | 5 | 15 |
| G20 | delta-rs UPDATE operation — no dedicated usage guide | A | delta-rs, Polars | 3 | 6 |
| G21 | Non-Spark connector stubs on docs.delta.io (Trino, Flink, Presto, BigQuery, ClickHouse) | A | Trino, Flink, Presto, BigQuery, ClickHouse (updated) | 4 | 20 (updated) |
| G22 | Streaming best practices (schema tracking, checkpoint management) | A | Spark | 4 | 4 |
| G23 | UniForm write-safety — external Iceberg writes cause silent data loss | C | Spark (UniForm), Iceberg readers | 3 | 6 |
| G24 | PrestoDB read-only — no write path stub or capability summary in Delta docs | A | PrestoDB | 4 | 4 |
| G25 | ClickHouse experimental write caveats — absent from Delta official docs | A + C | ClickHouse | 4 | 4 |
| G26 | Protocol version ceiling — engines failing silently on tables with advanced writer features | A + C | PrestoDB, DuckDB, Flink, Polars, Daft, ClickHouse | 5 | 30 |
| G27 | UniForm compatibility — no Delta official doc covers which engines break when UniForm is enabled | A + B | DuckDB, delta-rs, Polars, Daft, DataFusion, Flink, PrestoDB, ClickHouse | 5 | 40 |

---

## Top 10 Gaps by Priority

Ranked by priority score (community signal strength × engines affected). Ties broken by community signal strength.

### 1. G03 — Engine feature comparison matrix (Priority: 44) (updated)
**Gap type:** Documentation gap
**Community signal:** 4 / 5. Issue delta-io/delta #1775 (16 comments) explicitly names the lack of a cross-engine feature matrix. Dozens of community questions reduce to "does engine X support feature Y?" with no canonical answer page.
**Problem:** docs.delta.io has no single page comparing what Spark, Trino, PrestoDB, Flink, DuckDB, ClickHouse, delta-rs, Polars, and Daft can and cannot do. Connector pages are stubs (one sentence redirecting to vendor docs). Users cannot answer basic questions like "can Daft MERGE?" or "does DuckDB support deletion vectors on write?" or "does PrestoDB silently return deleted rows?" without reading multiple external sources. The Wave 2 engine reports (Trino, PrestoDB, Flink, ClickHouse) raise the engine count from 7 to 11, increasing both the scope of the gap and its priority score.
**Affected engines:** All 11.
**Fix:** Publish an engine capability matrix table (operations × engines) as a first-class page on docs.delta.io, updated with each Delta release.

### 2. G27 — UniForm compatibility — which engines break when UniForm is enabled (Priority: 40)
**Gap type:** Documentation gap + engine coverage gap
**Community signal:** 5 / 5. DuckDB issue #289 (open, write-blocking), delta-rs issue #3299 (cannot set UniForm properties), Databricks docs acknowledge the DV/UniForm incompatibility but docs.delta.io does not. No central resource on the Delta site explains what breaks across the ecosystem when UniForm is enabled.
**Problem:** UniForm's protocol requirements (writer v7, `icebergCompatV2`, `icebergWriterCompatV1` for Unity Catalog-managed tables, column mapping required) interact with eight non-Spark engines in undocumented ways. DuckDB writes fail silently with an opaque `Unknown feature 'icebergWriterCompatV1'` error. delta-rs and all engines depending on it (Polars, Daft, DataFusion) cannot enable UniForm at all. Flink and PrestoDB have no documented UniForm read/write paths. ClickHouse's Iceberg engine could theoretically consume UniForm-generated metadata but this is untested and undocumented. The UniForm docs page on docs.delta.io focuses entirely on Spark enablement; it does not contain a single sentence about what happens to non-Spark readers or writers when UniForm is active.
**Affected engines:** DuckDB, delta-rs, Polars, Daft, DataFusion, Flink, PrestoDB, ClickHouse (8 of 11).
**Fix:** Add an "Engine Compatibility" section to the Delta UniForm docs page listing read/write status per engine, with explicit callouts for DuckDB write failure and the DV/UniForm mutual exclusion.

### 3. G06 — Liquid clustering availability in non-Spark engines (Priority: 32) (updated)
**Gap type:** Documentation gap + engine coverage gap
**Community signal:** 4 / 5. Delta-rs #2043 (11 comments), delta #1379 (Z-Order/clustering confusion), delta-rs #3906, Trino issue #22811 (write not supported).
**Problem:** Liquid clustering is the recommended replacement for Z-Order for new tables in Spark (GA from Delta 3.2). However, it is absent from delta-rs, Polars, Daft, and DuckDB. Trino can read liquid-clustered tables (PR #22330 merged) but cannot write or create them (issue #22811 open). Flink, PrestoDB, and ClickHouse have no liquid clustering support at all. The official Delta docs recommend Liquid Clustering without noting that the majority of non-Spark engines cannot create or recluster tables with it. Users who follow Spark best practices cannot then maintain those tables from Python/Rust without dropping back to Spark.
**Affected engines:** delta-rs, Polars, Daft, DuckDB (absent); Trino (read-only); Flink, PrestoDB, ClickHouse (absent); Spark (documented).

### 4. G26 — Protocol version ceiling — engines failing silently on tables with advanced writer features (Priority: 30)
**Gap type:** Documentation gap + content clarity gap
**Community signal:** 5 / 5. PrestoDB issue documented in research (silent correctness failure for deletion vectors, no error). DuckDB issue #289 (write fails, opaque error). Flink issue #2874 (InvalidProtocolVersionException, hard crash). Polars `DeltaProtocolError` for v3 reader features outside the allowlist. Multiple Stack Overflow threads report "my query is returning deleted rows" or "my engine throws a protocol version error" with no guidance from Delta docs.
**Problem:** As Delta tables accumulate writer features (deletion vectors, column mapping, v2Checkpoint, UniForm, inCommitTimestamp), non-Spark engines hit their protocol ceiling in distinct and poorly-documented failure modes: hard errors (Flink, DuckDB), silent correctness failures (PrestoDB returns logically-deleted rows, Daft with `ignore_deletion_vectors=True`), or opaque exceptions with no remediation path. The Delta protocol spec documents the version requirements correctly but docs.delta.io has no page translating these version requirements into engine-specific operational guidance: "if you enabled X on your table, engines Y and Z will behave as follows." The failure mode is particularly insidious for PrestoDB, which returns incorrect data without any error signal.
**Affected engines:** PrestoDB, DuckDB, Flink, Polars, Daft, ClickHouse (6 of 11).
**Fix:** Add a "Protocol compatibility matrix" page to docs.delta.io documenting which advanced table features cause which engines to fail or return incorrect results, with recommended mitigations.

### 5. G01 — MERGE / upsert with schema evolution (Priority: 20)
**Gap type:** Documentation gap + content clarity gap
**Community signal:** 5 / 5. Delta #553 (20 comments), delta-rs #3339 (7 comments), delta-rs #2355, community theme A/B/D recurrence. Databricks' own 2021 FAQ still cited 5 years later.
**Problem:** The official docs document MERGE and schema evolution on separate pages without explaining how they interact. Edge cases — new columns from source, type widening, list-of-structs schemas — are not worked through with examples. delta-rs has a known bug for list-of-struct schema merge (issue #3339, unfixed as of March 2026). Daft does not support `schema_mode="merge"` at all. Polars and DuckDB have no MERGE. The documentation gives no guidance on which engine to choose for upsert + schema evolution workflows.
**Affected engines:** Spark, delta-rs/DataFusion, Polars, Daft (4 of 11).

### 6. G02 — Concurrent writes safely on S3 (Priority: 25) (updated)
**Gap type:** Documentation gap + content clarity gap
**Community signal:** 5 / 5. Delta #1830 (9 comments, "data loss"), delta-rs S3 locking docs referenced as thin, SO recurring, buoyantdata.com blog post on S3 concurrency limitations.
**Problem:** The S3 multi-cluster write path (DynamoDB locking) is marked experimental since Delta 1.x with no graduation timeline. Delta-rs provides a setup guide but delta.io's own docs don't. Trino's concurrent write safety requires `delta.enable-non-concurrent-writes` with no collision detection in multi-engine environments. DuckDB writes to S3 are append-only with no locking. ClickHouse's experimental write path (v25.8+) performs blind inserts with no locking mechanism and no mention in Delta's official docs. No single page explains the safe concurrency story for each engine combination.
**Affected engines:** Spark (experimental), delta-rs, Trino, DuckDB, ClickHouse (5 of 11).

### 7. G05 — Time travel + VACUUM retention configuration (Priority: 20)
**Gap type:** Content clarity gap
**Community signal:** 4 / 5. Delta-rs #2252 (6 comments), Medium article Dec 2025, Databricks 2021 FAQ, SO persistent unanswered questions.
**Problem:** Users run VACUUM and then expect files older than the 7-day default to be removed, but time-travel still works past the retention window in some configurations. The docs explain the mechanics correctly but do not model the mental model mismatch. `deletedFileRetentionDuration` vs. `logRetentionDuration` are listed in table properties but not demonstrated in a worked example that shows the interaction.
**Affected engines:** Spark, delta-rs, Polars, Daft, DuckDB (5 of 11).

### 8. G07 — Delta 4.0 / delta-spark 4.x compatibility with delta-rs and non-Spark clients (Priority: 20) (updated)
**Gap type:** Engine coverage gap
**Community signal:** 4 / 5. Delta-rs #3782 (6 comments), delta-rs #4247 (7 comments), delta blog explicitly noting "Flink, Hive, Standalone, Uniform not available yet" in 4.0 preview.
**Problem:** Delta 4.0 introduced protocol features (V3 features, managed commits, in-commit timestamps) that delta-rs cannot yet read in all configurations. Delta-rs also produces checkpoint formats that are incompatible with Databricks Photon in some configurations (delta-rs #4247). DuckDB raises a read error on V2Checkpoint tables (#182). The Flink Standalone connector has been officially sunsetted as of Delta 4.0 and will not ship as part of the 4.x release series — users of the Flink connector are stranded on 3.x. The Delta 4.1.0 blog notes compatibility concerns but there is no cross-compatibility matrix in the official docs.
**Affected engines:** delta-rs, DuckDB, Polars, Daft, Flink (5 of 11).

### 9. G12 — Deletion vectors cross-engine readability and write-side (Priority: 20) (updated)
**Gap type:** Engine coverage gap
**Community signal:** 4 / 5. Daft #1954 (blocking read), DuckDB (no write-side DV), Flink #2874 (hard crash), delta-rs partial support, PrestoDB (silent correctness failure — deleted rows returned).
**Problem:** Deletion vectors are now the default soft-delete mechanism in Databricks Runtime 14+ and are enabled by default for Delta DELETE/UPDATE in delta-rs v1.4.0+. Daft raises `NotImplementedError` when it encounters DV-enabled tables (unless `ignore_deletion_vectors=True`, which returns stale rows). DuckDB reads DV-enabled tables correctly but cannot write them. Flink errors on commits that both add and delete files. PrestoDB does not call `Scan.transformPhysicalData()` and returns logically-deleted rows with no error or warning — a silent correctness failure at production scale. ClickHouse's deletion vector read support is unconfirmed in documentation despite delta-kernel-rs upstream support. The official Delta docs do not have a page explaining which engines can read DV-enabled tables and what the failure modes are.
**Affected engines:** Daft (read blocked), DuckDB (no write), Flink (hard crash), delta-rs/DataFusion (partial), PrestoDB (silent correctness failure).

### 10. G21 — Non-Spark connector stubs on docs.delta.io (Priority: 20) (updated)
**Gap type:** Documentation gap
**Community signal:** 4 / 5. Direct evidence in connector pages: Trino (one paragraph), Flink (one sentence + GitHub link), Presto (two sentences, 2021 reference), BigQuery (one sentence). ClickHouse has no integration page at all on docs.delta.io despite being a production Delta Lake consumer.
**Problem:** These pages are navigation dead-ends. They do not tell users which Delta operations are supported, which versions are compatible, or what the known limitations are. A user arriving from docs.delta.io cannot learn that Trino supports full DML, that Flink only supports DataStream API and not Table SQL, that Flink is now in maintenance mode, that PrestoDB is read-only, or that ClickHouse's write path is experimental with no locking. The addition of PrestoDB and ClickHouse to the Wave 2 research confirms this gap is wider than originally documented.
**Affected engines:** Trino, Flink, Presto, BigQuery, ClickHouse (5 engines).

---

## New Gaps (added in this revision)

### G24 — PrestoDB read-only: no write path documentation stub in Delta official docs (Priority: 4)
**Gap type:** Documentation gap
**Community signal:** 4 / 5. PrestoDB's official docs at prestodb.io clearly document the connector as read-only, but docs.delta.io's Presto page (two sentences, dated 2021) does not state this at all. Users arriving at the Delta site have no indication that Presto cannot write, VACUUM, OPTIMIZE, or perform any DML.
**Problem:** The PrestoDB Delta connector (`presto-delta`) is a production read-only connector used at Meta/Facebook scale. It is built on Delta Kernel Java 3.3.2. It supports time travel (version and timestamp), schema evolution (read-side), and predicate pushdown. It has zero write capability — no INSERT, UPDATE, DELETE, MERGE, VACUUM, or OPTIMIZE. More critically, it does not call `Scan.transformPhysicalData()`, meaning deletion-vector-enabled tables return logically deleted rows with no error. None of this is documented on docs.delta.io. The existing two-sentence Presto stub predates the Delta Kernel-based connector rewrite entirely.
**Affected engines:** PrestoDB (1 of 11).
**Fix:** Rewrite the Presto integration page on docs.delta.io to document: (a) read-only status, (b) operations supported (SELECT, time travel, predicate pushdown), (c) deletion vector correctness risk, (d) link to Delta Kernel User Guide.

### G25 — ClickHouse experimental write caveats: absent from Delta official docs (Priority: 4)
**Gap type:** Documentation gap + content clarity gap
**Community signal:** 4 / 5. ClickHouse's own changelog and PR descriptions (#86180, #85564) clearly label the write path as experimental, require an opt-in flag (`allow_experimental_delta_lake_writes = 1`), and note Azure is unsupported. A known issue (#87676) causes `delta_lake_snapshot_version` to persist across sessions, causing stale reads. None of these caveats appear anywhere on docs.delta.io.
**Problem:** ClickHouse is a production-scale analytics engine with Delta Lake integration backed by delta-kernel-rs. Its write support (INSERT/append on S3/GCS, experimental flag required) is active in v25.8+ and has real users. But docs.delta.io has no ClickHouse integration page at all. Users who encounter ClickHouse + Delta Lake have no Delta-official resource explaining: which ClickHouse versions support Delta reads, what the experimental write flag does and when it might break, that Azure writes are not yet supported, that Unity Catalog write-back is not supported, or that the session-scope snapshot version setting has a leak bug. The absence of a ClickHouse page on docs.delta.io creates an information vacuum filled by blog posts and ClickHouse-internal docs alone.
**Affected engines:** ClickHouse (1 of 11).
**Fix:** Add a ClickHouse integration page to docs.delta.io documenting: (a) read path (delta-kernel-rs, v25.5+), (b) experimental write path and its constraints, (c) Azure write limitation, (d) Unity Catalog write-back gap, (e) known session-scope bug.

### G26 — Protocol version ceiling: engines failing silently on tables with advanced writer features (Priority: 30)
*(Described in full in Top 10 section above.)*

### G27 — UniForm compatibility: no Delta official doc covers which engines break when UniForm is enabled (Priority: 40)
*(Described in full in Top 10 section above.)*

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
**Gaps addressed:** G17, G02, G27
**Opportunity:** DuckDB's own docs accurately describe the write path as "blind insert only" and list open issues. The gap is that docs.delta.io's DuckDB integration page is a stub that implies read-only. Coordinate with the DuckDB team to: (a) publish a write-path status update once the partitioned-write bug (#280) is fixed, (b) add a concurrency warning to the DuckDB page on docs.delta.io noting that DuckDB inserts to S3 have no locking mechanism, and (c) document the `icebergWriterCompatV1` write-block that affects all DuckDB users pointing at Unity Catalog-managed Delta tables with UniForm enabled.

### 4. Trino maintainers — S3 concurrent write safety documentation
**Gaps addressed:** G02, G21
**Opportunity:** Trino's Delta Lake connector supports full DML but concurrent writes to S3 are unsafe without explicit configuration, and there is no collision detection when writing alongside other engines. The Trino docs document this in their connector page, but docs.delta.io's Trino stub page does not. Coordinating with the Trino community to produce a joint "multi-engine write safety" guide would serve users running Trino alongside Spark or delta-rs.

### 5. Apache Flink community — Document DataStream-only limitation, maintenance mode, and 2.0 roadmap
**Gaps addressed:** G13, G21
**Opportunity:** The Flink Delta connector is now formally in maintenance mode as of Delta 4.0.0 (June 2025), only supports DataStream API (not Flink Table API/SQL), and is not yet compatible with Flink 2.0 (#4793, #4586). The connector's README and delta.io's Flink stub page do not clearly explain these constraints, and critically do not communicate the sunset. Outreach to the Flink Delta connector maintainers (delta.io/flink-integration GitHub) to produce: (a) a maintenance-mode notice and sunset timeline in the integration page, (b) a Flink 2.0 compatibility statement, (c) an explanation of why the connector cannot reflect DELETE operations.

### 6. PrestoDB maintainers (Meta) — Document the Delta connector capability and deletion vector correctness risk
**Gaps addressed:** G24, G12, G26
**Opportunity:** PrestoDB's Delta connector is a production-scale, Meta-contributed integration used at significant scale. The connector is read-only and has a confirmed silent correctness failure for deletion-vector-enabled tables (deleted rows are returned). The PrestoDB docs are accurate but docs.delta.io's Presto page is a 2021 stub. Coordinate with Meta's PrestoDB team to: (a) update the docs.delta.io Presto page with current capability description, (b) add a deletion vector correctness warning, (c) document the Delta Kernel version pin (3.3.2) and what protocol features that enables/blocks.

### 7. ClickHouse team — Co-author integration page and experimental write caveat documentation
**Gaps addressed:** G25, G02, G21
**Opportunity:** ClickHouse has invested significantly in Delta Lake read support (delta-kernel-rs as default, v25.5+) and is actively developing experimental write support. Despite this, docs.delta.io has no ClickHouse page. The ClickHouse team publishes detailed blog posts and changelogs; a joint documentation effort to produce an integration page on docs.delta.io would be low-friction and high-impact. Key topics: read path maturity, experimental write path and constraints, Azure write gap, Unity Catalog write-back gap, and the session-scope snapshot version bug.

### 8. delta-rs / delta-io documentation team — Engine comparison matrix
**Gaps addressed:** G03, G21, G26, G27
**Opportunity:** The single highest-impact documentation deliverable identified in this analysis is an engine capability matrix on docs.delta.io. With eleven engines now researched, the matrix is well-specified. This requires coordination across multiple engine teams to verify accuracy. A community-maintained matrix (similar to the Apache Iceberg Engine Support page) would address the most-asked class of questions and serve as the canonical cross-reference for G26 (protocol version ceiling) and G27 (UniForm compatibility). Propose this to the delta.io documentation working group with an offer to draft the initial version based on these research reports.

---

*This file was produced by an AI agent.*
