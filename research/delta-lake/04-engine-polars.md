# Delta Lake Operations Coverage — Polars Engine

**Engine version assessed:** Polars py-1.39.3 (released 2026-03-20)
**delta-rs Python bindings version:** python-v1.5.0 (released 2026-03-12)
**Research date:** 2026-03-27
**Scope:** Polars Python API (`read_delta`, `scan_delta`, `DataFrame.write_delta`, `LazyFrame.sink_delta`) and the delta-rs operations exposed through those APIs.

---

## Summary

Polars does **not** implement Delta Lake logic natively. All Delta protocol work — table metadata resolution, version/time-travel bookkeeping, write commits, MERGE, DELETE, UPDATE, VACUUM, OPTIMIZE, CDF, and schema evolution — is delegated entirely to the **`deltalake` Python package** (the delta-rs Python bindings). Polars contributes only the read path: after delta-rs resolves the file list for a given table version, Polars reads those Parquet files using its own `scan_parquet` engine with hive partitioning and deletion-vector support layered on top.

The result is a clear division of responsibility:

- **Polars-native:** column projection, row filter pushdown (via file-level statistics extracted from the Delta log), hive partition pruning, deletion vector application, lazy/streaming execution, credential provider abstraction.
- **delta-rs-delegated:** all write and DML operations (`write_deltalake`, `DeltaTable.merge`, `DeltaTable.delete`, `DeltaTable.update`), table maintenance (`vacuum`, `optimize.compact`, `optimize.z_order`), CDF (`load_cdf`), time travel version resolution (`load_as_version`), schema alteration (`alter.add_columns`), and schema evolution during write (`schema_mode`).

Polars' read path (`scan_delta`) underwent a significant refactor in py-1.38.0 (merged as rs-0.53.0) to use a Python dataset interface that enables incremental version refreshes and batch predicate pushdown from Delta log statistics. `sink_delta` (streaming sink for LazyFrame) was added in py-1.37.0 and remains marked **unstable**.

---

## Operations Coverage

| Operation | Status | Notes |
|---|---|---|
| **Read (eager)** `read_delta` | ✅ supported + documented | Eagerly collects a `DataFrame`. Internally calls `scan_delta().collect()`. Columns, version, storage_options, credential_provider, delta_table_options, use_pyarrow all supported. |
| **Read (lazy)** `scan_delta` | ✅ supported + documented | Returns a `LazyFrame`; Polars applies column projection and row predicate pushdown using Delta log file statistics (min/max/null_count per file). Partition pruning via hive schema. |
| **Write (create / error mode)** | ✅ supported + documented | `DataFrame.write_delta(target)` defaults to `mode="error"`. Delegates to `deltalake.write_deltalake`. |
| **Write (append)** | ✅ supported + documented | `mode="append"`. Documented with schema-mismatch caveat (raises if schema differs unless `schema_mode` is set). |
| **Write (overwrite)** | ✅ supported + documented | `mode="overwrite"`. Schema replacement requires passing `delta_write_options={"schema_mode": "overwrite"}`. |
| **Write (ignore)** | ✅ supported + documented | `mode="ignore"` is a no-op if the table already exists. |
| **Streaming sink** `sink_delta` | ⚠️ supported but unstable | `LazyFrame.sink_delta` added in py-1.37.0. Marked `@unstable()` in source; documented on API reference page since py-1.38.1. Supports same modes as `write_delta` except `merge` path is delegated identically. |
| **MERGE (upsert)** | ✅ supported + documented | `mode="merge"` returns a `deltalake.table.TableMerger` object. The `delta_merge_options` dict is passed directly to `DeltaTable.merge()`. Callers chain `.when_matched_update_all()` / `.when_not_matched_insert_all()` etc. on the returned object. Fully delegated to delta-rs. |
| **DELETE** | ⚠️ supported but undocumented in Polars docs | Not exposed as a Polars method. Users must obtain the `DeltaTable` object via `deltalake.DeltaTable(path)` and call `.delete(predicate=...)` directly. delta-rs supports predicate-based and full-table delete. |
| **UPDATE** | ⚠️ supported but undocumented in Polars docs | Same as DELETE — no Polars wrapper. Users call `DeltaTable.update(updates=..., predicate=...)` directly via delta-rs. |
| **Time travel (version number)** | ✅ supported + documented | `version=<int>` accepted by both `read_delta` and `scan_delta`. Resolved via `deltalake.DeltaTable(path, version=n)`. |
| **Time travel (timestamp)** | ✅ supported + documented | `version=<datetime>` or `version=<ISO string>` accepted. Resolved via `DeltaTable.load_as_version(timestamp)` in delta-rs. |
| **Predicate pushdown** | ✅ supported + documented | Two layers: (1) Polars extracts per-file min/max/null_count statistics from Delta log add-actions and uses them for batch file skipping. (2) When `use_pyarrow=True`, a PyArrow predicate string is pushed down to the PyArrow dataset scan. Polars-native path (default) does not push SQL predicates to delta-rs; file-level stats skipping is the only pushdown mechanism. |
| **Partition pruning** | ✅ supported + documented | Hive partition columns are detected automatically from `DeltaTable.metadata().partition_columns` and passed as `hive_schema` to `scan_parquet`. |
| **Deletion Vectors** | ✅ supported + documented | Requires `deltalake >= 1.4.2`. Polars reads deletion vector bitmaps per-file via a callback into delta-rs and applies them as row-level filters during Parquet scan. Reader feature `deletionVectors` is explicitly added to `SUPPORTED_READER_FEATURES`. |
| **Change Data Feed (CDF)** | ⚠️ supported but undocumented in Polars docs | No Polars wrapper. Users call `DeltaTable.load_cdf(starting_version=..., ending_version=...)` which returns an Arrow `RecordBatchReader`; callers convert to Polars via `pl.from_arrow()`. CDF must first be enabled on the table via `delta_write_options={"configuration": {"delta.enableChangeDataFeed": "true"}}`. |
| **VACUUM** | ⚠️ supported but undocumented in Polars docs | No Polars wrapper. Users call `DeltaTable.vacuum(retention_hours=..., dry_run=False)` directly via delta-rs. |
| **OPTIMIZE (compaction)** | ⚠️ supported but undocumented in Polars docs | No Polars wrapper. Users call `DeltaTable.optimize.compact(...)` or `DeltaTable.optimize.z_order(...)` directly via delta-rs. |
| **Schema evolution (merge columns on write)** | ✅ supported + documented | Passing `delta_write_options={"schema_mode": "merge"}` with `mode="append"` merges new columns. Tested and documented in both the API docstring and test suite (including nested struct evolution). |
| **Schema evolution (overwrite schema)** | ✅ supported + documented | `delta_write_options={"schema_mode": "overwrite"}` with `mode="overwrite"`. The older `overwrite_schema=True` parameter is deprecated since py-0.20.14 and will warn. |
| **Schema evolution (add columns via alter)** | ⚠️ supported but undocumented in Polars docs | No Polars wrapper. Users call `DeltaTable.alter.add_columns(fields=[...])` via delta-rs. |
| **Storage configuration (S3 / GCS / Azure)** | ✅ supported + documented | `storage_options` dict accepted by all four Polars Delta functions. Keys follow `object_store` crate conventions (AWS, GCS, Azure variants). Documented with per-cloud examples in docstrings. |
| **Credential provider** | ⚠️ supported but unstable | `credential_provider` parameter accepted by all four functions. Marked `@unstable()` in Polars. Auto-detection (`"auto"`) attempts to discover cloud credentials automatically. |
| **PyArrow fallback path** | ✅ supported + documented | `use_pyarrow=True` on read/scan bypasses Polars' native Parquet engine and uses PyArrow dataset reads. Allows `fsspec` filesystems and PyArrow predicates via `pyarrow_options`. |
| **Unsupported data types** | ❌ not supported | `Null` and `Time` Polars dtypes cannot be written to Delta (raises `TypeError`). `Categorical` is silently cast to `String`. |
| **Non-nullable columns** | ⚠️ workaround required | Polars columns are always nullable. Writing non-nullable Delta columns requires passing a custom `pyarrow.Schema` via `delta_write_options={"schema"}`. |
| **LakeFS path rewrite** | ✅ supported (undocumented) | `scan_delta` contains a special case that rewrites `lakefs://` paths to `s3://` for the Parquet scan. Not mentioned in user-facing docs. |
| **RESTORE** | ⚠️ supported but undocumented in Polars docs | No Polars wrapper. Users call `DeltaTable.restore(target=..., ignore_missing_files=...)` directly via delta-rs. |
| **Constraints (CHECK / NOT NULL)** | ❌ not supported via Polars | No Polars wrapper. delta-rs exposes `DeltaTable.alter.add_constraint(...)` but Polars does not surface it. |
| **Writer properties (compression etc.)** | ✅ supported + documented | Passed via `delta_write_options={"writer_properties": deltalake.WriterProperties(compression="zstd")}`. Documented in write_delta and sink_delta docstrings. |

---

## Known Limitations

1. **No SQL DML surface.** Polars exposes no `DELETE`, `UPDATE`, `RESTORE`, `VACUUM`, or `OPTIMIZE` methods. All table-maintenance operations require the user to import `deltalake` directly and operate on a `DeltaTable` object. This creates a two-library workflow that is not documented in the Polars user guide.

2. **CDF has no first-class Polars integration.** `DeltaTable.load_cdf()` returns an Arrow `RecordBatchReader` that must be manually converted to a Polars DataFrame. There is no `scan_delta_cdf()` or equivalent lazy API.

3. **`sink_delta` is unstable.** The streaming LazyFrame sink (`sink_delta`) is marked `@unstable()` and may change without a deprecation cycle. It was introduced in py-1.37.0 and first appeared in the API reference docs in py-1.38.1.

4. **Predicate pushdown is file-level only (native path).** The default (non-PyArrow) scan path uses Delta log file statistics for row-group skipping but does not push SQL predicates into the Parquet reader's row-group filter. Fine-grained pushdown requires `use_pyarrow=True`.

5. **Unsupported Polars types.** `Null` and `Time` cannot be written to Delta tables. `Categorical` is silently coerced to `String` — this is documented but may surprise users.

6. **`overwrite_schema` parameter deprecated.** The `overwrite_schema=True` shorthand was deprecated in py-0.20.14. Correct usage now requires `delta_write_options={"schema_mode": "overwrite"}`.

7. **Reader protocol version restriction.** Polars only supports Delta reader versions 1 and 3 (with a specific allowlist of reader features: `deletionVectors`). Tables requiring other reader v3 features (e.g., `columnMapping`, `v2Checkpoint`, `timestampNtz`) will raise a `DeltaProtocolError`. Column mapping / rename-drop is therefore not readable without the PyArrow fallback path.

8. **No Delta Lake user guide page.** The Polars documentation has no dedicated user guide page for Delta Lake (the `/user-guide/io/` section has no `delta-lake.md`). All documentation lives in API reference docstrings only.

9. **`deltalake` is an optional dependency.** Polars does not install `deltalake` by default; users must `pip install deltalake` separately. This is documented via runtime `ModuleNotFoundError` but is not called out prominently in the API reference.

---

## Source Links

- **Polars Delta IO source** — [`py-polars/src/polars/io/delta/functions.py`](https://github.com/pola-rs/polars/blob/main/py-polars/src/polars/io/delta/functions.py) — `read_delta` and `scan_delta` implementations
- **Polars DeltaDataset** — [`py-polars/src/polars/io/delta/_dataset.py`](https://github.com/pola-rs/polars/blob/main/py-polars/src/polars/io/delta/_dataset.py) — Python dataset interface, file listing, statistics extraction, deletion vector support
- **Polars Delta utils** — [`py-polars/src/polars/io/delta/_utils.py`](https://github.com/pola-rs/polars/blob/main/py-polars/src/polars/io/delta/_utils.py) — `_get_delta_lake_table`, `_extract_table_statistics_from_delta_add_actions`
- **Polars `write_delta` method** — [`py-polars/src/polars/dataframe/frame.py`](https://github.com/pola-rs/polars/blob/main/py-polars/src/polars/dataframe/frame.py) — `DataFrame.write_delta`
- **Polars `sink_delta` method** — [`py-polars/src/polars/lazyframe/frame.py`](https://github.com/pola-rs/polars/blob/main/py-polars/src/polars/lazyframe/frame.py) — `LazyFrame.sink_delta`
- **Polars Delta test suite** — [`py-polars/tests/unit/io/test_delta.py`](https://github.com/pola-rs/polars/blob/main/py-polars/tests/unit/io/test_delta.py) — 35+ test functions covering read, write, merge, schema evolution, time travel, statistics, partitioning
- **Polars Deletion Vector tests** — [`py-polars/tests/unit/io/test_delta_deletion_vector.py`](https://github.com/pola-rs/polars/blob/main/py-polars/tests/unit/io/test_delta_deletion_vector.py)
- **delta-rs Python bindings `DeltaTable`** — [`python/deltalake/table.py`](https://github.com/delta-io/delta-rs/blob/main/python/deltalake/table.py) — `vacuum`, `delete`, `update`, `merge`, `optimize`, `restore`, `load_cdf`, `alter.add_columns`
- **delta-rs `write_deltalake`** — [`python/deltalake/__init__.py`](https://github.com/delta-io/delta-rs/blob/main/python/deltalake/__init__.py) — top-level write function used by all Polars write paths
- **Polars API reference — Delta Lake section** — [`https://docs.pola.rs/api/python/stable/reference/io.html#delta-lake`](https://docs.pola.rs/api/python/stable/reference/io.html#delta-lake)
- **delta-rs API reference — DeltaTable** — [`https://delta-io.github.io/delta-rs/api/delta_table/`](https://delta-io.github.io/delta-rs/api/delta_table/)
- **Polars release notes referencing Delta** — py-1.38.0: scan_delta refactor to Python dataset interface + file statistics pushdown; py-1.37.0: `sink_delta` introduction; py-1.38.1: `sink_delta` added to API reference
