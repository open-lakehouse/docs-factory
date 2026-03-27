# ClickHouse Delta Lake Engine Coverage

## Summary

ClickHouse provides read access to Delta Lake tables via the `DeltaLake` table engine and `deltaLake` table function, backed by the delta-kernel-rs (Rust) library which was promoted to the default read path in v25.5 (PR #79541). Write support was added as an experimental feature in v25.8–v25.10 and requires setting `allow_experimental_delta_lake_writes = 1`; INSERT (append) operations work on S3 and GCS, but Azure writes are explicitly not yet supported. No DML beyond INSERT (no UPDATE, DELETE, or MERGE) is available through the Delta Lake integration. The DeltaLake engine exposes tables as external, read/write-passthrough objects — not native ClickHouse MergeTree tables — which means ClickHouse DDL operations like OPTIMIZE and VACUUM do not apply.

## Operations Coverage

| Operation | Path | Status | Notes |
|-----------|------|--------|-------|
| Read (full scan) | Read | ✅ | Full SELECT support via `DeltaLake` table engine and `deltaLake` / `deltaLakeS3` / `deltaLakeAzure` table functions; Parquet files are read directly |
| Predicate pushdown | Read | ✅ | Statistics-based pruning implemented via delta-kernel-rs expression visitor API (v25.8, PR #85564); `delta_lake_enable_expression_visitor_logging` setting available |
| Partition pruning | Read | ✅ | Partition pruning implemented via delta-kernel-rs internal filtering (v25.8); fixed for cluster-function variants in same release |
| Schema introspection | Read | ✅ | Schema automatically inferred from Delta Lake transaction log metadata; no manual DDL required |
| Time travel | Read | ✅ | `delta_lake_snapshot_version` setting allows reading a specific snapshot version (added v25.8, PR #85295); CDF also uses `delta_lake_snapshot_start_version` / `delta_lake_snapshot_end_version` settings; no SQL `FOR VERSION AS OF` syntax — version must be set as a query-level setting |
| Change Data Feed (CDF) | Read | ✅ | CDF read supported via dedicated settings and the `deltalake-cdc` tooling; version-range queries supported |
| Write / Append | Write | ✅ (experimental) | INSERT into existing Delta Lake tables supported on S3 and GCS; requires `SET allow_experimental_delta_lake_writes = 1`; version gate: v25.8+ (experimental flag added via PR #86180) |
| Overwrite | Write | ❌ | No INSERT OVERWRITE or table-replacement write mode documented |
| DELETE | Write | ❌ | No DML DELETE support; not part of the experimental write path |
| UPDATE | Write | ❌ | No DML UPDATE support |
| MERGE | Write | ❌ | No MERGE / upsert support |
| Schema evolution | Read | ✅ | Schema changes (column adds, renames, type widening via `parquet.allow_missing_columns`) detected automatically on read; column mapping mode `name` supported (fix for dot-containing struct field names in v26.3) |
| Schema evolution | Write | ⚠️ | Not explicitly documented; write path is append-only INSERT; schema-on-write evolution not confirmed |
| VACUUM | N/A | ❌ | Not applicable; ClickHouse does not manage Delta Lake file lifecycle; must be run externally |
| OPTIMIZE | N/A | ❌ | Not applicable; compaction must be run externally via Spark, Databricks, or delta-rs tooling |
| Storage: S3 | Both | ✅ | Read and write supported; `deltaLakeS3` function and `DeltaLake` engine with S3 credentials |
| Storage: GCS | Both | ✅ | Read and write supported; HTTPS endpoint format required (`https://storage.googleapis.com/<bucket>/`) |
| Storage: Azure | Read | ⚠️ | Read supported via `deltaLakeAzure`; **writes to Azure are explicitly not yet supported** as of v25.10 |
| Storage: Local | Read | ✅ | `deltaLakeLocal` function available for local filesystem reads |
| Catalog integration | Read | ✅ | Unity Catalog (AWS Glue + Delta Lake) supported since v25.3; Microsoft OneLake supported; `DataLakeCatalog` engine in ClickHouse Cloud provides automatic table discovery across catalogs |
| Named collections | Both | ✅ | Named collections supported for credential management on all backends |
| **Protocol: Delta Kernel (write path)** | Write | ✅ | Write path uses delta-kernel-rs; `allow_experimental_delta_lake_writes` setting explicitly described as "Enables delta-kernel writes feature" |
| **Protocol: Delta Kernel (read path)** | Read | ✅ | delta-kernel-rs is the default read backend (promoted from experimental in v25.5, PR #79541); enables statistics and partition pruning via kernel expression visitor API |
| **Protocol: deletion vectors** | Read | ⚠️ | No explicit documentation of deletion vector read support in ClickHouse Delta Lake engine; delta-kernel-rs upstream supports reading deletion vectors but ClickHouse-specific confirmation not found in reviewed sources |
| **Protocol: column mapping** | Read | ✅ | `columnMappingMode: name` supported (fix for partition columns in PR #78921, v25.5; fix for dot-containing struct field names in v26.3 PR #98013) |
| **Protocol: v2 Checkpoint** | Read | ⚠️ | Not explicitly confirmed; delta-kernel-rs has upstream support but ClickHouse documentation does not list it |
| **Protocol: timestampNtz** | Read | ⚠️ | Not explicitly documented for ClickHouse's Delta Lake engine |

## External Table Access Pattern

ClickHouse exposes Delta Lake data as external tables through two complementary mechanisms: the `DeltaLake` named table engine (created via `CREATE TABLE ... ENGINE = DeltaLake(...)`) and the `deltaLake` / `deltaLakeS3` / `deltaLakeAzure` / `deltaLakeLocal` table functions used inline in queries. Both mechanisms are passthrough integrations — ClickHouse reads and writes Parquet files in the Delta Lake transaction log format directly on object storage, without copying or converting data into ClickHouse's native MergeTree format.

This architecture has important implications for mixed-engine setups. A Delta Lake table created or written by Spark, Databricks, or any other engine remains fully accessible in ClickHouse without any ingestion step, and ClickHouse writes (when enabled) produce valid Delta Lake transaction log entries readable by other engines. However, because ClickHouse does not own the table's storage lifecycle, operations like VACUUM (removing old Parquet files) and OPTIMIZE (compacting small files) must be performed externally. ClickHouse also cannot create new Delta Lake tables from scratch via DDL — the table must pre-exist on object storage. In ClickHouse Cloud, the `DataLakeCatalog` engine adds catalog-aware discovery, allowing Delta tables registered in Unity Catalog, AWS Glue, or Hive Metastore to be queried without manually specifying storage paths.

## Known Limitations

- **Write support is experimental**: Writes require `SET allow_experimental_delta_lake_writes = 1` and may change or break across ClickHouse versions; not recommended for production without validation.
- **Azure writes not supported**: Only S3 and GCS are supported for write operations as of v25.10. Azure Blob Storage is read-only.
- **INSERT (append) only**: The experimental write path supports only INSERT operations. No UPDATE, DELETE, MERGE, or INSERT OVERWRITE is available via the Delta Lake engine.
- **Cannot create new Delta Lake tables**: The engine requires a pre-existing Delta Lake table on object storage. ClickHouse DDL does not provision new Delta Lake tables.
- **No VACUUM or OPTIMIZE**: File lifecycle management (removing expired snapshots, compacting small files) must be done externally. ClickHouse has no built-in equivalent for Delta Lake.
- **Time travel via session setting only**: Snapshot version queries use the `delta_lake_snapshot_version` session setting rather than SQL `FOR VERSION AS OF` syntax, making it cumbersome to use in ad-hoc queries.
- **Deletion vector read support unconfirmed**: delta-kernel-rs supports deletion vectors upstream, but ClickHouse's documentation does not explicitly confirm they are handled in the read path.
- **Unity Catalog write-back not supported**: INSERT operations do not update Unity Catalog metadata (confirmed in PR #85564 discussion); tables written by ClickHouse may not be immediately visible to catalog-aware clients.
- **`delta_lake_snapshot_version` persists**: A known issue (GitHub #87676) where the `delta_lake_snapshot_version` setting leaks across queries in a session, causing stale snapshot reads unless explicitly reset.
- **Column mapping limited**: Only `name` mode is confirmed; `id` mode behavior is not documented for ClickHouse.

## Source Links

| Source | URL |
|--------|-----|
| ClickHouse DeltaLake table engine documentation | https://clickhouse.com/docs/en/engines/table-engines/integrations/deltalake |
| ClickHouse deltaLake table function documentation | https://clickhouse.com/docs/sql-reference/table-functions/deltalake |
| PR #85564: Support writes into Delta Lake | https://github.com/ClickHouse/ClickHouse/pull/85564 |
| PR #86180: Add experimental setting for delta writes | https://github.com/ClickHouse/ClickHouse/pull/86180 |
| PR #85295: Delta lake — support reads at specific snapshot version | https://github.com/ClickHouse/ClickHouse/pull/85295 |
| PR #79541: Enable delta-kernel by default | https://github.com/ClickHouse/ClickHouse/pull/79541 |
| PR #78921: Delta lake schema evolution (column mapping fix) | https://github.com/ClickHouse/ClickHouse/pull/78921 |
| ClickHouse v25.8 changelog (Cloud) | https://clickhouse.com/docs/changelogs/25.8 |
| ClickHouse blog: ClickHouse is data lake ready | https://clickhouse.com/blog/clickhouse-is-data-lake-ready |
| ClickHouse blog: Consuming the Delta Lake Change Data Feed for CDC | https://clickhouse.com/blog/consuming-delta-lake-change-data-feed-cdc |
| ClickHouse blog: Query your catalog — DataLakeCatalog engine | https://clickhouse.com/blog/query-your-catalog-clickhouse-cloud |
| GitHub issue #87676: delta_lake_snapshot_version persists after query | https://github.com/clickhouse/clickhouse/issues/87676 |
| GitHub issue #71407: Data Lake roadmap (closed) | https://github.com/ClickHouse/ClickHouse/issues/71407 |
| ClickHouse 2025 roundup | https://clickhouse.com/blog/clickhouse-2025-roundup |
