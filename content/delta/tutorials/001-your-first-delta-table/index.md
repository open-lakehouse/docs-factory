---
title: Create your first Delta table
summary: Start the Spark SQL shell with Delta Lake, create a table at a path, write it in two commits, and read its history and an earlier version.
diataxis: tutorial
project: delta
delta_features: [time-travel]
references:
  - deltaSpec
  - deltaSpark
status: draft
---

In this tutorial you create a [Delta Lake](model:deltaSpec) table with Spark
SQL, write rows to it in two commits, and query it. Along the way you meet the
transaction log that makes it a Delta table: every write adds a version, and
you can list the table's history and query an earlier version.

:::prerequisites
- Java 17 and [uv](https://docs.astral.sh/uv/).
:::

::::journey

### Start the Spark SQL shell

Start `spark-sql` with [Delta Spark](model:deltaSpark):

```bash file=./snippets/spark_sql.sh start=start:launch end=end:launch
```

`uvx` runs the shell from the `pyspark` package, and `--packages` downloads
Delta Spark the first time. The two settings turn on Delta's SQL commands and
let Spark read and write Delta tables. When the `spark-sql (default)>` prompt
appears, the shell is ready. End each statement with `;`.

:::note
`spark-sql` keeps a small local metastore, `metastore_db/` and `derby.log`, in
the folder you start it from. This tutorial names tables by their path, so it
doesn't use it.
:::

### Create a table

Create an empty `orders` table:

```sql file=./snippets/first_table.sql start=start:create end=end:create
```

`` delta.`/tmp/delta/orders` `` names the table by its path. Every engine that
reads Delta can open the table from that path. Creating it writes the first
entry to the table's transaction log: version 0, with the schema and no rows.

### Insert rows

Add three orders:

```sql file=./snippets/first_table.sql start=start:insert-first end=end:insert-first
```

Each write is one commit and creates a new table version. This one is version 1.

### Query the table

```sql file=./snippets/first_table.sql start=start:select end=end:select
```

You see the three orders you inserted.

### Add more rows

Insert two more orders, which creates version 2:

```sql file=./snippets/first_table.sql start=start:insert-second end=end:insert-second
```

### Look at the table's history

`DESCRIBE HISTORY` shows the provenance of each write, newest first:

```sql file=./snippets/first_table.sql start=start:history end=end:history
```

There are three rows: version 2 and version 1 are `WRITE` operations, and
version 0 is `CREATE TABLE`. Each row also has the commit's `timestamp`, its
`operationParameters`, such as the write mode `Append`, and its
`operationMetrics`, such as `numOutputRows`.

### Query an earlier version

Read the table as it was at version 1, before the second insert:

```sql file=./snippets/first_table.sql start=start:time-travel end=end:time-travel
```

You see the first three orders again. Reading an older snapshot like this is
called time travel. The table still holds all five orders; only this query
looks back.

### Look inside the transaction log

Leave the shell with `quit;`, then list the table's `_delta_log` folder:

```bash file=./snippets/spark_sql.sh start=start:log end=end:log
```

Each numbered `.json` file is one commit: `00000000000000000000.json` is
version 0, and so on. The `.crc` files beside them hold a checksum of the table
state at that version, and `_staged_commits` is for tables a catalog manages,
so it stays empty here. The data itself is in Parquet files in
`/tmp/delta/orders`. Readers use the log to find out which of them make up
each version.

::::

## Next steps

- [Read a Delta table](../../how-to/read-a-delta-table/index.md) with Spark
  SQL, PySpark, Python, or DuckDB.
- [Query an earlier version of a table](../../how-to/query-a-table-as-of-version/index.md)
  by version or timestamp.
- [Build a Delta table in Python and query it with DuckDB](../python-to-duckdb/index.md):
  the same table, without a JVM.
