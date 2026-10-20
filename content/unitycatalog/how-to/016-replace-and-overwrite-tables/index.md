---
title: Replace or overwrite a managed Delta table
summary: In Unity Catalog, CREATE OR REPLACE, INSERT OVERWRITE, and REPLACE WHERE each commit one new version of a managed table; its name, ID, and history stay.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
  - deltaSpark
status: draft
---

To replace data in a catalog-managed [Delta](model:deltaSpec) table, pick the
Spark SQL statement by what should change: the table's definition and rows, all
of its rows, or only the rows that match a condition or land in a partition.
Every statement on this page keeps the table's
[Unity Catalog](model:unityCatalogOSS) identity, and an earlier version stays
readable until its files are vacuumed.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17).
- A catalog with managed storage and a schema in it, such as
  `replace_demo.sales`. See
  [Manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).
:::

## Set up the client

Open a Python session with PySpark:

```bash
uv run --with pyspark==4.1.0 python
```

The examples call `spark.sql` in a session whose default catalog is
`replace_demo`:

```python file=./snippets/replace_overwrite.py start=start:imports end=end:imports collapse
```

```python file=./snippets/replace_overwrite.py start=start:session end=end:session collapse
```

[Use Spark with Unity Catalog](../configure-spark/index.md) explains each
setting.

## Choose how to replace data

The statements differ in what they need to exist and what they replace:

| Statement | If the table doesn't exist | Columns | Partitioning | What it replaces |
| --- | --- | --- | --- | --- |
| `CREATE TABLE … AS SELECT` | Creates it | From the query | None, unless the statement has `PARTITIONED BY` | Nothing. Fails with `TABLE_OR_VIEW_ALREADY_EXISTS` if the name is taken. |
| `REPLACE TABLE … [AS SELECT]` | Fails with `TABLE_OR_VIEW_NOT_FOUND` | From the new definition or query | Only what the statement's `PARTITIONED BY` declares | The definition and all rows. Without `AS SELECT`, the table is left empty. |
| `CREATE OR REPLACE TABLE … [AS SELECT]` | Creates it | From the new definition or query | Only what the statement's `PARTITIONED BY` declares | The definition and all rows |
| `INSERT OVERWRITE` | Fails with `TABLE_OR_VIEW_NOT_FOUND` | Kept. New rows must match them. | Kept | All rows |
| `INSERT INTO … REPLACE WHERE` | Fails with `TABLE_OR_VIEW_NOT_FOUND` | Kept | Kept | The rows that match the condition |
| `INSERT OVERWRITE` with dynamic partition overwrite | Fails with `TABLE_OR_VIEW_NOT_FOUND` | Kept | Kept | The partitions the new rows write to |

## Create a table from a query

To create a managed table from the result of a query, use `CREATE TABLE … AS
SELECT` without a `LOCATION`:

```python file=./snippets/replace_overwrite.py start=start:ctas end=end:ctas
```

The new table is catalog-managed, like one made with `CREATE TABLE`, and its
first version, 0, is a `CREATE TABLE AS SELECT`. It takes its four columns from
the query and has no partition columns. Keep `USING DELTA`. Without it, Spark
asks for the session's default format, and the statement fails with
`Unity Catalog does not support non-Delta managed table`.

## Replace a table's definition and rows

To change a table's columns or partitioning and rewrite its rows in one
commit, use `CREATE OR REPLACE TABLE … AS SELECT`. This statement adds a `tax`
column and partitions the table by `day`:

```python file=./snippets/replace_overwrite.py start=start:replace-table end=end:replace-table
```

:::warning
The new version holds only the query's rows. To get the old rows back, read or
restore the earlier version, as in [Check a replacement and undo it](#check-a-replacement-and-undo-it).
:::

The query reads the table it replaces. The result is version 1 of the same
table, with the same table ID and location. Version 0 still reads with its
old four columns.

`REPLACE TABLE` does the same for a table that must already exist. Use it when
replacing a table that isn't there should be an error rather than a new table.

## Overwrite all rows

To swap every row and keep the table's columns, use `INSERT OVERWRITE`:

```python file=./snippets/replace_overwrite.py start=start:overwrite end=end:overwrite
```

:::warning
The new version holds only the new rows. To get the old rows back, read or
restore the earlier version, as in [Check a replacement and undo it](#check-a-replacement-and-undo-it).
:::

The table now holds orders 4, 5, and 6. The new rows must have every column of
the table. Two values for this five-column table fail with
`DELTA_INSERT_COLUMN_ARITY_MISMATCH`: `target table has 5 column(s) but the
inserted data has 2 column(s)`. To change the columns as well, replace the
table instead.

## Overwrite some rows or partitions

### Replace the rows that match a condition

To replace only the rows that match a condition, use `INSERT INTO … REPLACE
WHERE`. This statement swaps the orders for October 3 for one new order:

```python file=./snippets/replace_overwrite.py start=start:replace-where end=end:replace-where
```

Order 6, from October 4, stays. Every new row must match the condition. A row
outside it fails the whole statement with `DELTA_REPLACE_WHERE_MISMATCH`, and
the table doesn't change.

### Overwrite the partitions the new rows write to

On a partitioned table, dynamic partition overwrite replaces only the
partitions that the new rows land in. Turn it on for the session, run
`INSERT OVERWRITE`, and turn it off again:

```python file=./snippets/replace_overwrite.py start=start:dynamic-partitions end=end:dynamic-partitions
```

The new order replaces order 6 in the October 4 partition. Order 7, on
October 3, stays. While the setting is on, an `INSERT OVERWRITE` meant to
replace the whole table keeps every partition its rows don't touch, so unset
it after the write.

## Check a replacement and undo it

To see what each statement did, list the table's history:

```python file=./snippets/replace_overwrite.py start=start:history end=end:history
```

```text
+-------+---------------------------------+
|version|operation                        |
+-------+---------------------------------+
|4      |WRITE                            |
|3      |WRITE                            |
|2      |WRITE                            |
|1      |CREATE OR REPLACE TABLE AS SELECT|
|0      |CREATE TABLE AS SELECT           |
+-------+---------------------------------+
```

The overwrites are all `WRITE` operations. The `operationParameters` column
tells them apart: `mode` is `Overwrite` for version 2, version 3 records the
`REPLACE WHERE` condition as `predicate`, and version 4 has
`isDynamicPartitionOverwrite` set to `true`.

To read the table as it was before a change, query an earlier version:

```python file=./snippets/replace_overwrite.py start=start:version-as-of end=end:version-as-of
```

```text
+--------+----------+
|order_id|       day|
+--------+----------+
|       6|2026-10-04|
|       7|2026-10-03|
+--------+----------+
```

To undo a change, restore that version:

```python file=./snippets/replace_overwrite.py start=start:restore end=end:restore
```

Restoring commits a new version, 5, whose operation is `RESTORE`. Versions 3
and 4 stay in the history.

:::warning
Restoring and reading an earlier version need that version's data files. A
replacement only marks the old files as removed; `VACUUM` deletes them once
they're older than the table's `delta.deletedFileRetentionDuration`, 7 days by
default. After that, the earlier version can't be read or restored. See
[Data retention](https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-batch.mdx#data-retention)
in the Delta docs.
:::

## What a replacement can't change

A replacement keeps the table's identity. Statements that try to change it
fail before they commit, and the table keeps its rows, ID, and history:

| You try to change | What you see |
| --- | --- |
| The format, for example `USING PARQUET` | `Cannot change table format from DELTA to PARQUET` |
| The location, with `LOCATION` | `cannot specify 'location' or 'external': only catalog-managed Delta tables can be replaced on this path` |
| The table ID, with `TBLPROPERTIES ('io.unitycatalog.tableId' = …)` | `cannot specify catalog-managed property 'io.unitycatalog.tableId'` |
| The catalog-managed feature, with `'delta.feature.catalogManaged' = 'disabled'` | `cannot override 'delta.feature.catalogManaged'='disabled'; expected 'supported'` |
| An external table, with `CREATE OR REPLACE` or `REPLACE TABLE` | `REPLACE TABLE is only supported for catalog-managed UC Delta tables; … is EXTERNAL` |

Other table properties aren't protected this way. For example, a replacement
with `TBLPROPERTIES ('delta.enableDeletionVectors' = 'false')` commits, and
the table has deletion vectors off.

These statements are verified with Spark. DuckDB can't create a table from a
query, and the `deltalake`-based clients can't open catalog-managed tables.

## Required privileges

With authorization enabled, each task needs these privileges. Owners have all
of them.

| Task | Privileges |
| --- | --- |
| Create a table from a query | `USE CATALOG` on the catalog, `USE SCHEMA` and `CREATE TABLE` on the schema, and `SELECT` on the tables the query reads |
| Overwrite all rows, rows that match a condition, or partitions | `USE CATALOG`, `USE SCHEMA`, and `SELECT` and `MODIFY` on the table |
| Replace a table, or restore an earlier version | Owner of the table, or of its schema or catalog |

See [Ownership and privileges](../../explanation/uc-basics/index.md#ownership-and-privileges).

<!-- TODO(open question): Is MODIFY on the table enough for CREATE OR REPLACE, REPLACE TABLE, and RESTORE, or is ownership required? The local environment runs without authorization, so no script checks these. -->

## Next steps

- [Read an earlier version](../../tutorials/managed-delta-table/index.md#read-an-earlier-version)
  of a managed table, step by step.
- Learn how the catalog accepts each commit in
  [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md).
- To change rows in place, or a table's schema without rewriting it, see the
  guides *Read and write catalog-managed Delta tables* and *Change a table's
  schema and properties*.
