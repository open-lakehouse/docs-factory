# PrestoDB Delta Lake Engine Coverage

## Summary

PrestoDB's Delta Lake connector (`presto-delta`) is a read-only connector that enables querying Delta Lake tables via Presto's SQL interface without any write, DML, or maintenance capabilities. The connector is built on the Delta Kernel Java API (version 3.3.2) for all log-level operations — snapshot resolution, file listing, and partition-column predicate pruning — while delegating physical Parquet reads to Presto's own Parquet reader stack. Time travel by both version and timestamp is supported via a table-name suffix convention (`table@v<n>` / `table@t<timestamp>`). The connector is used in production at Meta/Facebook scale and was contributed to the open-source PrestoDB project by the Meta engineering team.

## Operations Coverage

| Operation | Status | Notes |
|-----------|--------|-------|
| Read | ✅ | Full Parquet read with partition pruning and predicate pushdown into Parquet row groups. Supports S3, Azure Data Lake, and HDFS via the Hive connector storage layer. Nested-column dereference pushdown (`delta.parquet-dereference-pushdown-enabled`, default `true`) is available. |
| Write / Append | ❌ | Read-only connector — the module exposes only `ConnectorPageSourceProvider` with no `ConnectorPageSinkProvider`; no write transaction protocol is implemented. |
| Overwrite | ❌ | Read-only connector — no write path exists; INSERT OVERWRITE is not supported. |
| DELETE | ❌ | Read-only connector — DML is not supported; only SELECT and DDL for metastore registration is available. |
| UPDATE | ❌ | Read-only connector — DML is not supported. |
| MERGE | ❌ | Read-only connector — DML is not supported. |
| Time travel (by version) | ✅ | Supported via table-name suffix: `SELECT * FROM delta.db."table@v4"`. Internally delegates to `Table.getSnapshotAsOfVersion()` in Delta Kernel. |
| Time travel (by timestamp) | ✅ | Supported via table-name suffix: `SELECT * FROM delta.db."table@t2021-11-18 09:45"`. Internally delegates to `Table.getSnapshotAsOfTimestamp()` in Delta Kernel. Timestamp format: `YYYY[-MM[-DD[ HH[:mm[:ss]]]]]` in UTC. |
| Schema evolution | ⚠️ | Schema is read from the Delta log snapshot at query time via Delta Kernel, so the current logical schema (including added or renamed columns via column mapping) is always reflected. However, the connector cannot perform ALTER TABLE ADD/DROP COLUMN — schema changes must be made externally by a write-capable engine. Missing columns are returned as `null`. |
| VACUUM | ❌ | Read-only connector — VACUUM is not implemented; old file cleanup must be performed by a write-capable engine such as Spark. |
| OPTIMIZE | ❌ | Read-only connector — file compaction and Z-ordering are not implemented. |
| Storage config | ✅ | Reuses the Hive connector's storage modules for S3, Azure Data Lake Storage (ADLS), Glue metastore, and HDFS. Configuration options are identical to the Hive connector (`hive.metastore.uri`, S3/ADLS credentials, etc.). Path-based table access is also supported: `SELECT * FROM delta."$path$"."s3://bucket/path/table"`. |
| Catalog integration | ✅ | Hive Metastore (HMS) is the primary catalog; tables are registered via `CREATE TABLE … WITH (external_location = '…')` using a dummy column (schema is resolved from the Delta log). AWS Glue Metastore is supported via the Hive connector's Glue integration. Path-based queries bypass the metastore entirely. |
| **Protocol: deletion vectors** | ⚠️ | Delta Kernel 3.3.2 defines deletion vector handling in `Scan.transformPhysicalData()`, but the `DeltaPageSourceProvider` does **not** call `transformPhysicalData` — it reads Parquet files directly. Deletion-vector-enabled tables may return logically deleted rows. This is a known gap between what the Kernel library supports and what the connector exercises. |
| **Protocol: column mapping** | ⚠️ | Delta Kernel 3.3.2 supports column mapping mode (name and id modes) in log replay, so the logical schema is resolved correctly. Physical Parquet column lookup in `DeltaPageSourceProvider` uses the logical column name (`getParquetTypeByName`); behavior against `id`-mode-mapped tables has not been confirmed to be fully correct in all edge cases. |
| **Protocol: liquid clustering** | ❌ | Liquid clustering (Z-ordered file layout without partition columns) is a write-side feature. The connector will read liquid-clustered tables as regular Delta tables but cannot exploit clustering-based file skipping beyond standard partition pruning, and cannot perform clustering operations. |

## Delta Kernel Integration

PrestoDB's Delta connector pins `io.delta:delta-kernel-api` and `io.delta:delta-kernel-defaults` at version **3.3.2** (set via the Maven property `io.delta.delta-kernel-api.version` in `presto-delta/pom.xml`). The connector uses Delta Kernel's `DefaultEngine` (backed by Hadoop `FileSystem`) for all log-plane operations: loading the table object via `Table.forPath()`, resolving snapshots via `getLatestSnapshot()`, `getSnapshotAsOfVersion()`, and `getSnapshotAsOfTimestamp()`, and enumerating scan files via `Snapshot.getScanBuilder().build().getScanFiles()`. The Kernel's partition-column predicate evaluation is used by `DeltaExpressionUtils.iterateWithPartitionPruning()` to prune scan files before they are turned into Presto splits. What the Kernel provides: protocol-compliant log replay, checkpoint reading, snapshot isolation, column-mapping-aware schema resolution, and partition-based file filtering. What the connector does not use from the Kernel: the write API (`Transaction`, `TransactionBuilder`), the `Scan.transformPhysicalData()` API responsible for applying deletion vectors and finalising logical output, and any checkpointing utilities. The absence of `transformPhysicalData()` usage means deletion-vector-enabled tables are a correctness risk.

## Known Limitations

- **Read-only**: No INSERT, UPDATE, DELETE, MERGE, VACUUM, or OPTIMIZE support of any kind. Schema-modification DDL is also not supported.
- **Deletion vectors not applied**: The connector reads Parquet files directly rather than routing data through `Scan.transformPhysicalData()`. Tables with deletion vectors enabled may surface rows that should be logically deleted.
- **Parquet-only**: Only the Parquet data format is supported; Delta tables written with alternative formats will throw `DELTA_UNSUPPORTED_DATA_FORMAT`.
- **Column mapping (id mode) edge cases**: Physical Parquet column lookup by name may not resolve correctly for tables that use `id`-mode column mapping where the physical name differs from the logical name.
- **Liquid clustering skipping**: No clustering-aware file skipping; all files are enumerated and only partition-column predicates are used to prune splits.
- **No managed table creation**: `CREATE TABLE` without `external_location` throws `NOT_SUPPORTED`; only external tables are allowed.
- **Hive Metastore dependency**: Table discovery requires HMS (or Glue); there is no native Delta log-based discovery independent of a metastore, except via the `$path$` schema workaround.
- **No Iceberg/UniForm read**: The connector does not expose UniForm or Iceberg-compat table formats even if the Delta table has them enabled.

## Source Links

| Source | URL |
|--------|-----|
| Official docs (Presto 0.296) | https://prestodb.io/docs/current/connector/deltalake.html |
| presto-delta module root | https://github.com/prestodb/presto/tree/master/presto-delta |
| pom.xml (Delta Kernel 3.3.2 dependency) | https://github.com/prestodb/presto/blob/master/presto-delta/pom.xml |
| DeltaClient.java (Kernel usage: snapshot, file listing) | https://github.com/prestodb/presto/blob/master/presto-delta/src/main/java/com/facebook/presto/delta/DeltaClient.java |
| DeltaSplitManager.java (file enumeration + partition pruning) | https://github.com/prestodb/presto/blob/master/presto-delta/src/main/java/com/facebook/presto/delta/DeltaSplitManager.java |
| DeltaPageSourceProvider.java (Parquet read, no transformPhysicalData) | https://github.com/prestodb/presto/blob/master/presto-delta/src/main/java/com/facebook/presto/delta/DeltaPageSourceProvider.java |
| DeltaTableName.java (time travel syntax) | https://github.com/prestodb/presto/blob/master/presto-delta/src/main/java/com/facebook/presto/delta/DeltaTableName.java |
| DeltaMetadata.java (connector metadata, no write ops) | https://github.com/prestodb/presto/blob/master/presto-delta/src/main/java/com/facebook/presto/delta/DeltaMetadata.java |
| Delta Kernel User Guide | https://github.com/delta-io/delta/blob/master/kernel/USER_GUIDE.md |
| Delta Kernel 3.3.2 release notes | https://github.com/delta-io/delta/releases/tag/v3.3.2 |
