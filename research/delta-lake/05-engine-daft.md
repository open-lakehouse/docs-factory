# Daft Delta Engine Coverage Report

**Engine:** Daft (Eventual-Inc/Daft)
**Python package:** `getdaft` with `[deltalake]` extras
**Official docs:** https://docs.daft.ai/en/stable/connectors/delta_lake/
**GitHub:** https://github.com/Eventual-Inc/Daft
**Researched:** 2026-03-27
**Minimum version tested:** 0.7.4+ (deltalake dependency ≥ 1.0.0 recommended)
**Dependency:** Requires the `deltalake` Python package (delta-rs); Daft uses it for metadata access while executing its own parallel I/O for data reads.

---

## Summary

Daft provides native Delta Lake integration via `daft.read_deltalake()` and `df.write_deltalake()`. The connector is built on top of the `deltalake` Python package (delta-rs) for metadata resolution, while Daft's own Rust-based I/O layer handles the actual Parquet reads in parallel across cores or a Ray cluster.

Read coverage is strong: full-table scans, partition pruning, file-level statistics pushdown (min/max on non-partition columns), integer and timestamp/string version-based time travel, and multi-cloud storage are all supported and tested. A `version` parameter accepted by `read_deltalake()` enables time travel by version number, RFC 3339 string, or `datetime` object.

Write coverage is more limited. Append and full-table overwrite (emitting correct `remove` actions since a bug was fixed in 2025) are supported, as is partitioned writing. Schema overwrite (`schema_mode="overwrite"`) is supported. However, `MERGE`, `UPDATE`, `DELETE` (row-level DML), Change Data Feed, OPTIMIZE, and VACUUM are not implemented in Daft; these operations would need to be performed through `deltalake` directly or another engine. Conditional (predicate) overwrite (replaceWhere) is also not yet implemented.

Deletion vectors and column mappings (name-id mapping) are open issues with no shipped implementation as of the research date; Daft raises a `NotImplementedError` when it encounters a table with deletion vectors unless the caller explicitly sets `ignore_deletion_vectors=True`.

The public roadmap issue (#2457) tracks outstanding items: deletion vectors, column mappings, partitioned writes to catalogs (Unity Catalog, AWS Glue), upserts/MERGE, and conditional overwrite.

---

## Operations Coverage

| Operation | Status | Notes |
|---|---|---|
| **Read (full table scan)** | ✅ Supported + documented | `daft.read_deltalake(uri)`. Parallel Parquet reads across all cores; Ray cluster for distributed workloads. Also available via `daft.sql("SELECT * FROM read_deltalake('...')")`. |
| **Read with partition pruning** | ✅ Supported + documented | Filters on partition columns skip non-matching files before any I/O. Tested in `test_table_read_pushdowns.py`. |
| **Read with file-level statistics pushdown** | ✅ Supported + documented | Min/max column statistics on non-partition columns are used to skip Parquet files. Both equality and range predicates supported. |
| **Read — column projection pushdown** | ✅ Supported + documented | `can_absorb_select()` returns True; only requested columns are decoded from Parquet. |
| **Read — limit pushdown (file-level)** | ✅ Supported + documented | Scan tasks stop enumerating files once `limit` rows are satisfied when no filter/partition pushdowns are active. |
| **Time travel by version number** | ✅ Supported + documented | `read_deltalake(uri, version=0)`. Integer version; raises `TableNotFoundError` for out-of-range versions. Tested. |
| **Time travel by timestamp (string/datetime)** | ✅ Supported + documented | `read_deltalake(uri, version="2024-01-01T00:00:00Z")` or `version=datetime(...)`. Delegates to `delta-rs` `load_as_version`. |
| **Storage config (S3, GCS, Azure, local)** | ✅ Supported + documented | `io_config: IOConfig` parameter accepts `S3Config`, `AzureConfig`, `GCSConfig`. DynamoDB locking (`dynamo_table_name`) supported for S3 concurrent writers. Automatic region detection for S3. |
| **Unity Catalog table reads** | ✅ Supported + documented | Accepts `UnityCatalogTable` as the `table` argument; overrides storage config from Unity Catalog credentials. |
| **Write / Append** | ✅ Supported + documented | `df.write_deltalake(uri, mode="append")`. Default mode. Returns a DataFrame of operations performed. |
| **Write / Full overwrite** | ✅ Supported + documented | `df.write_deltalake(uri, mode="overwrite")`. Emits `remove` actions for old files. (Bug where `remove` actions were missing was open as issue #6386 against 0.7.4; verify fix status against current release.) |
| **Write / Error if exists** | ✅ Supported + documented | `mode="error"`. Raises if table already exists. |
| **Write / Ignore if exists** | ✅ Supported + documented | `mode="ignore"`. No-op if table already exists. |
| **Write — partitioned tables** | ✅ Supported + documented | `partition_cols=["col1", "col2"]`. Tested for int, string, timestamp partition types. Binary partitioning marked `xfail` (not yet supported). |
| **Write — schema overwrite** | ✅ Supported + documented | `schema_mode="overwrite"` with `mode="overwrite"` replaces the table schema. |
| **Write — schema merge** | ❌ Not supported | `schema_mode="merge"` is documented as "currently not supported" in the docstring. |
| **Write — conditional overwrite (replaceWhere)** | ❌ Not supported | Open feature request #3853. Delta-rs supports this but Daft has not wired it through. |
| **Deletion vectors — read** | ❌ Not supported | `NotImplementedError` raised for tables with deletion vectors enabled, unless `ignore_deletion_vectors=True` is passed (which silently skips the DV check and may return stale rows). Tracked in #1954. |
| **Deletion vectors — write** | ❌ Not supported | Not implemented. Blocked historically by delta-rs (#1094); status in current delta-rs not confirmed. |
| **Column mappings (name-id mode)** | ❌ Not supported | Tables with `delta.columnMapping.mode=name` or `id` cannot be correctly read. Open issue #1955. |
| **MERGE (upsert)** | ❌ Not supported | No `merge()` API. Listed as a roadmap item in #2457 (both copy-on-write and deletion-vector-based paths). |
| **UPDATE (row-level)** | ❌ Not supported | No UPDATE API. Would require delegation to `deltalake` library directly. |
| **DELETE (row-level)** | ❌ Not supported | No DELETE API. Issue #1968 (closed as tracking umbrella) listed it; no Daft-native implementation shipped. |
| **Change Data Feed (CDF) — read** | ❌ Not supported | No `read_change_data_feed` or equivalent. Not mentioned in docs or roadmap. |
| **Change Data Feed (CDF) — enable/disable** | ❌ Not supported | Table property configuration possible indirectly via `configuration` param in `write_deltalake`, but CDF reads are not supported. |
| **VACUUM** | ❌ Not supported | Not part of Daft's API. Must be performed via `deltalake.DeltaTable(...).vacuum()` directly. |
| **OPTIMIZE / bin-packing** | ❌ Not supported | Not part of Daft's API. Must be performed via `deltalake.DeltaTable(...).optimize.compact()` directly. |
| **Z-ORDER clustering** | ❌ Not supported | Not part of Daft's API. Must be performed via `deltalake.DeltaTable(...).optimize.z_order(["col"])` directly. |
| **Schema evolution — add column (read)** | ✅ Supported (implicit) | Schema is read from the current Delta metadata version; added columns appear in the schema automatically. |
| **Schema evolution — add column (write)** | ⚠️ Supported but constrained | Only via `schema_mode="overwrite"` with a full overwrite. Schema merge mode is not supported. |
| **Schema evolution — drop/rename column** | ❌ Not supported | Requires column mapping, which is not yet implemented (#1955). |
| **Delta Sharing reads** | ❌ Not supported | Open feature request #4927. No implementation shipped. |
| **Write to Unity Catalog / AWS Glue** | ⚠️ Partial | `write_deltalake` accepts a `UnityCatalogTable` target. Full catalog registration for new tables is listed as an open roadmap item in #2457. |

---

## Known Limitations

1. **Deletion vectors block reads on modern tables.** Delta 3.x tables that use deletion vectors (the default for `DELETE`/`UPDATE` operations in Databricks Runtime 14+) cannot be read by Daft without `ignore_deletion_vectors=True`. With that flag set, deleted rows may appear in results. This is the single most significant compatibility gap for tables authored by Spark/Databricks.

2. **Column mapping not supported.** Tables that have undergone column renames or drops via column mapping (`columnMapping.mode=name`) will produce incorrect results or errors. This affects any Databricks-managed table that has had schema evolution applied without a full rewrite.

3. **No row-level DML.** MERGE, UPDATE, and DELETE are outside Daft's scope. Workflows requiring upserts must use delta-rs or Spark for the write step and Daft only for reads.

4. **Schema merge not implemented.** Appending DataFrames with new columns requires the caller to handle schema alignment before writing. `schema_mode="merge"` raises an error.

5. **Overwrite bug (issue #6386, Daft 0.7.4).** In that version, `mode="overwrite"` wrote new Parquet files without emitting `remove` actions for prior files, causing unbounded table growth. Verify the bug is fixed in the version being used before relying on overwrite semantics.

6. **Binary partition columns not supported.** Writing to Delta tables partitioned by a binary column is marked `xfail` in the test suite.

7. **Partition filter push-into-catalog not implemented.** Issue #1953 tracks pushing partition filters into the file URI fetch from the Delta log; currently all add-actions are fetched and filtered in Python, which can be slow for tables with many files.

8. **Delta Sharing not supported.** Reading through Delta Sharing endpoints is an open feature request (#4927).

---

## Source Links

- **Official connector docs:** https://docs.daft.ai/en/stable/connectors/delta_lake/
- **delta-rs integration page:** https://delta-io.github.io/delta-rs/integrations/delta-lake-daft/
- **`read_deltalake` source:** `daft/io/delta_lake/_deltalake.py` — `Eventual-Inc/Daft` on GitHub
- **`write_deltalake` source:** `daft/dataframe/dataframe.py` — `write_deltalake` method
- **Scan operator (pushdown, deletion vectors, time travel):** `daft/io/delta_lake/delta_lake_scan.py`
- **Write utilities:** `daft/io/delta_lake/delta_lake_write.py`
- **Delta Lake Support Roadmap:** https://github.com/Eventual-Inc/Daft/issues/2457
- **Deletion vectors issue:** https://github.com/Eventual-Inc/Daft/issues/1954
- **Column mappings issue:** https://github.com/Eventual-Inc/Daft/issues/1955
- **Conditional overwrite issue:** https://github.com/Eventual-Inc/Daft/issues/3853
- **Overwrite bug (remove actions):** https://github.com/Eventual-Inc/Daft/issues/6386
- **Delta Sharing request:** https://github.com/Eventual-Inc/Daft/issues/4927
- **Integration test — reads:** `tests/integration/delta_lake/test_table_read.py`
- **Integration test — pushdowns:** `tests/integration/delta_lake/test_table_read_pushdowns.py`
- **Integration test — writes:** `tests/integration/delta_lake/test_table_write.py`
- **deltalake 1.5.0 upgrade:** https://github.com/Eventual-Inc/Daft/issues/6503
