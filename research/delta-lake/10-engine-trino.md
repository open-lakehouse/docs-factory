# Trino Delta Lake Engine Coverage

## Summary

The Trino Delta Lake connector (plugin `trino-delta-lake`) provides full read and write access to Delta Lake tables stored on S3, Azure ADLS Gen2, GCS, and HDFS, using HMS or AWS Glue as the metastore. As of Trino 480, the connector supports all core DML operations (INSERT, DELETE, UPDATE, MERGE), time travel by both version and timestamp, schema evolution, VACUUM, and OPTIMIZE. It is a mature open-source alternative to Databricks' own runtime for querying Delta Lake tables, with active product test coverage against Databricks Runtime releases; however, several advanced Delta protocol features (liquid clustering, managed commits, UniForm) are not yet supported.

## Operations Coverage

| Operation | Status | Notes |
|-----------|--------|-------|
| Read | ✅ | Full SELECT support; reads Delta transaction log natively to detect external changes; partition pruning, dynamic filtering, and projection pushdown supported |
| Write / Append | ✅ | INSERT and INSERT INTO ... SELECT fully supported; fault-tolerant execution supported for writes; ZSTD compression by default |
| Overwrite | ✅ | `CREATE OR REPLACE TABLE` supported as atomic table replacement, creating a new snapshot in table history |
| DELETE | ✅ | DELETE DML supported; can use deletion vectors when `deletion_vectors_enabled` is set on the table |
| UPDATE | ✅ | UPDATE DML supported; listed explicitly in data management documentation |
| MERGE | ✅ | MERGE DML supported; listed explicitly alongside INSERT/DELETE/UPDATE |
| Time travel (by version) | ✅ | `FOR VERSION AS OF <n>` syntax supported; version numbers are queryable via the `$history` metadata table |
| Time travel (by timestamp) | ✅ | `FOR TIMESTAMP AS OF TIMESTAMP '...'` syntax supported; also accepts `DATE` literals |
| Schema evolution | ✅ | Safe column add, drop, and rename for non-nested structures via ALTER TABLE; schema is read automatically from transaction log when changed by external systems |
| VACUUM | ✅ | `CALL system.vacuum(schema, table, retention)` procedure; minimum retention controlled by `delta.vacuum.min-retention` (default 7 days) |
| OPTIMIZE | ✅ | `ALTER TABLE ... EXECUTE optimize` supported with optional `file_size_threshold` parameter and WHERE clause filtering by partition or metadata columns |
| Storage config | ✅ | Azure ADLS Gen2, GCS, S3 (with conditional writes via `delta.s3.transaction-log-conditional-writes.enabled`), and HDFS all supported; legacy support deprecated |
| Catalog integration | ✅ | Hive Metastore Service (HMS) via Thrift and AWS Glue both supported as metastores; `register_table` / `unregister_table` procedures available |
| **Protocol: deletion vectors** | ✅ | Readers and writers; enabled per-table via `deletion_vectors_enabled` table property or globally via `delta.deletion-vectors-enabled` config; listed in the official table features matrix |
| **Protocol: column mapping** | ✅ | Readers and writers; `column_mapping_mode` table property supports `ID`, `NAME`, and `NONE` modes; listed in official table features matrix |
| **Protocol: liquid clustering** | ❌ | Not supported for write; Trino can read tables written with liquid clustering (PR #22330 merged June 2024) but write support is tracked as an open feature request (issue #22811, open as of mid-2025); no official docs mention |
| **Protocol: managed commits** | ❌ | Not documented or mentioned in Trino 480 docs; no merged PRs found; `in-commit timestamps` are surfaced in `$history` table only for reading purposes |
| **Protocol: UniForm** | ❌ | Not supported or documented; UniForm (Iceberg compatibility V1 & V2 via Delta table feature) is listed as "readers only" in the table features matrix — Trino can read tables that have UniForm enabled but cannot write UniForm metadata |

## Known Limitations

- **Liquid clustering write not supported**: Trino cannot create or write to liquid-clustered Delta tables; only reading such tables is possible as of Trino 480. Feature request open (GitHub issue #22811).
- **Managed commits (coordinated commits) not supported**: Trino has no support for the Delta managed-commit protocol feature. Tables using managed commits from Databricks or other engines cannot be safely written from Trino.
- **UniForm write not supported**: Trino cannot write or maintain UniForm (Iceberg-compatible) metadata. Tables can be queried as Delta tables even if UniForm is enabled, but Trino will not update Iceberg metadata on write.
- **Shallow clone creation not supported**: Trino can read and write to existing shallow cloned tables but cannot create shallow clones itself.
- **S3 concurrent write risk (legacy mode)**: When `delta.s3.transaction-log-conditional-writes.enabled` is `false`, write collision detection against non-Trino engines is disabled; concurrent writes from Databricks or other engines can cause data corruption.
- **ALTER TABLE RENAME TO restricted**: Only supported for external tables or tables backed by a metastore that does not perform object storage operations (e.g., AWS Glue); not available for managed HMS tables in the general case.
- **Type widening (readers only)**: Delta Lake type widening is supported for reading only; Trino cannot write type-widened schemas.
- **V2 Checkpoint (readers only)**: Trino can read tables with V2 checkpoints but does not write them.
- **Databricks Runtime compatibility ceiling**: Explicitly tested against DBR 7.3 LTS through 17.3 LTS; tables written by unreleased or older DBR versions outside this range may behave unexpectedly.
- **Schema evolution limited for nested types**: Column add, drop, and rename are only supported for non-nested structures; nested struct column evolution is not documented as supported.

## Source Links

| Source | URL |
|--------|-----|
| Trino 480 Delta Lake connector documentation | https://trino.io/docs/current/connector/delta-lake.html |
| Trino Delta Lake plugin source (GitHub) | https://github.com/trinodb/trino/tree/master/plugin/trino-delta-lake |
| Trino Delta Lake plugin developer README | https://github.com/trinodb/trino/blob/master/plugin/trino-delta-lake/README.md |
| GitHub issue: Add Support For Liquid Clustering Delta lake | https://github.com/trinodb/trino/issues/22811 |
| GitHub PR: Test reading liquid clustering tables in Delta Lake (merged) | https://github.com/trinodb/trino/pull/22330 |
| GitHub PR: Support retrieving clustering information of Delta Lake tables | https://github.com/trinodb/trino/pull/27052 |
| Delta Lake protocol specification (in-commit timestamps) | https://github.com/delta-io/delta/blob/master/protocol.md#in-commit-timestamps |
