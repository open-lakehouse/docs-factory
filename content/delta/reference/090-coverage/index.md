---
title: "Delta coverage: features, journeys, and engines"
summary: Internal record of what Spark SQL, PySpark, deltalake, and DuckDB support on a Delta table, which journeys the docs cover, and how each claim is verified.
diataxis: reference
project: delta
delta_features: []
references:
  - deltaSpec
  - deltaSpark
  - deltaRs
  - duckdb
status: private
---

This page records what each engine can do with a Delta table and how far the
docs cover each journey. It's private: reviewers see it in the factory app, and
it's never emitted. The public "Features and engine support" (R01) and "Choose
an engine or client" (R10) pages are derived from it. Scope, ids, and journeys
come from the [documentation plan][plan].

## How to read and update this page

| Cell | Meaning |
| --- | --- |
| `tested` | A page in this repo runs a script that asserts it. The link goes to that page. |
| `documented` | The engine's docs or source say so. The link goes there. Not verified here. |
| `no` | Evidence that it doesn't work: a doc statement, a missing API, or a test that asserts the failure. |
| `?` | Unknown. The [open checks](#open-checks) list the ones that matter most. |
| — | Writer-only feature, so it never blocks a reader. |

- Only a script makes a cell `tested`. A PR that adds or changes a script
  updates the cells that script proves.
- A negative becomes `tested` only when a test asserts the failure and its
  error string, so CI flags the cell when an engine adds support.
- A `tested` cell names the versions it ran with when they differ from the
  pins below.
- A `documented` cell without a link takes its source from the nearest link
  in its row, or from [tables.py][pys] and [table.py][dr-table] for API names.
- Spark SQL and PySpark run on the same engine, so the table-features section
  has one Spark column.

## Engines and versions

| Interface | Install | Cells refer to |
| --- | --- | --- |
| Spark SQL | `spark-sql` from the pip `pyspark` wheel, with `io.delta:delta-spark_2.13` | `documented`: Delta 4.4.0 ([release][dd-4.4]). `tested`: the UC pages pin `delta-spark` 4.3.1 on PySpark 4.1.0. |
| PySpark | `pip install delta-spark`, then `configure_spark_with_delta_pip` | Same as Spark SQL. |
| Python | `pip install deltalake` | `documented`: 1.6.6 source ([table.py][dr-table], [feature table][dr-features]). `tested`: the Delta pages require `deltalake>=0.20`, so they run the newest release. |
| DuckDB | `INSTALL delta; LOAD delta;` | `documented`: the [`delta` extension page][duck]. `tested`: `duckdb==1.5.4` with `unity_catalog` from `core_nightly` (UC pages). |

Not tracked yet: Polars, pandas, Daft, DataFusion, the Rust `deltalake` crate,
Delta Kernel (Rust and Java), Trino, Flink, Iceberg readers through UniForm.

## Scenarios by engine

The keys are stable ids for R01 rows and for the docs that cover them. The Docs
column gives the backlog id and its status.

### Create and write

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `create.table` | `tested`: `CREATE TABLE` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md), catalog-managed) | `documented`: `DeltaTable.create()` ([tables.py][pys]) | `documented`: `DeltaTable.create()` ([table.py][dr-table]) | `?`: not documented | H03 planned |
| `create.ctas` | `documented`: `CREATE TABLE … AS SELECT` ([batch][dd-batch]) | `documented`: `df.write.format("delta")` ([batch][dd-batch]) | `documented`: `write_deltalake()` to a new path ([writer][dr-writer]) | `?` | H03 planned |
| `create.partitioned` | `documented`: `PARTITIONED BY` ([batch][dd-batch]) | `documented`: `partitionBy()` | `documented`: `partition_by=` | `?` | H03 planned |
| `write.append` | `tested`: `INSERT INTO` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `documented`: `mode("append")` | `documented`: `mode="append"` | `tested`: `INSERT INTO` an attached table ([UC DuckDB](../../../unitycatalog/how-to/duckdb/index.md), catalog-managed) | H04 planned |
| `write.overwrite` | `documented`: `INSERT OVERWRITE` | `documented`: `mode("overwrite")` | `documented`: `mode="overwrite"` | `no`: appends only ([extension][duck]) | H04 planned |
| `write.replace-where` | `documented`: `REPLACE WHERE` ([batch][dd-batch]) | `documented`: `replaceWhere` option | `documented`: `mode="overwrite", predicate=` | `no` | H04 planned |
| `write.dynamic-partitions` | `documented`: `partitionOverwriteMode=dynamic` ([batch][dd-batch]) | `documented`: same conf | `?`: no option found | `no` | H04 planned |
| `write.idempotent` | `documented`: `txnAppId`/`txnVersion` session confs ([batch][dd-batch]) | `documented`: writer options | `documented`: `CommitProperties(app_transactions=…)` ([transaction.py][dr-txn]) | `documented`: `delta_set_transaction_version()` ([extension][duck]) | H54 planned |
| `write.commit-metadata` | `documented`: `commitInfo.userMetadata` conf | `documented`: `userMetadata` option | `documented`: `CommitProperties(custom_metadata=…)` | `?` | H54 planned |

### Modify rows

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `dml.update` | `tested`: `UPDATE` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `documented`: `DeltaTable.update()` ([update][dd-update]) | `documented`: `DeltaTable.update()` | `no` ([extension][duck]) | H06 planned |
| `dml.delete` | `tested`: `DELETE FROM` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `documented`: `DeltaTable.delete()` | `documented`: `DeltaTable.delete()` | `no` | H06 planned |
| `merge.upsert` | `documented`: `MERGE INTO` ([update][dd-update]) | `documented`: `merge()` builder | `documented`: `merge()` + `when_matched_*`/`when_not_matched_*` | `no` | H05, T03 planned |
| `merge.not-matched-by-source` | `documented` ([update][dd-update]) | `documented` | `documented`: `when_not_matched_by_source_*` | `no` | H05 planned |
| `merge.schema-evolution` | `documented`: `schema.autoMerge.enabled` conf | `documented`: `withSchemaEvolution()` | `documented`: `merge(merge_schema=True)` | `no` | H05, H10 planned |

### Read and history

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `read.scan` | `tested`: `SELECT` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `documented`: `spark.read.format("delta")` | `tested`: `DeltaTable(path).to_pandas()` ([H01](../../how-to/read-a-delta-table/index.md)) | `tested`: `SELECT` through `unity_catalog` ([UC DuckDB](../../../unitycatalog/how-to/duckdb/index.md)) | H01 ready |
| `read.pushdown` | `documented`: data skipping ([optimizations][dd-opt]) | `documented` | `documented`: `to_pyarrow_dataset()` filters | `documented`: filter and projection pushdown ([extension][duck]) | H01 ready (no pushdown yet) |
| `read.version` | `tested`: `VERSION AS OF` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `documented`: `versionAsOf` | `tested`: `DeltaTable(path, version=0)` ([H02](../../how-to/query-a-table-as-of-version/index.md), [T02](../../tutorials/explore-table-history/index.md)) | `documented`: `AT (VERSION => n)`, `ATTACH … (VERSION n)` | H02 ready |
| `read.timestamp` | `documented`: `TIMESTAMP AS OF` | `documented`: `timestampAsOf` | `documented`: `load_as_version(datetime)` | `no`: version only ([extension][duck]) | H02 ready (version only) |
| `history.list` | `tested`: `DESCRIBE HISTORY` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `documented`: `history()` | `tested`: `history()` ([T02](../../tutorials/explore-table-history/index.md)) | `no` | H18 planned |
| `history.detail` | `tested`: `DESCRIBE DETAIL`, `SHOW TBLPROPERTIES` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `documented`: `detail()` | `documented`: `metadata()`, `protocol()`, `get_add_actions()` | `documented`: `delta_list_files()` (files only) | H18 planned |
| `history.restore` | `documented`: `RESTORE TABLE` ([utility][dd-utility]) | `documented`: `restoreToVersion()`/`restoreToTimestamp()` | `documented`: `restore()` | `no` | H08 planned |
| `history.shallow-clone` | `documented`: `SHALLOW CLONE` ([utility][dd-utility]) | `documented`: `clone(isShallow=True)` | `no`: no API | `no` | H09 later |

### Schema and data quality

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `schema.merge-on-write` | `documented`: `autoMerge` conf ([batch][dd-batch]) | `documented`: `mergeSchema` option | `documented`: `schema_mode="merge"` | `no` | H10 planned |
| `schema.overwrite` | `documented`: `CREATE OR REPLACE TABLE` | `documented`: `overwriteSchema` option | `documented`: `schema_mode="overwrite"` | `no` | H10 planned |
| `schema.add-column` | `documented`: `ALTER TABLE ADD COLUMNS` | via `spark.sql` | `documented`: `alter.add_columns()` | `no` | H10 planned |
| `schema.rename-drop` | `documented`: `RENAME`/`DROP COLUMN` ([column mapping][dd-colmap]) | via `spark.sql` | `no`: no API | `no` | H11 planned |
| `schema.type-widening` | `documented`: `ALTER COLUMN … TYPE` ([type widening][dd-widen]) | via `spark.sql` | `no`: no API | `no` | H12 planned |
| `quality.check` | `documented`: `ADD CONSTRAINT … CHECK` ([constraints][dd-constraints]) | via `spark.sql` | `documented`: `alter.add_constraint()` | `?`: enforced on append? | H13 planned |
| `quality.not-null` | `documented`: `NOT NULL` ([constraints][dd-constraints]) | `documented`: schema nullability | `documented`: schema nullability, `alter.drop_column_not_null()` | `?` | H13 planned |
| `columns.generated` | `documented`: `GENERATED ALWAYS AS` ([batch][dd-batch]) | `documented`: builder `generatedAlwaysAs` | `documented`: writer v4 ([feature table][dr-features]) | `?` | H14 planned |
| `columns.identity` | `documented`: `GENERATED … AS IDENTITY` DDL ([4.4.0][dd-4.4]) | `documented`: `IdentityGenerator` | `no`: writer v6 marked unsupported ([feature table][dr-features]) | `?` | H14 planned |
| `columns.default` | `documented`: `DEFAULT` ([defaults][dd-defaults]) | via `spark.sql` | `?`: not in the feature table | `?` | H14 planned |

### Change data and streaming

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `cdf.read` | `documented`: `table_changes()` ([CDF][dd-cdf]) | `documented`: `readChangeFeed` option | `documented`: `load_cdf()` | `no` | H16 planned |
| `stream.source-sink` | `no`: no OSS SQL streaming | `documented`: `readStream`/`writeStream` ([streaming][dd-streaming]) | `no` | `no` | H17, T07 planned |
| `stream.foreach-batch-merge` | `no` | `documented`: `foreachBatch` + `merge()` ([streaming][dd-streaming]) | `no` | `no` | H17 planned |

### Layout and maintenance

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `layout.compact` | `documented`: `OPTIMIZE` ([optimizations][dd-opt]) | `documented`: `optimize().executeCompaction()` | `documented`: `optimize.compact()` | `no` | H20, T05 planned |
| `layout.zorder` | `documented`: `OPTIMIZE … ZORDER BY` | `documented`: `executeZOrderBy()` | `documented`: `optimize.z_order()` | `no` | H20 planned |
| `layout.clustering` | `documented`: `CLUSTER BY`, `ALTER TABLE … CLUSTER BY`, `OPTIMIZE FULL` ([clustering][dd-cluster]) | `documented`: builder `clusterBy()` at create; key changes via `spark.sql` | `no`: no API | `no` | H19 planned |
| `maint.vacuum` | `documented`: `VACUUM … DRY RUN`/`LITE`/`RETAIN` ([utility][dd-utility]) | `documented`: `vacuum(hours)` | `documented`: `vacuum(dry_run=…)` | `no` | H21 planned |
| `maint.checkpoint` | `documented`: automatic, by interval | `documented`: automatic | `documented`: `create_checkpoint()`, `cleanup_metadata()` | `no` | H22 planned |
| `maint.purge-dvs` | `documented`: `REORG TABLE … APPLY (PURGE)` ([grammar][g4]) | via `spark.sql` | `?` | `no` | H23 planned |
| `maint.manifest` | `documented`: `GENERATE symlink_format_manifest` ([utility][dd-utility]) | `documented`: `generate()` | `documented`: `generate()` | `no` | R05 planned |
| `maint.repair` | `no`: no `FSCK` in the grammar ([grammar][g4]) | `no` | `documented`: `repair()` | `no` | R05 planned |
| `migrate.convert-parquet` | `documented`: `CONVERT TO DELTA` ([utility][dd-utility]) | `documented`: `convertToDelta()` | `documented`: `convert_to_deltalake()` | `no` | H07 planned |

### Table features and protocol

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `feature.enable` | `documented`: `delta.feature.<name> = 'supported'` ([versioning][dd-versioning]) | `documented`: `addFeatureSupport()` | `documented`: `alter.add_feature()` | `no` | H24 planned |
| `feature.drop` | `documented`: `DROP FEATURE … [TRUNCATE HISTORY]` ([drop feature][dd-drop]) | `documented`: `dropFeatureSupport()` | `no`: no API | `no` | H25 planned |
| `feature.properties` | `tested`: `SHOW TBLPROPERTIES` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)); `documented`: `SET TBLPROPERTIES` | via `spark.sql` | `documented`: `alter.set_table_properties()` | `no` | R03 planned |

### Storage and catalogs

| Key | Spark SQL | PySpark | Python | DuckDB | Docs |
| --- | --- | --- | --- | --- | --- |
| `storage.s3-multi-writer` | `documented`: `S3DynamoDBLogStore` ([storage][dd-storage]) | same | `documented`: DynamoDB lock or conditional put ([S3 locking][dr-s3]) | `?`: no locking documented for appends | H27 planned |
| `storage.azure-gcs` | `documented` ([storage][dd-storage]) | same | `documented` ([feature table][dr-features]) | `documented`: secrets ([extension][duck]) | H29, H30 planned |
| `catalog.unity` | `tested` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `tested`: session config (same page) | `no` for catalog-managed tables ([UC known issues](../../../unitycatalog/reference/features-and-limitations/index.md)) | `tested` ([UC DuckDB](../../../unitycatalog/how-to/duckdb/index.md), nightly `unity_catalog`) | H31 planned; setup lives in the UC docs |

## Table features by engine

Read: can the engine open a table that has the feature. Write: can it commit
to that table. Feature names follow `PROTOCOL.md`'s feature-name table, plus
the features that are specified elsewhere (last three rows).

| Feature | Spark read | Spark write | Python read | Python write | DuckDB read | DuckDB write |
| --- | --- | --- | --- | --- | --- | --- |
| `appendOnly` | — | `documented` ([properties][dd-props]) | — | `documented` ([feature table][dr-features]) | — | `?` |
| `invariants` | — | `documented` | — | `documented` | — | `?` |
| `checkConstraints` | — | `documented` ([constraints][dd-constraints]) | — | `documented` | — | `?` |
| `generatedColumns` | — | `documented` ([batch][dd-batch]) | — | `documented` | — | `?` |
| `allowColumnDefaults` | — | `documented` ([defaults][dd-defaults]) | — | `?` | — | `?` |
| `changeDataFeed` | — | `documented` ([CDF][dd-cdf]) | — | `documented` | — | `?` |
| `columnMapping` | `documented` ([column mapping][dd-colmap]) | `documented` | `documented`: reader v2 | `documented`: writer v5 | `?` | `?` |
| `identityColumns` | — | `documented` ([batch][dd-batch]) | — | `no` ([feature table][dr-features]) | — | `?` |
| `deletionVectors` | `documented` ([DVs][dd-dv]) | `documented` | `?`: `deletion_vectors()` exists | `?` | `documented` ([extension][duck]) | `?` |
| `rowTracking` | — | `documented` ([row tracking][dd-rowtrack]) | — | `?` | — | `?` |
| `timestampNtz` | `?`: no docs page | `?` | `?` | `?` | `documented`: primitive types | `?` |
| `domainMetadata` | — | `documented` ([versioning][dd-versioning]) | — | `?` | — | `?` |
| `v2Checkpoint` | `documented` ([drop feature][dd-drop]) | `documented` | `?` | `?` | `?` | `?` |
| `catalogManaged` | `tested` ([UC T03](../../../unitycatalog/tutorials/managed-delta-table/index.md)) | `tested` | `no` ([UC known issues](../../../unitycatalog/reference/features-and-limitations/index.md)) | `no` | `tested` ([UC DuckDB](../../../unitycatalog/how-to/duckdb/index.md)) | `tested` |
| `icebergCompatV1`, `icebergCompatV2` | — | `documented` ([UniForm][dd-uniform]) | — | `?` | — | `?` |
| `clustering` | — | `documented` ([clustering][dd-cluster]) | — | `?` | — | `?` |
| `vacuumProtocolCheck` | `documented` ([drop feature][dd-drop]) | `documented` | `?` | `?` | `?` | `?` |
| `inCommitTimestamp` | — | `documented` ([drop feature][dd-drop]) | — | `?` | — | `?` |
| `typeWidening` (RFC) | `documented` ([type widening][dd-widen]) | `documented` | `?` | `?` | `?` | `?` |
| `variantType` (spec body) | `?`: no docs page | `?` | `?` | `?` | `documented`: VARIANT reads | `?` |
| `variantShredding` (RFC) | `?` | `?` | `?` | `?` | `?` | `?` |

## Journeys

| Journey | Path | Written | Engines covered | Blocking gap |
| --- | --- | --- | --- | --- |
| J01 Evaluate | E01 → R01 → T01 → T11 → R10 | E01 | — | T01 is a stub; no R01 or R10. |
| J02 Build and modify a table | T01 → T03 → H03–H06 → E03 | — | — | Nothing written. |
| J03 History and changes | T02 → H02/H18 → H16 → H08 → E12 | T02 (draft), H02 | Python | No Spark SQL or DuckDB tabs; no CDF or restore. |
| J04 Keep it fast | E05 → T05 → H19–H22 → R03 | — | — | Nothing written. |
| J05 Evolve safely | E04/E07 → T04 → H10–H14 → H24/H25 → R01/R02 | R02 (stub) | — | Feature-by-engine reads are mostly `?`. |
| J06 Use an engine | R10 → H38/H52/H40 → H53 | — | — | No setup pages. |
| J07 Production storage | E08 → T08 → H27–H30 → H35 | — | — | DuckDB and deltalake multi-writer safety unknown. |
| J08 Interoperate | E10 → H31 → UC docs | — | Spark SQL, DuckDB (through UC) | Delta-side pages unwritten; UC pages cover setup. |
| J10 Upgrade and migrate | R11 → H33/H34 → H07 | — | — | Nothing written. |
| J11 Troubleshoot | H35/H36 → R09 → E03/E04 | — | — | No error strings collected yet. |

J09 (build a connector) is deferred with Kernel. E09 exists but isn't on a
journey path yet.

## Open checks

Ordered by how many pages or decisions they unblock.

1. **What a DuckDB append does to a table with constraints, generated
   columns, or deletion vectors.** If it writes past a `CHECK` constraint,
   H53 and H13 need a `:::warning` saying so.
2. **Whether DuckDB and deltalake appends are safe next to Spark writers on
   S3**, and with which locking setup (H27, H53).
3. **Which writer features deltalake commits to correctly**: deletion vectors,
   row tracking, `allowColumnDefaults`, clustering, `inCommitTimestamp`.
   `alter.add_feature()` enables some of them, which isn't the same as
   writing them correctly.
4. **Reader support for `columnMapping`, `deletionVectors`, `v2Checkpoint`,
   `typeWidening`, and `variantType`** in deltalake and DuckDB. A cross-engine
   script (Spark writes, the other engines read) settles most of the table
   above.
5. **Assert the protocol in the UC Spark tutorial.** Its managed table also
   enables v2 checkpoints, deletion vectors, in-commit timestamps, row
   tracking, and column mapping (seen in the 2026-10-03 spike). Asserting
   them there turns the DuckDB read and write cells for those features into
   `tested`.
6. **Pin `deltalake` exactly** in the Delta scripts (`>=0.20` today), so
   `tested` cells name a version.
7. **Whether DuckDB can create a table** through `ATTACH … (TYPE delta)`.
8. **Spark `timestampNtz` and `variantType`**: Spark is the reference writer,
   but docs.delta.io has no page for either. Find the release that added
   each, then test it.

[plan]: https://github.com/open-lakehouse/docs-factory/blob/main/docs/design/delta-documentation-plan.md
[dd-4.4]: https://github.com/delta-io/delta/releases/tag/v4.4.0
[dd-batch]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-batch.mdx
[dd-update]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-update.mdx
[dd-utility]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-utility/index.mdx
[dd-streaming]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-streaming/index.mdx
[dd-cdf]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-change-data-feed.mdx
[dd-opt]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/optimizations-oss/index.mdx
[dd-cluster]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-clustering.mdx
[dd-constraints]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-constraints.mdx
[dd-defaults]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-default-columns.mdx
[dd-colmap]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-column-mapping.mdx
[dd-widen]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-type-widening.mdx
[dd-dv]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-deletion-vectors.mdx
[dd-rowtrack]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-row-tracking.mdx
[dd-drop]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-drop-feature.mdx
[dd-versioning]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/versioning.mdx
[dd-props]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/table-properties.mdx
[dd-storage]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-storage.mdx
[dd-uniform]: https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-uniform.mdx
[g4]: https://github.com/delta-io/delta/blob/v4.4.0/spark/src/main/antlr4/io/delta/sql/parser/DeltaSqlBase.g4
[pys]: https://github.com/delta-io/delta/blob/v4.4.0/python/delta/tables.py
[dr-table]: https://github.com/delta-io/delta-rs/blob/python-v1.6.6/python/deltalake/table.py
[dr-writer]: https://github.com/delta-io/delta-rs/blob/python-v1.6.6/python/deltalake/writer/writer.py
[dr-txn]: https://github.com/delta-io/delta-rs/blob/python-v1.6.6/python/deltalake/transaction.py
[dr-features]: https://github.com/delta-io/delta-rs/blob/python-v1.6.6/docs/feature-table.md
[dr-s3]: https://github.com/delta-io/delta-rs/blob/python-v1.6.6/docs/usage/writing/writing-to-s3-with-locking-provider.md
[duck]: https://duckdb.org/docs/current/core_extensions/delta.html
