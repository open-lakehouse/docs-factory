# Apache Flink Delta Lake Engine Coverage

## Summary

The Flink/Delta connector is a JVM library for reading and writing Delta tables from Apache Flink applications, built on top of Delta Standalone and providing exactly-once delivery guarantees for streaming writes via Flink's checkpoint mechanism. The connector is streaming-first in design: the `DeltaSink` supports append-only streaming and batch writes, while the `DeltaSource` supports both bounded (batch) and continuous (streaming) modes. As of Delta 4.0 (released June 2025), the Standalone-based Flink connector has been formally sunsetted and moved to maintenance mode; it will not ship as part of the 4.x release series. A replacement Kernel-based connector targeting Flink 2.x is tracked in GitHub issue #4586 but has not yet shipped. The current connector (latest release: 3.3.2, May 2025) only supports Flink 1.16.1 and above within the 1.x lineage — Flink 2.0+ is incompatible due to a removed API (`org.apache.flink.api.connector.sink.Sink`), tracked in GitHub issue #4793.

## Operations Coverage

| Operation | Status | Notes |
|-----------|--------|-------|
| Read (batch) | ✅ | `DeltaSource.forBoundedRowData` — reads full table snapshot; supports column projection |
| Streaming read (source) | ✅ | `DeltaSource.forContinuousRowData` — polls Delta log for new versions; append-only by default |
| Write / Append (streaming sink) | ✅ | `DeltaSink` — append mode only via DataStream API and SQL `INSERT INTO` |
| Exactly-once streaming write | ✅ | Achieved via Flink checkpoint mechanism; idempotent commits to Delta log through `DeltaGlobalCommitter` |
| Overwrite | ❌ | Not supported; FAQ explicitly states only append mode is available |
| DELETE | ❌ | No DML execution via Flink; must be performed by another engine (e.g. Spark) |
| UPDATE | ❌ | No DML execution via Flink; must be performed by another engine |
| MERGE | ❌ | No DML execution via Flink; foreachBatch-style CDC workaround requires another engine for the actual merge |
| CDC via foreachBatch | ⚠️ Partial | Continuous source can consume incremental changes with `ignoreChanges=true`, but produces reprocessed rows (no true CDC record semantics); actual MERGE must be applied by another engine |
| Time travel (by version) | ✅ | Bounded: `versionAsOf(n)`; Continuous: `startingVersion(n)` |
| Time travel (by timestamp) | ✅ | Bounded: `timestampAsOf("...")` ; Continuous: `startingTimestamp("...")` |
| Schema evolution | ⚠️ Partial | Sink supports `withMergeSchema(true)` for additive schema changes; removing columns causes commit failure; no automatic schema evolution on reads |
| VACUUM | ❌ | Not supported by Flink connector |
| OPTIMIZE | ❌ | Not supported by Flink connector |
| Storage config | ✅ | Hadoop `Configuration` object passed at source/sink creation; S3 requires dual-prefix config (`flink.hadoop.fs.s3a.*` and `fs.s3a.*`); multi-cluster S3 via DynamoDB log store supported |
| Catalog integration | ✅ (SQL only) | `DeltaCatalog` required for all SQL/Table API usage; wraps `in-memory` or `hive` decorated catalog; DDL reflected in `_delta_log`; SQL `SELECT` and `INSERT INTO` supported |
| **Protocol: deletion vectors** | ❌ | Not supported; reading tables with `enableDeletionVectors=true` fails with `InvalidProtocolVersionException` — Delta Standalone only understands protocol (1,2), not (3,7). Tracked in issue #2874. |
| **Protocol: CDF / changeDataFeed** | ❌ | Change Data Feed is not surfaced through the Flink connector; the continuous source exposes only added files, not the CDF `_change_data` stream |
| **Protocol: column mapping** | ❌ | Not supported via the Standalone-based connector; column mapping requires Delta Kernel, which the current connector does not use for reads |

## Flink Version Compatibility

The connector version history and supported Flink versions are:

| Connector version | Flink version range |
|---|---|
| 0.4.x (sink only) | 1.12.0 – 1.14.5 |
| 0.5.0 | 1.13.0 – 1.13.6 |
| 0.6.0 | >= 1.15.3 |
| 3.0.0 – 3.3.2 | >= 1.16.1 |

The latest release is **3.3.2** (May 2025), built on Flink 1.16.1. **Flink 2.0 is not supported.** Flink 2.0 removed the `org.apache.flink.api.connector.sink.Sink` interface that the `DeltaSink` implements, causing a hard API incompatibility. This is tracked in [GitHub issue #4793](https://github.com/delta-io/delta/issues/4793) ("Add Support for Flink 2.0.0 in Delta Sink Connector") and was open with no fix as of the information available. A separate and longer-horizon effort, [GitHub issue #4586](https://github.com/delta-io/delta/issues/4586), proposes building a brand-new Flink connector on Delta Kernel specifically targeting Flink 2.0; a design document exists but implementation has not shipped. As of Delta 4.0.0 (June 2025), the Standalone-based connector is in maintenance mode and will not appear in 4.x releases — only critical security fixes and high-severity bugs will be patched in the 3.x series.

## Mixed-Add-and-Remove-Action Limitation

The Flink continuous source reads Delta table changes by inspecting the transaction log for new commits and processing the files listed in `AddFile` actions. When a commit produced by another engine (e.g., a Spark `UPDATE`, `DELETE`, or `MERGE`) contains both `AddFile` and `RemoveFile` actions in the same transaction — as all row-level DML operations do — the Flink streaming source will throw an error by default, because it cannot cleanly represent the removal semantics. The connector provides two escape hatches: setting `ignoreDeletes=true` allows the source to skip versions that only remove files (i.e., pure deletes), and setting `ignoreChanges=true` allows the source to process versions containing mixed add-and-remove actions by treating all added files as new data. The latter option causes duplicate processing: for an `UPDATE` that rewrites a Parquet file, every row in the new file is emitted downstream regardless of whether it was actually changed. This means the streaming source cannot provide true change-data semantics for tables that receive DML from other engines; at best it provides an at-least-once delivery of the post-change row set for affected files. Tables written exclusively by `DeltaSink` (append-only) are unaffected by this limitation.

## Known Limitations

- **Flink 2.0+ incompatible**: `DeltaSink` uses the removed `Sink` (v1) interface; no fix shipped as of 3.3.2.
- **Append-only sink**: Only `INSERT INTO` / append semantics; no overwrite, upsert, or delete through the connector.
- **No DML operations**: DELETE, UPDATE, MERGE, VACUUM, and OPTIMIZE must be performed by another engine.
- **Deletion vector tables unreadable**: Tables created or modified with `enableDeletionVectors=true` cause `InvalidProtocolVersionException` because Delta Standalone only supports protocol (1,2).
- **No CDF streaming**: Change Data Feed is not exposed; the continuous source emits added-file content only.
- **No column mapping support**: Tables using column mapping (required for some schema evolution and Iceberg compatibility features) cannot be read.
- **Azure Blob Storage write unsupported**: Due to a Flink class-shading issue (FLINK-17444); Azure Data Lake Gen2 is supported from Flink 1.17.
- **Schema ALTER via SQL is limited**: Only table property changes and renames are supported; column add/drop and partition column changes are not.
- **SQL API requires Delta Catalog**: Using any other Flink catalog for Delta tables causes SQL job failure.
- **Maintenance mode**: The Standalone-based connector will not receive feature development; only security and critical bug fixes in the 3.x series.
- **DataStream API only for full feature set**: Table/SQL API support was added in 3.0.0 but has more restrictions than the DataStream API.

## Source Links

| Source | URL |
|--------|-----|
| Flink connector README (branch-3.3) | https://github.com/delta-io/delta/blob/branch-3.3/connectors/flink/README.md |
| Delta Lake official Flink integration docs | https://docs.delta.io/latest/flink-integration.html |
| Blog: Writing to Delta Lake from Apache Flink (sink) | https://delta.io/blog/2022-04-27-writing-to-delta-lake-from-apache-flink/ |
| Blog: Apache Flink Source Connector for Delta Lake tables | https://delta.io/blog/2022-08-11-apache-flink-source-connector-for-delta-lake-tables/ |
| GitHub issue #4793 — Flink 2.0 sink incompatibility | https://github.com/delta-io/delta/issues/4793 |
| GitHub issue #4586 — Kernel-based Flink connector (Flink 2.0) | https://github.com/delta-io/delta/issues/4586 |
| GitHub issue #2874 — Deletion vector protocol version error | https://github.com/delta-io/delta/issues/2874 |
| Delta 4.0.0 release notes — Standalone/Flink sunset announcement | https://github.com/delta-io/delta/releases/tag/v4.0.0 |
| Delta 3.1.0 release notes — Flink Kernel startup improvement | https://github.com/delta-io/delta/releases/tag/v3.1.0 |
| Decodable blog — Adventures with Apache Flink and Delta Lake | https://www.decodable.co/blog/adventures-with-apache-flink-and-delta-lake |
| Microsoft Learn — Flink/Delta connector on HDInsight AKS | https://learn.microsoft.com/en-us/azure/hdinsight-aks/flink/use-flink-delta-connector |
