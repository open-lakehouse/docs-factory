# Delta Lake Ecosystem Landscape Scan

**Task:** #151 (Plan #139)
**Scanned:** 2026-03-27
**Scope:** Broad survey of Delta Lake support across query engines, cloud services, streaming systems, and interoperability layers. Not a deep-dive on any single engine — candidates for deep-dive reports are flagged separately.

---

## Summary

Delta Lake support has spread well beyond the Apache Spark origin. As of early 2026, the ecosystem breaks into four tiers:

1. **Full read/write + DML**: Trino (native connector), Azure Synapse Analytics Spark, Microsoft Fabric (native default format), Databricks (origin), delta-rs (Rust library underpinning many integrations).
2. **Read/write with limited DML**: DuckDB (via Delta Kernel; blind insert only), ClickHouse (write requires experimental flag; Azure not yet supported), Apache Flink (write via delta-rs / standalone connector; read coverage varies).
3. **Read-only**: PrestoDB (Delta Kernel; read + time travel), AWS Athena (native, Athena v3 only), AWS Redshift Spectrum (manifest-based), Snowflake external tables (manifest-based; deprecated in favor of Iceberg via UniForm), Google BigQuery (BigLake native; read v3+), Apache Hive (Delta Standalone; read-only), Apache Druid (Delta Kernel 3.0+; latest snapshot only), StarRocks (official integration; read-only per delta.io listing).
4. **Interoperability / translation layers**: Delta UniForm (generates Iceberg metadata alongside Delta; enables any Iceberg reader to read Delta tables — Snowflake, BigQuery, Trino, etc.), manifest-based symlink compatibility (Redshift Spectrum, older Snowflake, Presto legacy), delta-rs (Rust/Python/Ruby library used by DuckDB, Polars, DataFusion, Daft, Dask, etc.).

Two engines listed in the task prompt — **Velox** and **Lance** — have no documented Delta Lake support. Velox supports Parquet/ORC/DWRF natively but not Delta's transaction log; Delta Lake support would require a custom connector. Lance is a competing multimodal AI-focused format and has no interoperability layer with Delta Lake.

The **Hudi-Delta** and **Iceberg-Delta** translator question is primarily answered by **Delta UniForm** (Delta → Iceberg metadata generation), not by Hudi itself. There is no native Delta→Hudi or Hudi→Delta translation layer; interoperability is achieved by writing in one format and reading via a shared catalog (Unity Catalog, Polaris, etc.) or via UniForm.

---

## Engines/Projects Found

| Name | Integration Mechanism | Coverage Level | Docs / Repo |
|---|---|---|---|
| **Apache Spark** | Native (delta-spark library; Spark DataSource V2) | Full read/write, DML (INSERT, UPDATE, DELETE, MERGE), streaming, time travel, DDL | https://docs.delta.io/latest/quick-start.html |
| **Trino** | Native connector (reads transaction log directly; no intermediary library) | Full read/write, DML (INSERT, UPDATE, DELETE, MERGE), time travel, schema evolution | https://trino.io/docs/current/connector/delta-lake.html |
| **PrestoDB** | Delta Kernel API | Read + time travel (snapshot version and timestamp); CREATE/DROP TABLE metadata only; no DML writes | https://prestodb.io/docs/current/connector/deltalake.html |
| **Apache Flink** | delta-rs / Delta Standalone connector (write path); Kernel path in progress | Write-capable (streaming append); read support described as preview in delta.io docs | https://docs.delta.io/latest/flink-integration.html |
| **Apache Hive** | Delta Standalone library (JVM; now maintenance mode; being superseded by Kernel) | Read-only | https://docs.delta.io/latest/delta-more-connectors.html#apache-hive |
| **DuckDB** | Delta Kernel (duckdb delta extension; built on Kernel + DuckDB Parquet scanner) | Read (full, with deletion vectors, projection/filter pushdown) + blind INSERT only; no UPDATE/DELETE | https://duckdb.org/docs/stable/core_extensions/delta.html |
| **ClickHouse** | Delta Kernel (DeltaLake table engine; write path added in v25.10) | Read-only (stable); write to S3/GCS via Kernel (experimental, requires flag); Azure write not yet supported | https://clickhouse.com/docs/en/engines/table-engines/integrations/deltalake |
| **StarRocks** | Official integration per delta.io; native catalog connector | Read-only (per delta.io listing: "ability to read from Delta Lake") | https://delta.io/integrations/ |
| **Apache Druid** | Delta Kernel 3.0+ (druid-deltalake-extensions contrib extension) | Read-only; ingests latest snapshot via DeltaLakeInputSource; no time travel | https://druid.apache.org/docs/latest/development/extensions-contrib/delta-lake/ |
| **AWS Athena** | Native (Athena engine v3; reads transaction log directly from S3; no manifest needed) | Read-only (SELECT); limited DDL; no time travel; reader v1–v3 | https://docs.aws.amazon.com/athena/latest/ug/delta-lake-tables.html |
| **AWS Redshift Spectrum** | Manifest-based (SymlinkTextInputFormat; requires `GENERATE symlink_format_manifest`) | Read-only; manifest must be regenerated after Delta writes; no DML | https://docs.aws.amazon.com/redshift/latest/dg/c-spectrum-external-tables.html |
| **Snowflake (external tables)** | Manifest-based (TABLE_FORMAT = DELTA; scans transaction log to identify Parquet files) | Read-only; no deletion vector support; automated refresh unsupported; **deprecated** — migrate to Iceberg via UniForm | https://docs.snowflake.com/en/user-guide/tables-external-intro |
| **Google BigQuery (BigLake)** | Native BigLake Delta tables (reads transaction log directly; also supports manifest fallback for reader v1) | Read-only; supports reader v3 with deletion vectors + column mapping; preferred over manifest approach | https://docs.delta.io/latest/bigquery-integration.html |
| **Azure Synapse Analytics** | Apache Spark runtime (OSS Delta Lake library embedded in Synapse Spark pools) | Full read/write + DML via Spark; SQL pool access is Spark-mediated, not native SQL engine | https://learn.microsoft.com/en-us/azure/synapse-analytics/spark/apache-spark-delta-lake-overview |
| **Microsoft Fabric** | Delta Lake is the default native table format (built on Spark runtime; automatic optimization enabled) | Full read/write + DML via Spark/notebooks/pipelines; all Lakehouse tables are Delta by default | https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-and-delta-tables |
| **delta-rs** | Native Rust implementation of the Delta Lake protocol (no JVM dependency; Python + Ruby bindings) | Full read/write + DML (merge, delete, Z-order, VACUUM, CDF, time travel); used by DuckDB, Polars, DataFusion, Daft, Dask, Arrow Ballista, Ray, DataHub | https://github.com/delta-io/delta-rs |
| **Apache DataFusion** | delta-rs (via delta-datafusion crate; Arrow-native execution) | Read + write; predicte pushdown; used as query layer for delta-rs Python API | https://github.com/delta-io/delta-rs |
| **Polars** | delta-rs (Rust; polars-io crate) | Read + write (append/overwrite); no in-place UPDATE/DELETE | https://github.com/delta-io/delta-rs |
| **Apache Arrow Ballista** | delta-rs | Read + write (distributed) | https://github.com/delta-io/delta-rs |
| **Daft** | delta-rs | Read + write | https://github.com/delta-io/delta-rs |
| **Dask** | delta-rs (via dask-deltatable) | Read + write | https://github.com/delta-io/delta-rs |
| **RisingWave** | Official Delta Lake sink (write path; streaming CDC to Delta) | Write-only (sink); not a query engine for Delta reads | https://delta.io/integrations/ |
| **Delta UniForm** | Delta protocol extension (generates Iceberg metadata in `_delta_log/` alongside Delta log; no data duplication) | Enables any Iceberg reader to read Delta tables as Iceberg; read-only from Iceberg clients; Hudi UniForm support not confirmed as of this scan | https://docs.databricks.com/aws/en/delta/uniform.html |
| **Starburst** | Extends Trino's native Delta Lake connector; configuration and usage identical to Trino | Full read/write + DML (same as Trino connector) | https://delta.io/integrations/ |
| **Apache Pulsar** | Community connector | Read + write via Kafka Delta Ingest-style integration | https://delta.io/integrations/ |
| **AWS Glue** | AWS Glue 3.0+ embeds Spark with Delta Lake library | Full Spark-mediated read/write + DML | https://delta.io/integrations/ |
| **AWS EMR** | Apache Spark 3.x on EMR with Delta Lake | Full Spark-mediated read/write + DML | https://delta.io/integrations/ |
| **Azure Stream Analytics** | Native write support (output to Delta Lake tables) | Write-only (streaming output sink) | https://delta.io/integrations/ |
| **Apache Beam** | Community connector | Read-only (batch reads from Delta tables) | https://delta.io/integrations/ |
| **Kafka Delta Ingest** | Official; streams Kafka topics → Delta tables | Write-only (ingest sink) | https://github.com/delta-io/kafka-delta-ingest |
| **Velox** | No support | None — supports Parquet/ORC/DWRF file formats but not Delta transaction log; would require custom connector | https://github.com/facebookincubator/velox |
| **Lance** | No interoperability | Competing multimodal AI format; no Delta Lake read/write path; positions itself as an alternative to Delta for AI workloads | https://github.com/lancedb/lance |
| **Hudi ↔ Delta** | No native translator; interoperability via Delta UniForm (Delta→Iceberg) + catalog (Unity Catalog, Polaris) or via extract-load | No direct Hudi-Delta or Delta-Hudi conversion layer exists | — |

---

## Candidates for Detailed Research

The following engines/projects show significant Delta Lake integration depth and have material that warrants a dedicated report (comparable in depth to tasks 03–07 in this plan):

| # | Candidate | Rationale | Idea Issue |
|---|---|---|---|
| 1 | **Trino** | Native connector with full read/write + DML; broad enterprise adoption; rich time-travel and schema evolution story; product tests against both OSS and Databricks | #156 |
| 2 | **PrestoDB** | Delta Kernel adoption; large Meta/Facebook deployment; distinct from Trino despite shared lineage; read-path only but well-documented | #157 |
| 3 | **Apache Flink** | Streaming write to Delta Lake; important for CDC/streaming lakehouse patterns; connector status and Kernel migration path worth documenting | #158 |
| 4 | **ClickHouse** | Fast-growing analytical engine; write support newly added (v25.10, experimental); read path mature; interesting Delta-as-external-table story | #159 |
| 5 | **Delta UniForm** | Cross-format interoperability layer affecting all Iceberg-capable engines reading Delta data; strategic importance for multi-engine lakehouses | #160 |

Issue numbers will be filled in below after creation.

---

## Idea Issues Created

The following Idea issues were created in open-lakehouse/workflows under parent #133:

| Issue | Title |
|---|---|
| [#156](https://github.com/open-lakehouse/workflows/issues/156) | Research: Trino Delta Lake support |
| [#157](https://github.com/open-lakehouse/workflows/issues/157) | Research: PrestoDB Delta Lake support |
| [#158](https://github.com/open-lakehouse/workflows/issues/158) | Research: Apache Flink Delta Lake support |
| [#159](https://github.com/open-lakehouse/workflows/issues/159) | Research: ClickHouse Delta Lake support |
| [#160](https://github.com/open-lakehouse/workflows/issues/160) | Research: Delta UniForm cross-format interoperability |

---

## Source Links

- Delta Lake official integrations page: https://delta.io/integrations/
- Delta Lake connector docs (delta.io): https://docs.delta.io/latest/delta-more-connectors.html
- Trino Delta Lake connector: https://trino.io/docs/current/connector/delta-lake.html
- PrestoDB Delta Lake connector: https://prestodb.io/docs/current/connector/deltalake.html
- Flink integration overview: https://docs.delta.io/latest/flink-integration.html
- DuckDB delta extension: https://duckdb.org/docs/stable/core_extensions/delta.html
- ClickHouse DeltaLake engine: https://clickhouse.com/docs/en/engines/table-engines/integrations/deltalake
- delta-rs GitHub: https://github.com/delta-io/delta-rs
- Delta Kernel README: https://github.com/delta-io/delta/blob/master/kernel/README.md
- AWS Athena Delta Lake: https://docs.aws.amazon.com/athena/latest/ug/delta-lake-tables.html
- AWS Redshift Spectrum external tables: https://docs.aws.amazon.com/redshift/latest/dg/c-spectrum-external-tables.html
- Snowflake external tables (Delta): https://docs.snowflake.com/en/user-guide/tables-external-intro
- BigQuery BigLake Delta: https://docs.delta.io/latest/bigquery-integration.html
- Azure Synapse Delta overview: https://learn.microsoft.com/en-us/azure/synapse-analytics/spark/apache-spark-delta-lake-overview
- Microsoft Fabric Delta tables: https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-and-delta-tables
- Delta UniForm: https://docs.databricks.com/aws/en/delta/uniform.html
- Apache Druid Delta Lake extension: https://druid.apache.org/docs/latest/development/extensions-contrib/delta-lake/
- Lance format (no Delta interop): https://github.com/lancedb/lance
- Velox (no Delta support): https://github.com/facebookincubator/velox
