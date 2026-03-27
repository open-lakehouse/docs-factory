# DataFusion Delta Support Report

**Source:** https://delta-io.github.io/delta-rs/integrations/delta-lake-datafusion/, https://docs.rs/deltalake/latest/deltalake/, delta-rs GitHub releases
**Researched:** 2026-03-27
**Library version at time of research:** deltalake crate v0.31.1 / python-deltalake v1.5.0

---

## Summary

Apache DataFusion is the primary query and execution engine inside delta-rs. Almost every DML operation in delta-rs (merge, update, delete, write) is implemented on top of DataFusion logical and physical plans. The `DeltaTableProvider` struct implements DataFusion's `TableProvider` trait, exposing Delta tables as SQL-queryable sources via `SessionContext`. The `DeltaScan` physical plan provides predicate and partition pushdown, and the `DeltaDataSink` handles write execution.

As of v1.5.0 (March 2026), the integration supports the full standard read/write/merge/delete/update/optimize/vacuum lifecycle for both Rust and Python surfaces. Change Data Feed (CDF) read is supported in both APIs. CDF write (generating change data files during DML) is not yet supported. Schema evolution for writes is well-covered; schema evolution for MERGE had a known bug fixed in v0.30.0 (October 2025) but nested-struct list schemas still have edge-case issues. DataFusion is upgraded regularly alongside delta-rs (currently at DataFusion 52 / Arrow 57).

The Python API wraps nearly all Rust operations, with the key gap being that Python users cannot directly use `SessionContext` for registration without importing the `datafusion` Python package separately.

---

## Operations Coverage (Rust API)

| Operation | Coverage Status | Notes |
|---|---|---|
| **Read** | Supported | `DeltaTableProvider` implements `TableProvider`; register with `SessionContext::register_table` or use `DeltaOps`. Predicate pushdown and file-level statistics-based skipping are active. |
| **Write / Append** | Supported | `WriteBuilder` via `DeltaOps::write()`. Append mode adds data transactionally. Uses `DeltaDataSink` under the hood. Parallel partition writers added in v1.5.0. |
| **Write / Overwrite** | Supported | `SaveMode::Overwrite` in `WriteBuilder`. Full-table or predicate-scoped (replace-where) overwrite. Uses DataFusion `col().eq(lit())` expressions for predicate. |
| **MERGE** | Supported | `MergeBuilder` via `DeltaOps::merge()`. Supports `when_matched_update`, `when_matched_delete`, `when_not_matched_insert`, `when_not_matched_by_source_update`. Disk spilling for large merges added in v1.5.0. Schema evolution for merge fixed in v0.30.0. |
| **DELETE** | Supported | `DeleteBuilder` via `DeltaOps::delete()`. Predicate-based row deletion using DataFusion expressions. Migrated to new execution architecture with Deletion Vectors in v1.4.0. |
| **UPDATE** | Supported | `UpdateBuilder` via `DeltaOps::update()`. Column assignment expressions evaluated by DataFusion. Logical planning improved in v1.4.0. |
| **Time Travel** | Supported | `open_table_with_version()` and `open_table_with_ds()` (datetime string). `DeltaOps::restore()` to revert to a prior version or timestamp. |
| **CDF (read)** | Supported | `DeltaOps::load_cdf()` with `.with_starting_version()` / `.with_ending_version()`. Returns DataFusion execution plans. Requires `delta.enableChangeDataFeed = true` on the table. |
| **CDF (write)** | Not supported | CDF change-data files are not generated on DML operations. No `_change_data` directory output. Tracked in delta-rs issue #2095. |
| **VACUUM** | Supported | `VacuumBuilder` via `DeltaOps::vacuum()`. Removes files no longer referenced and older than retention period (default 7 days). Vacuum lite mode (avoids full storage listing) added in v1.5.0. |
| **OPTIMIZE (compact)** | Supported | `OptimizeBuilder` via `DeltaOps::optimize()`. Small-file compaction with configurable `target_size`. `max_temp_directory_size` parameter added for controlling temp storage during optimize. |
| **OPTIMIZE (Z-order)** | Supported | `OptimizeBuilder::with_z_order_by()`. Z-order clustering on specified columns. `max_temp_directory_size` parameter also available. |
| **Schema Evolution (write)** | Supported | `schema_mode` controls behaviour: `Overwrite` fully replaces schema including column drops; `Merge` appends new columns and fills missing with null. Supported on both append and overwrite. |
| **Schema Evolution (MERGE)** | Supported (with caveats) | Fixed in v0.30.0 (issue #3945). Edge-case: schema merge with `List<Struct>` types may fail due to DataFusion schema resolution; tracked in issue #3339. |
| **Storage Config** | Supported | Multiple backends via `StorageOptions`: AWS S3 (`s3://`, `s3a://`), Azure ADLS Gen2 / Blob (`az://`, `adl://`, `abfs://`), GCS (`gs://`), local. Credentials via environment variables or explicit `storage_options` map. DynamoDB required for safe concurrent S3 writes. |

---

## Operations Coverage (Python API)

| Operation | Coverage Status | Notes |
|---|---|---|
| **Read** | Supported | `DeltaTable` class. Convert to pandas via `to_pandas()`, PyArrow via `to_pyarrow_table()` / `to_pyarrow_dataset()`, or register with DataFusion `SessionContext` via `ctx.register_table_provider("name", dt)`. |
| **Write / Append** | Supported | `write_deltalake(table_or_uri, data, mode='append')`. Accepts pandas DataFrames, PyArrow Tables, and RecordBatches. |
| **Write / Overwrite** | Supported | `write_deltalake(..., mode='overwrite')`. Partition-specific overwrite via `predicate` parameter. |
| **MERGE** | Supported | `DeltaTable.merge(source, predicate)` returns `TableMerger`. Builder methods: `when_matched_update()`, `when_matched_delete()`, `when_not_matched_insert()`, `when_not_matched_by_source_update()`. Executed via DataFusion internally. |
| **DELETE** | Supported | `DeltaTable.delete(predicate=None)`. Predicate-based row deletion. Deletion Vectors enabled by default where protocol allows. |
| **UPDATE** | Supported | `DeltaTable.update(updates, predicate=None)`. Expressions parsed into DataFusion expressions server-side. |
| **Time Travel** | Supported | `DeltaTable.load_version(version)` for integer version; `DeltaTable.load_with_datetime(datetime_string)` for timestamp. `DeltaTable.restore(target)` to revert. `DeltaTable.history(limit)` to inspect commit log. |
| **CDF (read)** | Supported | `DeltaTable.load_cdf(starting_version, ending_version)`. Returns a RecordBatchReader. Requires `delta.enableChangeDataFeed = true`. |
| **CDF (write)** | Not supported | Same gap as Rust API — change-data files are not produced during Python DML. |
| **VACUUM** | Supported | `DeltaTable.vacuum(retention_hours=None, dry_run=True)`. Lists and deletes unreferenced files. |
| **OPTIMIZE (compact)** | Supported | `DeltaTable.optimize.compact(partition_filters, target_size)`. Wraps Rust `OptimizeBuilder`. |
| **OPTIMIZE (Z-order)** | Supported | `DeltaTable.optimize.z_order(columns, partition_filters)`. Wraps Rust Z-order builder. |
| **Schema Evolution (write)** | Supported | `write_deltalake(..., schema_mode="overwrite")` or `schema_mode="merge"`. `schema_mode="merge"` is supported on append operations. Known type-coercion issue: `schema_mode="merge"` may silently cast struct fields instead of raising an error (issue #2642). |
| **Schema Evolution (MERGE)** | Supported (with caveats) | Same fix and same `List<Struct>` caveat as Rust API. |
| **Storage Config** | Supported | `storage_options` dict passed to `DeltaTable()` or `write_deltalake()`. Keys are backend-specific (e.g., `AWS_ACCESS_KEY_ID`, `AZURE_STORAGE_ACCOUNT_KEY`, `GOOGLE_SERVICE_ACCOUNT`). Falls back to environment variables. |

---

## Known Limitations

1. **CDF write not implemented.** DML operations (write, merge, delete, update) do not produce CDF change-data files in `_change_data/`. Reads from existing CDF tables work, but new CDF rows are not emitted. Tracked in delta-rs issue #2095.

2. **Schema evolution with `List<Struct>` fields.** DataFusion-based schema merge fails for tables whose schema contains a list of struct fields (issue #3339). Workaround: manually manage schema before writing.

3. **`schema_mode="merge"` type coercion.** When merging schemas in Python, incompatible struct sub-field types may be silently coerced rather than rejected (issue #2642). This can cause silent data loss or type changes.

4. **CDF with schema evolution.** Batch CDF reads do not automatically handle schema evolution between versions. Non-additive schema changes (column renames, drops, type changes) between the start and end version will break CDF consumption.

5. **Concurrent S3 writes require DynamoDB.** Unlike Azure and GCS (which use conditional PUT), safe concurrent writes to S3 require a DynamoDB lock table. This is an operational dependency not present in other storage backends.

6. **Unity Catalog integration is experimental.** The `deltalake-catalog-unity` feature is marked `unity-experimental` and is not production-ready as of the research date.

7. **Python DataFusion requires separate installation.** To use `SessionContext.register_table_provider` in Python, the `datafusion` Python package must be installed separately alongside `deltalake`. The delta-rs Python package does not bundle the DataFusion Python bindings.

8. **MERGE disk spill.** Very large merge operations can exceed memory. Disk-spilling support was added in v1.5.0 but requires configuration; no automatic memory pressure management.

9. **No INSERT OVERWRITE via SQL.** While `insert_into` is supported through the `TableProvider` trait (Append + Overwrite modes), full SQL `INSERT OVERWRITE` semantics are dependent on DataFusion's SQL parser support, which may not cover all Delta-specific partition semantics.

---

## Source Links

- [delta-rs DataFusion integration docs](https://delta-io.github.io/delta-rs/integrations/delta-lake-datafusion/)
- [delta-rs Python usage docs](https://delta-io.github.io/delta-rs/python/usage.html)
- [delta-rs write operations docs](https://delta-io.github.io/delta-rs/usage/writing/)
- [delta-rs read CDF docs](https://delta-io.github.io/delta-rs/usage/read-cdf/)
- [delta-rs Python API reference](https://delta-io.github.io/delta-rs/python/api_reference.html)
- [deltalake crate on docs.rs (v0.31.1)](https://docs.rs/deltalake/latest/deltalake/)
- [DeltaTableProvider struct docs](https://docs.rs/deltalake/latest/deltalake/delta_datafusion/struct.DeltaTableProvider.html)
- [deltalake operations module](https://docs.rs/deltalake/latest/deltalake/operations/index.html)
- [delta-rs GitHub releases](https://github.com/delta-io/delta-rs/releases)
- [delta-rs DeepWiki overview](https://deepwiki.com/delta-io/delta-rs/1-overview)
- [CDF implementation tracking issue #2095](https://github.com/delta-io/delta-rs/issues/2095)
- [Schema merge List<Struct> issue #3339](https://github.com/delta-io/delta-rs/issues/3339)
- [schema_mode merge type coercion issue #2642](https://github.com/delta-io/delta-rs/issues/2642)
