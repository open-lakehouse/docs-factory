---
title: Read a Delta table
summary: Load a Delta table into a dataframe from Python, Polars, DuckDB, Rust, or Spark.
diataxis: how-to
project: delta
engines: [python, polars, duckdb, rust, spark]
delta_features: []
prerequisites:
  packages:
    python: [deltalake, pandas]
    polars: [polars]
    duckdb: [duckdb]
  datasets: [orders]
snippets:
  - file: ../../../examples/python/read_delta_table.py
    start: docs-read-delta-table-start
    end: docs-read-delta-table-end
    engine: python
  - file: ../../../examples/polars/read_delta_table.py
    start: docs-read-delta-table-start
    end: docs-read-delta-table-end
    engine: polars
  - file: ../../../examples/duckdb/read_delta_table.py
    start: docs-read-delta-table-start
    end: docs-read-delta-table-end
    engine: duckdb
status: published
---

# Read a Delta table

Reading a Delta table means loading its current version into an in-memory
dataframe. Delta is an open table format, so many engines can read the same
table — pick the one that fits your stack.

The examples below all read the `orders` sample table. To create it locally,
first bootstrap the data (this is the same table our CI reads):

```console
pip install docs-factory-seed
docs-factory-seed orders   # prints the table path
```

## Python (deltalake)

```python file=../../../examples/python/read_delta_table.py start=docs-read-delta-table-start end=docs-read-delta-table-end
```

## Polars

```python file=../../../examples/polars/read_delta_table.py start=docs-read-delta-table-start end=docs-read-delta-table-end
```

## DuckDB

```python file=../../../examples/duckdb/read_delta_table.py start=docs-read-delta-table-start end=docs-read-delta-table-end
```

## Related

- [Query a Delta table as of a version](./query-a-table-as-of-version.md) — read historical versions.
- [What is Delta Lake?](../explanation/what-is-delta-lake.md) — the concepts behind the format.
