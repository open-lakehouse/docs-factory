# Delta Lake Coverage Matrix — Synthesis Report

**Task:** #152 (Plan #139)
**Date:** 2026-03-27
**Sources:** Wave 1 reports 01–09 in `research/delta-coverage/`

---

## Summary

This matrix consolidates coverage findings from nine Wave 1 research reports into a single per-journey × per-engine view. Engines assessed: **Apache Spark**, **delta-rs** (Rust/Python), **DuckDB**, **Polars**, **Daft**, **DataFusion** (as the delta-rs execution engine), **Trino**, and **Apache Flink**.

Key findings:

- **Apache Spark** is the only engine with complete coverage across all operation categories. Every DML operation, optimization, streaming feature, schema management operation, and protocol-management capability originates in Spark.
- **delta-rs / DataFusion** provides the deepest non-Spark coverage, supporting full read/write/DML (merge, delete, update), VACUUM, OPTIMIZE, CDF reads, and time travel. Critical gaps: no streaming, no Liquid Clustering, no Column Mapping, no CLONE/RESTORE, and CDF write is not implemented.
- **Polars** and **Daft** are read/write engines that delegate all DML and maintenance to delta-rs. Neither surfaces DELETE, UPDATE, VACUUM, OPTIMIZE, or CDF through their own APIs — users must drop down to `DeltaTable` directly. Daft additionally cannot read tables with deletion vectors or column mapping without workarounds.
- **DuckDB** is effectively read-only in production. Blind INSERT via `ATTACH` is available but carries active bugs (partitioned table writes, no write statistics before March 2026). No UPDATE, DELETE, MERGE, OPTIMIZE, or VACUUM.
- **Trino** is documented in the ecosystem scan (report 09) as supporting full read/write + DML, but has no dedicated Wave 1 deep-dive report. Per-cell status below is drawn from the ecosystem scan and community signals reports; cells marked ⚠️ reflect known caveats from those reports.
- **Apache Flink** has a preview-status streaming write connector. Read support is limited; the connector does not handle commits that mix add and remove actions, making it unsuitable for tables with row-level DML. Flink 2.0 support is not yet available.
- **Streaming** is entirely Spark Structured Streaming. No other engine implements a native Delta streaming source or sink.
- **Optimization operations** (OPTIMIZE, Z-Order, Liquid Clustering, Auto Compaction) require a write-capable engine. Spark is the only engine with full coverage; delta-rs supports OPTIMIZE bin-packing and Z-Order but not Liquid Clustering or Auto Compaction.

**Legend:**
- ✅ Supported and documented
- ⚠️ Supported but undocumented, unstable, or requires manual delta-rs call (not exposed via engine's own API)
- ❌ Not supported
- — Not applicable

---

## Coverage Matrix

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

## Notes on Data Quality

### Source reliability
All per-engine cells in the Fundamentals, Table Operations, and Change Data / Streaming sections are drawn from dedicated Wave 1 per-engine reports (01–07), which are authoritative for the engines they cover. The **Trino** column is derived from the ecosystem scan (report 09) and community signals (report 08) only — no Trino-specific deep-dive report was produced in Wave 1. Trino cells should be treated as directionally correct but not verified to the same depth as the other six engines. A dedicated Trino research issue (#156) was created in the ecosystem scan report.

The **Flink** column is similarly sourced from reports 08 and 09 only. A dedicated Flink research issue (#158) was created. Flink cells in read-oriented rows reflect the partial preview status of the Flink connector and the finding that it does not handle commits with mixed add/remove actions.

### Cell interpretation caveats

**Polars ⚠️ cells:** Polars delegates all DML and maintenance to delta-rs. A ⚠️ cell for Polars typically means the operation is possible by calling `DeltaTable` directly after importing `deltalake`, but Polars exposes no wrapper method. This creates a two-library workflow that is not documented in the Polars user guide. Examples: DELETE, UPDATE, VACUUM, OPTIMIZE, CDF batch read, RESTORE.

**Daft ⚠️ cells:** Daft's write-to-Unity-Catalog path (`UnityCatalogTable` target) is partial — catalog registration for new tables is listed as an open roadmap item. The streaming sink (`sink_delta` via Polars) is marked unstable. Daft's `ignore_deletion_vectors=True` workaround is categorized ❌ (not supported without risk) rather than ⚠️ because enabling it may return stale rows.

**DuckDB write ⚠️ cells:** The DuckDB append cell is ⚠️ rather than ✅ because of active bugs as of the research date: partitioned-table writes were broken (issue #280), and write statistics were only added in PR #290 (merged 2026-03-13). Prior inserts written by DuckDB lack data-skipping metadata.

**DataFusion ⚠️ cells:** DataFusion is the internal execution engine of delta-rs. The DataFusion column in this matrix refers to the DataFusion integration as documented in the delta-rs docs site (the `QueryBuilder` and `DeltaTableProvider` path accessible to Python users). Most cells match delta-rs because the Python API wraps the same Rust operations. Notable divergence: `schema_mode="merge"` on MERGE has a known type-coercion bug (issue #2642) and a `List<Struct>` failure mode (issue #3339).

**Trino concurrent-write ⚠️:** Trino requires `delta.enable-non-concurrent-writes` for S3 and has no collision detection when writing alongside other engines. This is technically documented in Trino's own docs but not in Delta Lake's Trino stub page.

### Known documentation gaps surfaced across all reports
1. **Streaming best practices** are absent from all documentation. The official docs' Best Practices page covers only batch scenarios.
2. **Multi-engine feature comparison** does not exist anywhere in official Delta docs. Users cannot determine which features are readable by which engines without consulting each engine's separate documentation.
3. **Column Mapping support matrix** is absent. Which engines support reading tables with Column Mapping enabled is underdocumented; several engines silently fail or produce wrong results on such tables.
4. **Deletion Vector compatibility matrix** is absent. Which engine versions added DV read support is not consolidated anywhere.
5. **Version-gating inconsistency** in official docs: some features note minimum Delta version in the page title; others bury it or omit it.
6. **Security / access control** is entirely absent from all documentation sites. Storage-level credential config is covered but column-level and row-level security are not.
7. **delta-rs has no streaming support** and this is not flagged as a known limitation anywhere in the delta-rs docs — users migrating from Spark would need to discover this independently.
8. **Flink connector status** is materially incomplete: the delta.io Flink stub page is one sentence; the actual capabilities and limitations (no Flink Table API, no SQL, no mixed add+remove commits) are undocumented on the official site.
