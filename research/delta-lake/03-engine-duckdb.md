# DuckDB Delta Engine Coverage Report

**Engine:** DuckDB (delta extension)
**Extension repo:** https://github.com/duckdb/duckdb_delta
**Official docs:** https://duckdb.org/docs/stable/core_extensions/delta.html
**Researched:** 2026-03-27
**DuckDB minimum version:** 0.10.3
**Extension status:** Core extension (ships with DuckDB distribution, autoloads on first use)

---

## Summary

DuckDB's Delta support is delivered via the `delta` core extension, built on the [delta-kernel-rs](https://github.com/delta-incubator/delta-kernel-rs) Rust library. As of March 2026 the extension covers read operations comprehensively and has introduced limited write support (append/blind insert only). Most advanced write operations — MERGE, UPDATE, DELETE, VACUUM, OPTIMIZE, and schema evolution — are not supported and have no confirmed timeline. Time-travel by version number is available via the `ATTACH ... AT (VERSION => n)` syntax; time-travel by timestamp remains an open enhancement request. CDF (Change Data Feed), OPTIMIZE/bin-packing, and VACUUM are entirely outside the extension's scope because they require write-path capabilities DuckDB does not currently expose.

The extension is read-oriented and is best suited as an analytics query layer over Delta tables that are authored and maintained by a write-capable engine (Spark, Delta-rs, or Databricks). Writing from DuckDB is possible for append-only workloads but should be treated as early-stage: partitioned-table write bugs were open as of the research date, and statistics were only added in March 2026 (PR #290).

---

## Operations Coverage

| Operation | Status | Notes |
|---|---|---|
| **Read (full table scan)** | ✅ Supported + documented | `delta_scan('path')` or `FROM delta_scan(...)`. Multithreaded; parallel parquet metadata reading. |
| **Read with predicate pushdown** | ✅ Supported + documented | Filter pushdown at row-group level (parquet metadata) and file level (Delta partition info). NOT_EQUAL pushdown added in PR #212. OR pushdown open as of PR #292. |
| **Read with projection pushdown** | ✅ Supported + documented | Standard DuckDB column pruning applies. |
| **Deletion vector scanning** | ✅ Supported + documented | Soft-deleted rows are correctly excluded during scans. |
| **ATTACH delta table** | ✅ Supported + documented | `ATTACH 'path' AS alias (TYPE delta)`. Also accepts `VERSION n` parameter. Enables schema introspection via normal table reference. |
| **Write / Append (blind insert)** | ⚠️ Supported but constrained | `INSERT INTO` via ATTACH is available. Appends to unpartitioned and partitioned tables; write statistics added in PR #290 (merged 2026-03-13). Partitioned-table write regression open as issue #280. Idempotent writes infrastructure merged in PR #277 (2026-02-05). |
| **Overwrite (full table replace)** | ❌ Not supported | No `INSERT OR REPLACE`, `CREATE OR REPLACE`, or overwrite-mode write available. |
| **MERGE (upsert)** | ❌ Not supported | SQL MERGE is not implemented in the write path. Issue #228 notes delete support is "on the todo list" but no MERGE tracking issue found. |
| **DELETE** | ❌ Not supported | No DML DELETE support. The extension can read tables that contain deletion vectors produced by other engines, but cannot produce them. |
| **UPDATE** | ❌ Not supported | No DML UPDATE support. |
| **Time travel by version** | ✅ Supported, partially documented | `ATTACH 'path' AS dt (TYPE delta, VERSION 0)` or `SELECT * FROM dt.dt AT (VERSION => 2)`. Merged in PR #226; UX fixed in PR #239 (DuckDB v1.4+ uses `dt` not `dt.dt`). Official docs do not yet reflect this syntax. |
| **Time travel by timestamp** | ❌ Not supported | Proposed AS OF syntax (issue #109) not yet implemented. Maintainer confirmed it depends on delta-kernel-rs FFI support that was not yet available. Issue #227 tracks this and is open. |
| **Change Data Feed (CDF)** | ❌ Not supported | No `_change_type`, `_commit_version`, or `_commit_timestamp` virtual columns exposed. CDF requires write-path awareness; not planned in any tracked issue. |
| **VACUUM** | ❌ Not supported | No write-path operations. VACUUM requires removing old Parquet files, which is outside DuckDB's current Delta scope. |
| **OPTIMIZE / bin-packing compaction** | ❌ Not supported | DuckDB cannot rewrite Delta files. OPTIMIZE would require full write-path support. |
| **Schema reading (DESCRIBE / introspection)** | ✅ Supported + documented | Via ATTACH: `DESCRIBE dt.table_name` works. Column types, structs, and VARIANT type all supported. |
| **Schema evolution (add / rename / drop columns)** | ⚠️ Read side only | ID-based column mapping implemented in PR #230 (closed 2025). DuckDB can read tables that have had columns added/renamed via other engines. DuckDB cannot perform schema evolution DDL on Delta tables. |
| **Storage config — S3** | ✅ Supported + documented | `CREATE SECRET (TYPE S3, ...)` with `PROVIDER CREDENTIAL_CHAIN` or explicit key/secret. `s3://` and `s3a://` prefixes; note: s3a:// secret propagation was bugged as of issue #272. |
| **Storage config — Azure Blob / ADLS** | ✅ Supported + documented | `az://`, `abfss://` prefixes. `CREATE SECRET (TYPE AZURE, PROVIDER CREDENTIAL_CHAIN, ...)`. Kubernetes Workload Identity support open as issue #266. |
| **Storage config — GCS** | ✅ Supported + documented | HMAC key-based secrets (`TYPE GCS`). Issue #255 (open) notes GCS secrets may be silently ignored in some configurations, defaulting to anonymous access. |
| **Catalog-managed tables** | ✅ Supported (internal) | PR #291 merged 2026-03-17 adds `log_tail` provision and commit delegation for catalog-managed Delta tables. Primarily relevant for Unity Catalog integration. |

---

## Known Limitations

### Write path is append-only and immature
The extension describes itself as offering "read and limited write (blind insert) support." As of March 2026, `INSERT INTO` appends are available but:
- Partitioned-table writes are broken in at least some configurations (issue #280, open).
- Writing to managed Delta tables fails with `Unknown feature 'icebergWriterCompatV1'` (issue #289, open).
- Statistics were not written on insert until PR #290 merged 2026-03-13, meaning earlier inserts lack data skipping metadata.
- There is no `CREATE TABLE ... (TYPE delta)` DDL — tables must already exist as Delta tables created by another engine.

### No destructive or in-place DML
UPDATE, DELETE, MERGE, and TRUNCATE are entirely absent from the write path. Users who need these operations must use Spark, Delta-rs, or another write-capable engine and then query results from DuckDB.

### Time travel by timestamp not implemented
Only version-based time travel is available. Timestamp-based travel (`AS OF TIMESTAMP`) was noted as blocked by delta-kernel-rs FFI availability (issue #109). It remains an open enhancement with no ETA.

### CDF not exposed
Change Data Feed virtual columns (`_change_type`, `_commit_version`, `_commit_timestamp`) are not surfaced. There is no tracking issue for this feature, suggesting it is not on the near-term roadmap.

### OPTIMIZE and VACUUM are out of scope
These maintenance operations produce or delete Parquet files and update the Delta log. DuckDB has no mechanism to perform these operations; they must be run from a write-capable engine.

### Unsupported table features block reads
Issue #182 (open) documents that tables using the `V2Checkpoint` feature cause a read error: `Unsupported: Unsupported ReaderFeatures ["V2Checkpoint"]`. Tables with unsupported Delta protocol features may be unreadable.

### Platform gaps
Extension is not available on all DuckDB platforms. WebAssembly and some Linux variants are listed as work-in-progress. This limits use in browser-based or embedded environments.

### OR predicate pushdown incomplete
PR #292 (open as of research date) adds OR pushdown and clustered data tests, indicating that OR-predicated queries may scan more files than necessary until this lands.

### GCS anonymous fallback
Issue #255 (open) reports that GCS secrets may be silently ignored, causing queries to fall through to anonymous access and fail on private buckets.

---

## Source Links

| Source | URL |
|---|---|
| DuckDB Delta extension docs | https://duckdb.org/docs/stable/core_extensions/delta.html |
| duckdb/duckdb_delta GitHub repo | https://github.com/duckdb/duckdb_delta |
| README (raw) | https://github.com/duckdb/duckdb_delta/blob/main/README.md |
| PR #226 — Time travel by version | https://github.com/duckdb/duckdb_delta/issues/226 |
| Issue #227 — Time travel by timestamp (open) | https://github.com/duckdb/duckdb_delta/issues/227 |
| Issue #109 — AS OF timestamp syntax (open) | https://github.com/duckdb/duckdb_delta/issues/109 |
| PR #233 — Appending to existing Delta tables | https://github.com/duckdb/duckdb_delta/issues/233 |
| Issue #228 — Append support tracking (open) | https://github.com/duckdb/duckdb_delta/issues/228 |
| PR #277 — Idempotent writes | https://github.com/duckdb/duckdb_delta/issues/277 |
| PR #290 — Write stats on insert | https://github.com/duckdb/duckdb_delta/issues/290 |
| PR #291 — Catalog-managed table support | https://github.com/duckdb/duckdb_delta/issues/291 |
| PR #230 — ID-based column mapping | https://github.com/duckdb/duckdb_delta/issues/230 |
| Issue #280 — Partitioned table write broken (open) | https://github.com/duckdb/duckdb_delta/issues/280 |
| Issue #289 — Managed table write failure (open) | https://github.com/duckdb/duckdb_delta/issues/289 |
| Issue #182 — V2Checkpoint unsupported (open) | https://github.com/duckdb/duckdb_delta/issues/182 |
| Issue #255 — GCS secret ignored (open) | https://github.com/duckdb/duckdb_delta/issues/255 |
| Issue #272 — s3a:// secret propagation (open) | https://github.com/duckdb/duckdb_delta/issues/272 |
| DuckDB blog: Delta Lake support announcement | https://duckdb.org/2024/06/10/delta.html |
