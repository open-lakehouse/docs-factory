# Delta UniForm Cross-Format Interoperability

**Researched:** 2026-03-27

---

## Summary

Delta UniForm (Universal Format) is a Delta Lake feature that automatically generates Apache Iceberg (and optionally Apache Hudi) metadata alongside every Delta write, enabling Iceberg-native and Hudi-native clients to read Delta tables without format conversion or data duplication. The metadata generation happens asynchronously after each Delta commit using the same compute cluster that completed the transaction, so Delta write latency is negligible. UniForm's strategic significance is that it removes the "format tax" on open lakehouse architectures: a single copy of data in Delta format can serve Delta clients, Iceberg clients (Spark+Iceberg, Trino, Snowflake, BigQuery, etc.), and Hudi clients simultaneously, without ETL pipelines or dual-ingestion.

---

## UniForm Protocol Requirements

| Requirement | Value | Notes |
|---|---|---|
| Minimum writer protocol version | 7 | Required for all IcebergCompat features |
| Minimum reader protocol version | 2 | OR reader version ≥ 3 with `columnMapping` in `readerFeatures` |
| Required writer feature (current) | `icebergCompatV2` | Enabled via table property `delta.enableIcebergCompatV2 = true`; current production standard since Delta 3.1 |
| Required writer feature (legacy) | `icebergCompatV1` | Enabled via `delta.enableIcebergCompatV1 = true`; deprecated — upgrade path via `REORG TABLE ... UPGRADE UNIFORM` |
| Column mapping mode required | `name` or `id` | Set automatically on table creation when UniForm is enabled; cannot be disabled after enabling UniForm |
| Universal format property | `delta.universalFormat.enabledFormats = iceberg` | Activates metadata generation; `iceberg,hudi` enables both |
| Minimum Delta Lake version | 3.1 (Iceberg), 3.2 (Hudi) | OSS Delta Lake; Databricks Runtime 14.3 LTS+ for Iceberg reads |

### IcebergCompatV2 writer constraints (from Delta Protocol spec)

When `icebergCompatV2` is active, writers must:

- Ensure column mapping is enabled in `name` or `id` mode
- Assign unique 32-bit nested field identifiers to all `ArrayType`, `MapType`, and `StructType` fields (stored in `parquet.field.nested.ids` metadata key)
- Materialize partition column values into Parquet data files after data columns
- Populate `numRecords` statistics in all `AddFile` actions
- Block `Map`, `Array`, and `Void` types from schema (for V1); block VOID type (for V2)
- Not coexist with Deletion Vectors (incompatible at the protocol level for Iceberg v2 reads)

### IcebergWriterCompatV1

`icebergWriterCompatV1` is a separate writer feature, distinct from `icebergCompatV1/V2`, that signals a table supports Iceberg-compatible writes at the column-mapping level. Databricks Unity Catalog automatically adds this feature flag to managed Delta tables when UniForm is enabled. It requires:

- ID-based column mapping with physical names formatted as `col-{columnId}`
- `icebergCompatV2` must also be enabled
- Prohibits byte and short field types

This flag is relevant to the DuckDB incompatibility — see the Engine Compatibility Matrix below and `03-engine-duckdb.md`.

---

## Engine Compatibility Matrix

| Engine | Can enable UniForm | Can read as Iceberg | Notes |
|---|---|---|---|
| Spark | Yes | Yes | Primary write path. `io.delta:delta-iceberg_2.12:<version>` package required. Supports both IcebergCompatV1 and V2. Delta Lake 3.1+ required. |
| delta-rs | No | Yes | Cannot set UniForm table properties (issue #3299, blocked on kernel-rs migration). Can read UniForm-enabled tables since delta-kernel-rs 0.2.0 fixed nested metadata handling (issue #2578 resolved). |
| DuckDB | No | N/A | Cannot write to UniForm-enabled tables due to `icebergWriterCompatV1` — DeltaKernel rejects unknown writer features (issue #289, open as of 2026-03-12). Reads of UniForm-enabled Delta tables work via `delta_scan`. DuckDB has no Iceberg reader to consume the generated Iceberg metadata. Cross-reference: `03-engine-duckdb.md` §Known Limitations. |
| Polars | No | Unknown | Polars has Delta read/write support via delta-rs; delta-rs cannot enable UniForm. Polars has a separate Iceberg reader but no documented ability to consume UniForm-generated Iceberg metadata directly. No tracking issues found. |
| Daft | No | Unknown | Daft supports Delta and Iceberg as separate connectors. No issues or documentation found linking UniForm-generated Iceberg metadata to Daft's Iceberg reader. Likely works in principle if the Iceberg metadata path is registered to a compatible catalog, but untested/undocumented. |
| DataFusion | No | Unknown | DataFusion has Iceberg support via the `iceberg-datafusion` crate. No issues or documentation found for reading UniForm-generated Iceberg metadata. No tracking issues in the DataFusion repository. |
| Trino | No | Yes (via Iceberg connector) | Trino's Delta Lake connector lists `icebergCompatV1` and `icebergCompatV2` as supported read features (Trino 480 docs). Trino can read UniForm-enabled Delta tables as Iceberg by pointing its Iceberg connector at the HMS catalog where the UniForm metadata is registered. The reverse (writing UniForm from Trino) is not supported. |
| Apache Flink | No | Unknown | The Flink Iceberg connector supports HMS, Hadoop, REST, and custom catalogs. No documentation or issues found for reading Delta UniForm tables via the Flink Iceberg connector. Likely works in principle if Iceberg metadata is registered to HMS, but is untested/undocumented in official sources. |
| PrestoDB | No | Unknown | PrestoDB has a separate Delta connector and an Iceberg connector; no documentation links the two via UniForm. No tracking issues found. |
| ClickHouse | No | Unknown | ClickHouse has a read-only Iceberg table engine and function. Iceberg metadata generated by UniForm could theoretically be pointed to directly via the Iceberg table function, but no documentation or confirmed testing found. ClickHouse does not support deletion vectors (only position/equality deletes in v25.8+). |
| Snowflake | N/A | Yes | Snowflake can register external Iceberg tables using a metadata JSON path — the same path that UniForm generates (e.g., `<table-path>/metadata/v<n>-uuid.metadata.json`). The Databricks docs cite BigQuery's use of this pattern; Snowflake uses an analogous mechanism. Writes to UniForm-enabled tables from Snowflake are not applicable (Snowflake reads external tables as read-only). |
| BigQuery | N/A | Yes | The Databricks UniForm docs explicitly call out BigQuery as a confirmed Iceberg reader: users provide the versioned metadata JSON path to register an external Iceberg table in BigQuery. Athena and Redshift are noted as *not* supporting Hive-style Parquet files generated by UniForm without a `REORG TABLE ... UPGRADE UNIFORM` step first. |

---

## Metadata Regeneration Behavior

Iceberg metadata generation is triggered after every successful Delta write transaction that occurs on a cluster where UniForm is enabled. The generation is asynchronous — the Delta commit completes first, and then the Iceberg metadata is produced using the same compute resources. If two Delta commits complete simultaneously (e.g., concurrent writers), only one metadata generation process runs per cluster per format at a time; the concurrent commit succeeds in Delta but its Iceberg metadata generation is skipped. Multiple rapid Delta commits may be coalesced into a single Iceberg commit, meaning Delta and Iceberg version numbers do not align one-to-one. Delta and Iceberg commit timestamps also do not align; Delta and Hudi timestamps do align but version IDs do not. The documentation states that write overhead for the Delta transaction itself is "negligible" because generation is async; however, the Iceberg and Hudi write operations have "significantly higher write latencies than Delta Lake" when measured in isolation. UniForm tracks conversion state via two table properties: `converted_delta_version` (the latest Delta version for which Iceberg metadata was successfully generated) and `converted_delta_timestamp`. Iceberg metadata files are written to `<table-path>/metadata/v<version-number>-uuid.metadata.json`.

---

## Known Limitations

- **Deletion vectors incompatible with Iceberg v2 reads.** The `icebergCompatV1` and `icebergCompatV2` protocol features explicitly block Deletion Vectors from being active on the same table. Tables that use Deletion Vectors (the default for Databricks Runtime 14.0+ merge/delete operations) cannot have UniForm enabled unless Deletion Vectors are disabled first. Apache Iceberg v3 adds deletion vector support, but UniForm's current Iceberg metadata targets Iceberg v2.
- **Iceberg reads are read-only.** No Iceberg client can write to a UniForm-enabled table via the Iceberg protocol. Writes must go through a Delta-native engine.
- **DuckDB writes blocked by `icebergWriterCompatV1`.** DeltaKernel (used by the DuckDB delta extension) rejects writes to any table that contains an unknown writer feature. Unity Catalog-managed tables with UniForm enabled carry `icebergWriterCompatV1`, which DuckDB does not yet recognise, making all DuckDB write operations fail with `Unsupported: Unknown feature 'icebergWriterCompatV1'` (issue #289, open). Reads are unaffected.
- **Cannot be reverted.** Once UniForm is enabled on a table, it cannot be disabled. Column mapping (enabled as a prerequisite) similarly cannot be reverted.
- **VOID data type unsupported.** Tables with VOID-typed columns cannot have UniForm enabled.
- **Column mapping required.** Enabling UniForm forces column mapping into `name` or `id` mode. This is set automatically on table creation but is a breaking change on existing tables without column mapping.
- **delta-rs cannot enable UniForm.** Setting `delta.enableIcebergCompatV2` or `delta.universalFormat.enabledFormats` via delta-rs fails with a parse error (issue #3299). No workaround; blocked on the kernel-rs migration.
- **Polars, Daft, DataFusion, Flink, PrestoDB, ClickHouse compatibility unconfirmed.** These engines may be able to read UniForm-generated Iceberg metadata via their respective Iceberg connectors if metadata is registered in a compatible catalog, but this is not documented or officially tested as of the research date.
- **Athena and Redshift require REORG.** These engines do not support Hive-style Parquet files in their default Iceberg read path. A `REORG TABLE ... UPGRADE UNIFORM` step is needed before these engines can read UniForm-enabled tables.
- **HMS catalog required for most readers.** The primary supported read path for Iceberg clients uses Hive Metastore as the catalog. Alternative path-based registration (BigQuery metadata JSON path, Snowflake external table) works but requires manual metadata path updates as new Delta commits generate new Iceberg metadata files.
- **Version misalignment.** Delta and Iceberg version numbers do not correspond. Tools that rely on version-consistent snapshots across the two formats may observe inconsistencies.
- **Change Data Feed unsupported.** Tables with CDF enabled cannot expose CDF data via the UniForm Iceberg metadata; this feature has no Iceberg equivalent.
- **Hudi support is Preview-only** (as of Delta 3.2). Production use of Hudi UniForm is not recommended.

---

## Source Links

| Source | URL |
|---|---|
| Delta UniForm official docs | https://docs.delta.io/latest/delta-uniform.html |
| Databricks UniForm docs (AWS) | https://docs.databricks.com/aws/en/delta/uniform |
| Databricks UniForm docs (legacy path) | https://docs.databricks.com/en/delta/uniform.html |
| Delta Protocol spec — IcebergCompatV1 | https://github.com/delta-io/delta/blob/master/PROTOCOL.md |
| Delta Protocol spec — IcebergCompatV2 | https://github.com/delta-io/delta/blob/master/PROTOCOL.md |
| delta-io/delta issue #4289 — IcebergWriterCompatV1 RFC | https://github.com/delta-io/delta/issues/4289 |
| delta-rs issue #3299 — Cannot set UniForm properties | https://github.com/delta-io/delta-rs/issues/3299 |
| delta-rs issue #2578 — Cannot read UniForm tables (resolved) | https://github.com/delta-io/delta-rs/issues/2578 |
| duckdb/duckdb_delta issue #289 — icebergWriterCompatV1 write failure | https://github.com/duckdb/duckdb_delta/issues/289 |
| Trino Delta Lake connector docs (v480) | https://trino.io/docs/current/connector/delta-lake.html |
| ClickHouse Iceberg engine docs | https://clickhouse.com/docs/en/engines/table-engines/integrations/iceberg |
| Apache Flink Iceberg connector docs | https://iceberg.apache.org/docs/latest/flink-connector/ |
| DuckDB Delta extension research (03-engine-duckdb.md) | /Users/robert.pack/code/docs-factory/research/delta-lake/03-engine-duckdb.md |
