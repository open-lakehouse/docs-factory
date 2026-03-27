# delta-rs Docs Coverage Report

**Source:** https://delta-io.github.io/delta-rs/
**Crawled:** 2026-03-27
**Scope:** All sections in the delta-rs MkDocs site: Installation, Usage, API Reference, Integrations, How Delta Lake Works, Upgrade Guides.

---

## Summary

The delta-rs documentation site (built with MkDocs Material) targets Python and Rust users who want to work with Delta Lake without Apache Spark. It is explicitly framed as a non-Spark path: the overview states it is for "pandas, Polars, Rust, or any other PyArrow-like DataFrame library" and redirects Spark users elsewhere.

Coverage is strongest for core write operations (create, append, overwrite, delete, merge) and storage integrations (S3, ADLS, GCS, HDFS, S3-compatible). The API Reference provides complete method signatures for the Python API. The seven integration pages (Arrow, Daft, Dagster, Dask, DataFusion, pandas, Polars) are well-scoped how-to guides with working code examples and performance benchmarks.

Significant gaps exist relative to the official Delta docs: no streaming support, no Liquid Clustering or Deletion Vectors, no UniForm/Iceberg compatibility, no Row Tracking, no Type Widening, no Column Mapping, no RESTORE, no CLONE/SHALLOW CLONE, and no UPDATE operation in the Usage section (UPDATE is present only in the API reference, not as a dedicated guide). The "How Delta Lake Works" section is conceptually lightweight (architecture, ACID transactions, file skipping) and does not address advanced protocol features.

The site underwent a breaking-change migration at version 1.0.0 (PyArrow → arro3, Rust-default engine); an upgrade guide exists but several method removals are underdocumented.

---

## Operations Catalogued

### Usage Section

| Operation | Doc Path | Diátaxis Category | Languages / Engines | Quality Notes |
|---|---|---|---|---|
| Installation | `usage/installation/` | Tutorial | Python, Rust | Clean; covers pip, conda, cargo; lists all supported integrations and storage backends |
| Overview | `usage/overview/` | Tutorial | Python, Rust | High-level feature list; good starting point; no examples |
| Create Table | `usage/create-delta-lake-table/` | How-to | Python (pandas, Polars), Rust | Covers `write_deltalake()` and Rust `CreateBuilder`; SaveMode shown; schema definition examples present |
| Load / Open Table | `usage/loading-table/` | How-to | Python, Rust | Covers `DeltaTable()`, `is_deltatable()`, time travel via `load_version()` / `load_with_datetime()`; Unity Catalog (`uc://`) support documented; storage_options pattern explained |
| Append / Overwrite | `usage/appending-overwriting-delta-lake-table/` | How-to | Python, Rust | Both modes with Python and Rust examples; overwrite described as logical delete; time travel to previous versions shown |
| Add Constraint | `usage/constraints/` | How-to | Python, Rust | CHECK constraints only; violation error message shown; single-constraint-at-a-time limitation noted in API docs (not flagged on this page) |
| Read Change Data Feed (CDF) | `usage/read-cdf/` | How-to | Python (Polars), Rust (DataFusion) | `load_cdf()` / `scan_cdf()`; version-range parameters; requires `delta.enableChangeDataFeed=true` at creation time; cannot retroactively enable — limitation stated but not prominently flagged |
| Examine Table (metadata, schema, history, add actions) | `usage/examining-table/` | How-to / Reference | Python, Rust | Covers `metadata()`, `schema()`, `history()`, `get_add_actions()`; 30-day log retention noted; history note: "not written by all writers" |
| Query Table | `usage/querying-delta-tables/` | How-to | Python (pandas, PyArrow, DuckDB, Dask), Rust (DataFusion) | `to_pandas()`, `to_pyarrow_table()`, `to_pyarrow_dataset()`, `file_uris()`; partition filtering with DNF syntax; batch/streaming via Dataset |
| Merge Table | `usage/merging-tables/` | How-to | Python, Rust | UPDATE, INSERT, DELETE, UPSERT, UPSERT+DELETE patterns; `when_not_matched_by_source_*` documented; performance optimization (predicate + partition filters) with 98% latency reduction benchmark |
| Manage Table (vacuum, optimize/compact) | `usage/managing-tables/` | How-to | Python, Rust | `vacuum()` dry_run default; `optimize.compact()` and `optimize.z_order()`; 7-day default retention |
| Delete Rows | `usage/deleting-rows-from-delta-lake-table/` | How-to | Python, Rust | SQL predicate string or DataFusion expression; delete-all if no predicate; returns metrics |
| Writing to S3 with Locking Provider | `usage/writing/writing-to-s3-with-locking-provider/` | How-to | Python | DynamoDB-based locking; `AWS_S3_LOCKING_PROVIDER=dynamodb`; permission list documented |
| Best Practices | `usage/delta-lake-best-practices/` | How-to | Python | 8 topics: compaction, Z-ordering, partitioning, quality controls/constraints, DML cost, vacuum, cost minimization, metadata statistics; deletion vectors mentioned but not linked to an enabling guide |
| Small File Compaction (Optimize) | `usage/optimize/small-file-compaction-with-optimize/` | How-to | Python, Rust | Partition-filtered optimization; `target_size`, `retention_hours`, `enforce_retention_duration`, `dry_run` options; returns metrics |
| Z-Order | `usage/optimize/delta-lake-z-order/` | How-to | Python, Rust | Colocates similar data; referenced in multiple pages but the dedicated page returned 404 during crawl — likely present but URL variant needed |

### API Reference Section

| API / Class | Doc Path | Diátaxis Category | Notes |
|---|---|---|---|
| `write_deltalake()` | `api/delta_writer/` | Reference | `mode`, `schema_mode`, `partition_by`, `target_file_size`, `writer_properties`; `convert_to_deltalake()` also documented; only HIVE partitioning supported for convert |
| `WriterProperties` / `ColumnProperties` / `BloomFilterProperties` | `api/delta_writer/` | Reference | Full Parquet writer config: compression codecs, Bloom filter, per-column encoding |
| `DeltaTable` | `api/delta_table/` | Reference | Comprehensive; all CRUD methods, inspection, maintenance, transaction APIs; `count()` noted approximate; vacuum enforces retention by default; CDF requires Delta 2.1+ |
| `TableMerger` | `api/delta_table/delta_table_merger/` | Reference | All 7 when_matched / when_not_matched variants; special character column handling (backtick encapsulation); returns metrics dict |
| `TableOptimizer` | `api/delta_table/delta_table_optimizer/` | Reference | `compact()` and `z_order()`; target_size default 100MB; max_concurrent_tasks defaults to CPU count; idempotent; fails concurrent with non-append operations |
| `TableAlterer` | `api/delta_table/delta_table_alterer/` | Reference | `add_columns`, `add_constraint`, `add_feature` (Deletion Vectors / CDF), `drop_constraint`, `set_column_metadata`, `set_table_description`, `set_table_name`, `set_table_properties`; single-constraint-at-a-time limitation present but underdocumented in usage guides |
| `Schema` / `Field` / Data Types | `api/schema/` | Reference | Full Schema/Field/PrimitiveType/ArrayType/MapType/StructType coverage; Arrow interop methods; `to_json` / `from_json`; `invariants` property |
| `DeltaStorageHandler` | `api/storage/` | Reference | PyArrow filesystem abstraction; only constructor documented; no usage examples; sparse |
| `QueryBuilder` | `api/query/` | Reference | DataFusion SQL bridge; `register()` + `execute()` chain; returns RecordBatchReader; `show()` removed in 1.0.0 |
| `CommitProperties` / `PostCommitHookProperties` / `AddAction` / transaction functions | `api/transaction/` | Reference | `create_table_with_add_actions`, `DeltaTable.create_write_transaction()` (low-level); checkpoint and log cleanup hooks; `custom_metadata` support |
| Exceptions | `api/exceptions/` | Reference | 5 exceptions: `DeltaError`, `DeltaProtocolError`, `TableNotFoundError`, `CommitFailedError`, `SchemaMismatchError`; minimal — description-only, no code examples |

### Integrations Section

| Integration | Doc Path | Diátaxis Category | Operations Covered | Quality Notes |
|---|---|---|---|---|
| AWS S3 | `integrations/object-storage/s3/` | How-to / Reference | Read, write, concurrent writes via DynamoDB locking | Thorough; all auth methods; URL schemes; DynamoDB permission list; critical limitation: cannot read `.aws/config` (must pass credentials explicitly); `AWS_S3_ALLOW_UNSAFE_RENAME` option documented |
| Azure ADLS | `integrations/object-storage/adls/` | How-to / Reference | Read, write (pandas + Polars) | 17 config keys tabulated; 4 auth methods (explicit, CLI, service principal, managed identity); 4 URL schemes; references object_store crate for canonical config |
| GCS | `integrations/object-storage/gcs/` | How-to / Reference | Read, write (Polars + Rust) | Auth priority order documented; IAM permissions listed; `gs://` URL scheme; no extra deps; Rust: GCS auto-registered at startup (deprecated manual registration) |
| HDFS | `integrations/object-storage/hdfs/` | Reference | Read, write | Pure Rust `hdfs-native-object-store` client; Kerberos + SASL + token auth; `HADOOP_CONF_DIR` discovery; explicit limitation: "does not support every possible client configuration" |
| CloudFlare R2 / MinIO / S3-compatible | `integrations/object-storage/s3-like/` | How-to / Reference | Read, write | `aws_conditional_put` removes DynamoDB dependency for R2/MinIO; Alibaba OSS known issues; LocalStack + Ceph noted; HTTP override for local testing |
| LakeFS | `integrations/object-storage/lakefs/` | How-to | All standard delta-rs operations | Branch-per-transaction model; `lakefs://bucket/branch/table` format; failed-op branch cleanup guidance; no extra deps |
| Advanced Object Storage Config | `integrations/object-storage/special_configuration/` | Reference | Retry, concurrency, HTTP client, proxy | `OBJECT_STORE_CONCURRENCY_LIMIT`, `max_retries`, proxy, TLS options; `allow_invalid_certificates` flagged as critical security risk |
| Apache Arrow | `integrations/delta-lake-arrow/` | How-to | `to_pyarrow_dataset()`, `to_pyarrow_table()` | Critical distinction: datasets are lazy (predicate pushdown); tables are eagerly loaded; 1700x query performance difference documented; DuckDB and DataFusion examples |
| Daft | `integrations/delta-lake-daft/` | How-to | `daft.read_delta_lake()`, `df.write_deltalake()` | Lazy by default; partition pruning, file skipping, Z-ordering; multimodal support; Ray cluster distributed reads; ~60% compute saving benchmark; telemetry opt-out noted |
| Dagster | `integrations/delta-lake-dagster/` | How-to | I/O Managers (PyArrow, pandas, Polars), SourceAsset, partitioning, column pruning | `DeltaLakeIOManager`, `DeltaLakePandasIOManager`, `DeltaLakePolarsIOManager`; Z-order and vacuum mentioned; schema evolution supported; rematerializing assets overwrites table |
| Dask | `integrations/delta-lake-dask/` | How-to | `ddt.read_deltalake()`, `ddt.to_deltalake()`, time travel, version-specific reads | `dask-deltatable` package; version and datetime parameters; S3 support; warning: "dask-deltatable currently works with deltalake<=13.0" — potential staleness issue |
| Apache DataFusion | `integrations/delta-lake-datafusion/` | How-to | SQL queries, DataFrame API, register_table_provider | `QueryBuilder` + `register_table_provider`; DataFusion noted as underlying engine for update/merge/constraints evaluation; 1B-row benchmark (2.8s Delta vs 5.3s Parquet) |
| pandas | `integrations/delta-lake-pandas/` | How-to | `write_deltalake()`, `DeltaTable.to_pandas()`, time travel, schema_mode | `schema_mode="merge"` / `"overwrite"`; filter + column selection; performance benchmarks (234s CSV → 2.4s Delta Z-ordered on 1B rows) |
| Polars | `integrations/delta-lake-polars/` | How-to | `df.write_delta()`, `pl.read_delta()`, `pl.scan_delta()`, time travel | Lazy scan via `scan_delta()`; version parameter; benchmark (3.5s Delta vs 8.3s Parquet); Z-ordering noted as Delta-only feature |

### How Delta Lake Works Section

| Topic | Doc Path | Diátaxis Category | Notes |
|---|---|---|---|
| Architecture of a Delta Table | `how-delta-lake-works/architecture-of-delta-table/` | Explanation | Transaction log structure; JSON log records; tombstoning / logical deletes; file-level statistics in log; concrete file-system examples |
| ACID Transactions | `how-delta-lake-works/delta-lake-acid-transactions/` | Explanation | MVCC model; write-if-not-exists atomicity requirement; conflict detection and zombie-file cleanup; all four ACID properties explained; data-lake comparison; moderate-to-advanced depth |
| File Skipping | `how-delta-lake-works/delta-lake-file-skipping/` | Explanation | Min/max column stats per file; predicate pushdown; recommended file sizing (100MB–1GB); partitioning benefits; Z-ordering and compaction tools referenced; no performance benchmarks in this section |

### Upgrade Guides Section

| Guide | Doc Path | Diátaxis Category | Notes |
|---|---|---|---|
| Version 1.0.0 | `upgrade-guides/guide-1.0.0/` | Reference | Major breaking changes: PyArrow → arro3 (`ArrowStreamExportable`); `engine` param removed; 6 PyArrow writer params removed; `CommitProperties` replaces `custom_metadata` across all APIs; 6 `DeltaTable` methods removed; `transaction_versions` renamed; `DeltaProtocolError` raised on unsupported table features; new public transaction APIs (`create_table_with_add_actions`, `create_write_transaction`) |

---

## Cross-reference vs Official Docs

### Operations in official Delta docs (docs.delta.io) **absent** from delta-rs docs

| Missing Operation | Official Doc Slug | Notes |
|---|---|---|
| Spark Structured Streaming (source + sink) | `/delta-streaming/` | No streaming support in delta-rs; not flagged as a known gap on the site |
| Idempotent Streaming Writes (txnAppId / txnVersion) | `/delta-streaming/` | Not applicable without streaming; absent |
| UPDATE (as a dedicated Usage guide) | `/delta-update/` | `DeltaTable.update()` exists in the API reference but has no Usage guide page analogous to the Delete guide |
| RESTORE | `/delta-utility/` | `DeltaTable.restore()` exists in API reference (`api/delta_table/`) but has no dedicated Usage guide page |
| CLONE / SHALLOW CLONE | `/delta-utility/` | Not present in delta-rs docs or API reference |
| CONVERT TO DELTA (from Iceberg) | `/delta-utility/` | `convert_to_deltalake()` exists for Parquet→Delta only; no Iceberg conversion path documented |
| Liquid Clustering | `/delta-clustering/` | Not present; only Z-ordering and compact() are documented |
| Deletion Vectors (as a usage guide) | `/delta-deletion-vectors/` | `TableAlterer.add_feature()` can enable Deletion Vectors via `TableFeatures` enum; no how-to guide; best practices page mentions deletion vectors improve DML performance but does not link to enablement steps |
| UniForm / Universal Format (Iceberg + Hudi interop) | `/delta-uniform/` | Not present in delta-rs docs |
| Column Mapping (rename/drop columns, special characters) | `/delta-column-mapping/` | Not documented as a feature; special characters in column names only handled in merge predicates via backtick syntax |
| Type Widening | `/delta-type-widening/` | Not present |
| Row Tracking | `/delta-row-tracking/` | Not present |
| NOT NULL Constraint | `/delta-constraints/` | Only CHECK constraints documented; NOT NULL is not addressed in Usage or API guides |
| Liquid Clustering / REORG TABLE | `/delta-deletion-vectors/` | Not present |
| Auto Compaction | `/optimizations-oss/` | Not present; only manual `optimize.compact()` |
| Log Compaction | `/optimizations-oss/` | `compact_logs()` exists in `DeltaTable` API reference but has no dedicated documentation or usage guide |
| Multi-part Checkpointing / V2 Checkpoints | `/optimizations-oss/` | `create_checkpoint()` exists in API but no explanation of checkpoint types |
| Data Skipping configuration (numIndexedCols) | `/optimizations-oss/` | Not documented; only conceptual explanation in "How Delta Lake Works" |
| Concurrency Control (conflict matrix, exception types) | `/concurrency-control/` | MVCC is explained in "How Delta Lake Works / Transactions" but there is no reference page with conflict categories or programmatic exception handling guidance |
| GENERATE (symlink manifests for external engines) | `/delta-utility/` | `DeltaTable.generate()` exists in the API reference but has no usage guide; manifests are relevant for Presto/Athena use cases |
| Delta Sharing | `/delta-sharing/` | No Delta Sharing integration documented in delta-rs |
| DESCRIBE HISTORY detail (operation metrics) | `/delta-utility/` | `history()` is documented but without the operation metrics table that exists in official docs |
| Security / access control | N/A | Not covered in either docs site; storage-level credential config is documented in delta-rs but column/row-level security is absent |
| Idempotent batch writes | `/delta-batch/` | No equivalent of Spark's `txnAppId`/`txnVersion` idempotency for batch DML in delta-rs |
| DROP TABLE FEATURE (ALTER TABLE DROP FEATURE) | `/delta-drop-feature/` | Not present; delta-rs has `add_feature()` but no feature-removal pathway |
| Delta Connect / Spark Connect | `/delta-spark-connect/` | Not applicable |

### Operations in delta-rs docs **absent** from official Delta docs

| delta-rs-Specific Operation | Location | Notes |
|---|---|---|
| arro3 / `ArrowStreamExportable` interface | `upgrade-guides/guide-1.0.0/` | delta-rs's custom Arrow C Data Interface binding; not covered in official Spark-centric docs |
| `DeltaTable.repair()` | `api/delta_table/` | Audits and removes missing/corrupted active files; no equivalent in official docs |
| `DeltaTable.get_add_actions()` | `api/delta_table/` | Returns structured file-level metadata; no equivalent query-level operation in official docs |
| `DeltaTable.create_write_transaction()` | `api/transaction/` | Low-level write transaction API allowing custom AddActions; not present in official docs |
| `create_table_with_add_actions()` | `api/transaction/` | Direct table creation from pre-built AddAction objects; unique to delta-rs |
| `WriterProperties` / `ColumnProperties` / `BloomFilterProperties` | `api/delta_writer/` | Fine-grained Parquet writer configuration (per-column encoding, Bloom filters); not exposed in official docs |
| `DeltaStorageHandler` | `api/storage/` | PyArrow filesystem handler for custom storage backends; no equivalent in Spark-based docs |
| `QueryBuilder` (DataFusion SQL bridge) | `api/query/` | Exposes DataFusion SQL engine to Python without Spark; unique to delta-rs |
| LakeFS integration | `integrations/object-storage/lakefs/` | Full LakeFS branch-per-transaction support; not documented in official Delta docs |
| CloudFlare R2 / MinIO / S3-compatible backends | `integrations/object-storage/s3-like/` | S3-compatible store support including conditional puts; not in official docs |
| HDFS via pure Rust client | `integrations/object-storage/hdfs/` | `hdfs-native-object-store`; distinct from Hadoop-native approach in official docs |
| Daft integration | `integrations/delta-lake-daft/` | Native Daft (`getdaft`) read/write; not in official docs |
| Dagster I/O Managers | `integrations/delta-lake-dagster/` | Three I/O manager variants; not in official docs |
| Unity Catalog table loading (`uc://`) | `usage/loading-table/` | `uc://catalog.db.table` URI format with Databricks credentials; not in official docs |
| Advanced HTTP/proxy/concurrency storage config | `integrations/object-storage/special_configuration/` | HTTP/2 keepalive, connection pooling, proxy; not in official docs |

---

## Notes

- **Diátaxis signal is also weak in delta-rs docs.** Most Usage pages are how-to guides with working code, which is good, but the API Reference is reference-only with minimal context. The "How Delta Lake Works" section is clearly Explanation, but the boundary between Usage (how-to) and API Reference is often blurry for the same operation (e.g., merge is covered in both `usage/merging-tables/` and `api/delta_table/delta_table_merger/`).

- **Version-gating is absent.** Unlike the official docs, delta-rs docs do not indicate which delta-rs version introduced each feature. The 1.0.0 upgrade guide is the only version-specific document. Users cannot tell from the usage pages which minimum `deltalake` package version is required for CDF, Deletion Vectors via `add_feature()`, or Unity Catalog support.

- **404s are common on the site.** During crawling, 15+ URL variants returned 404 (integration pages, some usage pages, Z-order dedicated page). Several pages may have been moved or the mkdocs `use_directory_urls` setting produces URL variations. The navigation links extracted from the homepage were the reliable source for valid paths.

- **Dask integration is pinned to a stale version.** The Dask page explicitly warns: "dask-deltatable currently works with deltalake<=13.0" (referring to a GitHub issue). This is an unresolved compatibility problem that makes the Dask integration unreliable for users on current versions.

- **CDF retroactive enablement gap is understated.** The CDF page notes `delta.enableChangeDataFeed` must be set at creation time but does not explain that `TableAlterer.add_feature()` can enable CDF after the fact. This creates a misleading impression that CDF cannot be retroactively added.

- **UPDATE has no Usage guide.** The Delete, Merge, and Constraint operations all have dedicated Usage guide pages. UPDATE is documented only in the `DeltaTable` API reference (`update()` method). This asymmetry makes the operation harder to discover.

- **No streaming.** This is the single largest capability gap relative to official Delta docs. delta-rs has no concept of Structured Streaming, no stream source or sink, and no idempotent streaming write pattern. This is not flagged anywhere in the docs as a known limitation — users coming from the official docs or expecting Spark parity would need to discover this gap independently.

- **No security or access control coverage.** Neither docs site covers column- or row-level security, but delta-rs does provide detailed credential configuration per storage backend, which is more actionable than the official docs' storage configuration page.

- **"How Delta Lake Works" explanations are standalone quality.** The architecture, ACID transactions, and file-skipping pages are well-written with concrete examples. They would serve well as onboarding content but are not cross-linked from the usage guides they are most relevant to.
