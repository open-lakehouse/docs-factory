---
title: Read a Delta table
summary: Read a Delta table by its path with Spark (SQL, Python, Scala, or Java), the deltalake Python package, or DuckDB, and select only the columns and rows you need.
diataxis: how-to
project: delta
delta_features: []
references:
  - deltaSpec
  - deltaSpark
  - deltaRs
  - duckdb
status: draft
---

You read a [Delta Lake](model:deltaSpec) table by its path, or by its name
when a catalog registers it. The engine reads the table's transaction log to
find its current version, then scans only the Parquet files in that version.
This guide reads a table with Spark (in SQL, Python, Scala, or Java), the
`deltalake` Python package, and DuckDB, all of which read Delta tables.

:::prerequisites
- A Delta table. The examples read `orders` at `/tmp/delta/orders`, which
  [Create your first Delta table](../../tutorials/your-first-delta-table/index.md)
  and [Build a Delta table in Python and query it with DuckDB](../../tutorials/python-to-duckdb/index.md)
  create. To read your own table, change the path.
- [uv](https://docs.astral.sh/uv/), and Java 17 for Spark. The Java examples
  also need [JBang](https://www.jbang.dev/).
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

```python file=./snippets/read_pyspark.py start=start:session end=end:session
```

`configure_spark_with_delta_pip` adds the Delta Spark package that matches
your `delta-spark` install. Any Spark SQL statement also runs in PySpark as
`spark.sql("…")`.
:::

:::tab[Spark · Scala]
Start the Spark shell with Delta Spark and Delta's SQL support:

```bash
uvx --from pyspark==4.2.0 spark-shell \
  --packages io.delta:delta-spark_2.13:4.4.0 \
  --conf spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension \
  --conf spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog
```

The shell starts a Spark session named `spark`.
:::

:::tab[Spark · Java]
Java has no shell, so the steps below go into one [JBang](https://www.jbang.dev/)
script, run with `jbang Read.java`. Its header declares Java and the
dependencies:

```java file=./snippets/Read.java start=start:deps end=end:deps
```

`main` starts a Spark session with Delta's SQL support:

```java file=./snippets/Read.java start=start:session end=end:session
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

```bash file=./snippets/duckdb.sh start=start:launch end=end:launch
```

Then install and load its `delta` extension:

```sql file=./snippets/read_duckdb.sql start=start:setup end=end:setup
```
:::

## Read a table

Query the table's latest version:

:::tab[Spark · SQL]
```sql file=./snippets/read_spark.sql start=start:read end=end:read
```
:::

:::tab[Spark · Python]
```python file=./snippets/read_pyspark.py start=start:read end=end:read
```
:::

:::tab[Spark · Scala]
```scala file=./snippets/read.sc start=start:read end=end:read
```
:::

:::tab[Spark · Java]
```java file=./snippets/Read.java start=start:read end=end:read
```
:::

:::tab[delta-rs · Python]
```python file=./snippets/read.py start=start:read end=end:read
```
:::

:::tab[DuckDB · SQL]
```sql file=./snippets/read_duckdb.sql start=start:read end=end:read
```
:::

Each returns the five orders. In Spark SQL, `` delta.`<path>` `` names a table
by its path. DuckDB's `delta_scan` takes the path as a string.

## Select columns and filter rows

Name only the columns you need, and filter the rows:

:::tab[Spark · SQL]
```sql file=./snippets/read_spark.sql start=start:filter end=end:filter
```
:::

:::tab[Spark · Python]
```python file=./snippets/read_pyspark.py start=start:filter end=end:filter
```
:::

:::tab[Spark · Scala]
```scala file=./snippets/read.sc start=start:filter end=end:filter
```
:::

:::tab[Spark · Java]
```java file=./snippets/Read.java start=start:filter end=end:filter
```
:::

:::tab[delta-rs · Python]
```python file=./snippets/read.py start=start:filter end=end:filter
```

`filters` takes a list of `(column, operator, value)` conditions that must all
hold.
:::

:::tab[DuckDB · SQL]
```sql file=./snippets/read_duckdb.sql start=start:filter end=end:filter
```
:::

Each returns orders 1, 2, and 5, with three columns. The transaction log
records statistics for each data file, such as each column's minimum and
maximum value, so an engine can skip files whose rows can't match the filter.

## Next steps

- [Query an earlier version of a table](../query-a-table-as-of-version/index.md)
  by version or timestamp.
- [What is Delta Lake?](../../explanation/what-is-delta-lake.md): the
  transaction log and what it adds to Parquet.
