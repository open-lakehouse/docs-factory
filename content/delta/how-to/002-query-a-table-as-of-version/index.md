---
title: Query an earlier version of a table
summary: Use Delta Lake time travel to read a table as of an earlier version or timestamp with Spark SQL, PySpark, the deltalake Python package, or DuckDB, and know how retention limits it.
diataxis: how-to
project: delta
delta_features: [time-travel]
references:
  - deltaSpec
  - deltaSpark
  - deltaRs
  - duckdb
status: draft
---

Each operation that modifies a [Delta Lake](model:deltaSpec) table creates a
new table version, recorded in its transaction log. Time travel queries an
older snapshot of the table, by version number or by timestamp, to reproduce
a report, audit a change, or compare before and after. This guide uses Spark
SQL, PySpark, the `deltalake` Python package, and DuckDB. DuckDB queries
earlier versions by number only, and doesn't list a table's history.

:::prerequisites
- A Delta table with history. The examples read `orders` at
  `/tmp/delta/orders`, which
  [Create your first Delta table](../../tutorials/your-first-delta-table/index.md)
  and [Build a Delta table in Python and query it with DuckDB](../../tutorials/python-to-duckdb/index.md)
  create in three versions. To read your own table, change the path.
- [uv](https://docs.astral.sh/uv/), and Java 17 for Spark SQL and PySpark.
:::

## Set up the client

:::tab[Spark · SQL]
Start the Spark SQL shell with [Delta Spark](model:deltaSpark):

```bash file=../../tutorials/001-your-first-delta-table/snippets/spark_sql.sh start=start:launch end=end:launch
```
:::

:::tab[Spark · Python]
Open a Python session with PySpark and Delta Spark:

```bash
uv run --with pyspark==4.2.0 --with delta-spark==4.4.0 python
```

Then start a Spark session with Delta's SQL support:

```python file=./snippets/time_travel_pyspark.py start=start:session end=end:session
```
:::

:::tab[delta-rs · Python]
Open a Python session with the `deltalake` package from
[delta-rs](model:deltaRs):

```bash
uv run --with "deltalake[pandas,pyarrow]==1.6.6" python
```
:::

:::tab[DuckDB · SQL]
Start the [DuckDB](model:duckdb) CLI:

```bash file=../001-read-a-delta-table/snippets/duckdb.sh start=start:launch end=end:launch
```

Then install and load its `delta` extension:

```sql file=./snippets/time_travel_duckdb.sql start=start:setup end=end:setup
```
:::

## Find the version to read

List the table's history to see each version, when it was committed, and the
operation that created it:

:::tab[Spark · SQL]
```sql file=./snippets/time_travel_spark.sql start=start:history end=end:history
```
:::

:::tab[Spark · Python]
```python file=./snippets/time_travel_pyspark.py start=start:history end=end:history
```
:::

:::tab[delta-rs · Python]
```python file=./snippets/time_travel.py start=start:history end=end:history
```
:::

The newest version comes first: version 2 and version 1 are `WRITE`
operations, and version 0 is `CREATE TABLE`. DuckDB doesn't read a table's
history, so find the version with one of the other interfaces.

## Query a version

Read the table as it was at version 1, before the second write:

:::tab[Spark · SQL]
```sql file=./snippets/time_travel_spark.sql start=start:version end=end:version
```
:::

:::tab[Spark · Python]
```python file=./snippets/time_travel_pyspark.py start=start:version end=end:version
```
:::

:::tab[delta-rs · Python]
```python file=./snippets/time_travel.py start=start:version end=end:version
```
:::

:::tab[DuckDB · SQL]
```sql file=./snippets/time_travel_duckdb.sql start=start:version end=end:version
```

DuckDB time-travels on an attached table. To pin the whole attached table to
one version, attach it with `(TYPE delta, VERSION 1)` instead.
:::

Each returns the first three orders. The latest version still has all five.

## Query a timestamp

Read the table as it was a day ago:

:::tab[Spark · SQL]
```sql file=./snippets/time_travel_spark.sql start=start:timestamp end=end:timestamp
```

On a path, `TIMESTAMP AS OF` takes only a timestamp string, such as one from
`DESCRIBE HISTORY`. An expression such as
`current_timestamp() - INTERVAL 1 DAY` needs a table name, so the first
statement registers the path as `orders` in the shell's metastore.
:::

:::tab[Spark · Python]
```python file=./snippets/time_travel_pyspark.py start=start:timestamp end=end:timestamp
```
:::

:::tab[delta-rs · Python]
```python file=./snippets/time_travel.py start=start:timestamp end=end:timestamp
```
:::

Delta reads the latest version committed at or before the timestamp. A
timestamp before the table's first commit is an error, so a table created
today has no version from a day ago: use a timestamp from its history
instead. DuckDB can't query a timestamp: its `AT` clause takes only a
version.

## Retention limits time travel

To query an earlier version, both its log entries and its data files must
still exist:

- `VACUUM` deletes data files that the current version no longer references,
  once they're older than `delta.deletedFileRetentionDuration` (7 days by
  default).
- Log entries older than `delta.logRetentionDuration` (30 days by default) are
  removed after a checkpoint.

Spark also refuses a version committed longer ago than
`delta.deletedFileRetentionDuration`, even when its files still exist. The
query fails with `DELTA_UNSUPPORTED_TIME_TRAVEL_BEYOND_DELETED_FILE_RETENTION_DURATION`.
The `deltalake` package and DuckDB read such a version while its files are
there. To keep a longer history, raise both properties on the table.

## Next steps

- [Read a Delta table](../read-a-delta-table/index.md): columns and filters
  on the current version.
- [What is Delta Lake?](../../explanation/what-is-delta-lake.md): the
  transaction log behind versions.
