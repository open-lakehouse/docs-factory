---
title: Append and overwrite data in a Delta table
summary: Add rows to a Delta table in append mode, or replace all of its data in overwrite mode, with Spark SQL, PySpark, the deltalake Python package, or DuckDB.
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

To add new data to an existing [Delta Lake](model:deltaSpec) table, write in
append mode. To replace all of its data, write in overwrite mode. Either way
the write is one commit, a new table version that readers see in full or not
at all. This guide writes with Spark SQL, PySpark, the `deltalake` Python
package, and DuckDB. DuckDB can only append: its `delta` extension doesn't
overwrite, update, or delete rows.

:::prerequisites
- A Delta table. The examples write to `orders` at `/tmp/delta/orders`, which
  [Create your first Delta table](../../tutorials/your-first-delta-table/index.md)
  and [Build a Delta table in Python and query it with DuckDB](../../tutorials/python-to-duckdb/index.md)
  create. To write to your own table, change the path and the rows.
- [uv](https://docs.astral.sh/uv/), and Java 17 for Spark SQL and PySpark.
:::

## Set up the client

:::tab[Spark SQL]
Start the Spark SQL shell with [Delta Spark](model:deltaSpark):

```bash file=../../tutorials/001-your-first-delta-table/snippets/spark_sql.sh start=start:launch end=end:launch
```
:::

:::tab[PySpark]
Open a Python session with PySpark and Delta Spark:

```bash
uv run --with pyspark==4.2.0 --with delta-spark==4.4.0 python
```

Then start a Spark session with Delta's SQL support:

```python file=./snippets/write_pyspark.py start=start:session end=end:session
```
:::

:::tab[Python]
Open a Python session with the `deltalake` package from
[delta-rs](model:deltaRs):

```bash
uv run --with "deltalake[pandas,pyarrow]==1.6.6" python
```
:::

:::tab[DuckDB]
Start the [DuckDB](model:duckdb) CLI:

```bash file=../001-read-a-delta-table/snippets/duckdb.sh start=start:launch end=end:launch
```

Then install and load its `delta` extension:

```sql file=./snippets/write_duckdb.sql start=start:setup end=end:setup
```
:::

## Append rows

Add a sixth order to the table:

:::tab[Spark SQL]
```sql file=./snippets/write_spark.sql start=start:append end=end:append
```
:::

:::tab[PySpark]
```python file=./snippets/write_pyspark.py start=start:append end=end:append
```
:::

:::tab[Python]
```python file=./snippets/write.py start=start:append end=end:append
```
:::

:::tab[DuckDB]
```sql file=./snippets/write_duckdb.sql start=start:append end=end:append
```

DuckDB writes to an attached table, not to `delta_scan`.
:::

The table now has six orders. Unlike an upsert, an append doesn't check for
duplicate rows: writing the same order twice stores it twice. The new rows must
have the table's columns. Spark and `deltalake` reject a write with other
columns unless you evolve the schema.

## Overwrite a table

Replace every row in the table with two new orders:

:::tab[Spark SQL]
```sql file=./snippets/write_spark.sql start=start:overwrite end=end:overwrite
```
:::

:::tab[PySpark]
```python file=./snippets/write_pyspark.py start=start:overwrite end=end:overwrite
```
:::

:::tab[Python]
```python file=./snippets/write.py start=start:overwrite end=end:overwrite
```
:::

The latest version now has only orders 7 and 8. The rows you replaced aren't
deleted yet: the previous version still reads all six, and their files stay
until `VACUUM` removes them after the retention period. See
[Query an earlier version of a table](../query-a-table-as-of-version/index.md).

DuckDB can't overwrite a table: `DELETE` and `UPDATE` on an attached Delta
table fail with `Can only delete from base table` and
`Can only update base table`.

## Check the write in the history

Each write is one entry in the table's history:

:::tab[Spark SQL]
```sql file=./snippets/write_spark.sql start=start:history end=end:history
```
:::

:::tab[PySpark]
```python file=./snippets/write_pyspark.py start=start:history end=end:history
```
:::

:::tab[Python]
```python file=./snippets/write.py start=start:history end=end:history
```
:::

Both writes are `WRITE` operations, and `operationParameters` names the
`mode`: `Overwrite` for version 4, and `Append` for version 3. Spark also
marks the append with `isBlindAppend`, because it added rows without reading
the table. A DuckDB append shows up in the history as `UNKNOWN`, since
DuckDB records no operation name.

## Next steps

- [Read a Delta table](../read-a-delta-table/index.md) to check the result.
- [Query an earlier version of a table](../query-a-table-as-of-version/index.md)
  to read the rows an overwrite replaced.
