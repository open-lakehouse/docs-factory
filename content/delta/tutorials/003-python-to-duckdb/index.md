---
title: Build a Delta table in Python and query it with DuckDB
summary: Create and append to a Delta table with the deltalake Python package, read its history, then query the same table with DuckDB, without a JVM.
diataxis: tutorial
project: delta
delta_features: [time-travel]
references:
  - deltaSpec
  - deltaRs
  - duckdb
status: draft
---

In this tutorial you build a [Delta Lake](model:deltaSpec) table from Python
with the `deltalake` package from [delta-rs](model:deltaRs), then query it with
[DuckDB](model:duckdb). Neither needs Java or Spark. You create the same
`orders` table as [Create your first Delta table](../your-first-delta-table/index.md),
in the same two commits, so every how-to guide works on the result.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
:::

::::journey

### Open a Python session

Open a Python session with `deltalake` and DuckDB installed:

```bash
uv run --with "deltalake[pandas,pyarrow]==1.6.6" --with duckdb==1.5.6 python
```

Enter each of the following snippets in it, in order.

### Create a table

Define the table's schema with PyArrow, then create an empty table at a path:

```python file=./snippets/python_to_duckdb.py start=start:create end=end:create
```

Creating the table writes version 0 of its transaction log: the schema and no
rows.

### Append rows

To add data to a Delta table, write in append mode:

```python file=./snippets/python_to_duckdb.py start=start:append-first end=end:append-first
```

Each write is one commit and creates a new table version. This one is version 1.

### Read the table

Open the table and read it into a pandas DataFrame:

```python file=./snippets/python_to_duckdb.py start=start:read end=end:read
```

`dt.version()` prints `1`, and the DataFrame holds the three orders.

### Append more rows

Write a second batch, which creates version 2:

```python file=./snippets/python_to_duckdb.py start=start:append-second end=end:append-second
```

Appending doesn't check for duplicate rows. To insert or update rows by key,
use a merge instead.

### Look at the table's history

`history()` lists the commits, newest first:

```python file=./snippets/python_to_duckdb.py start=start:history end=end:history
```

You see `2 WRITE`, `1 WRITE`, and `0 CREATE TABLE`. Each entry also records
the commit's timestamp, its parameters (`mode` is `Append`), and its metrics,
such as the number of rows added.

### Query the table with DuckDB

Open DuckDB in the same session and load its `delta` extension:

```python file=./snippets/python_to_duckdb.py start=start:duckdb-open end=end:duckdb-open
```

`delta_scan` reads the table's latest version by path, so you can query it
like any other DuckDB table:

```python file=./snippets/python_to_duckdb.py start=start:duckdb-scan end=end:duckdb-scan
```

The result sums all five orders by product.

### Query an earlier version with DuckDB

Attach the table under a name, then read it as it was at version 1:

```python file=./snippets/python_to_duckdb.py start=start:duckdb-version end=end:duckdb-version
```

The count is `3`, before the second append. Reading an older snapshot like
this is called time travel. DuckDB selects a version by number; Python and
Spark also accept a timestamp.

::::

## Next steps

- [Read a Delta table](../../how-to/read-a-delta-table/index.md), including
  column selection and filters, in any of the four interfaces.
- [Query an earlier version of a table](../../how-to/query-a-table-as-of-version/index.md)
  by version or timestamp.
- [Create your first Delta table](../your-first-delta-table/index.md): the same
  table with Spark SQL.
