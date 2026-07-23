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
references:
  - deltaSpec
  - deltaRs
  - polars
  - duckdb
status: ready
---

Reading a Delta table means loading its current version into an in-memory
dataframe. [Delta Lake](model:deltaSpec) is an open table format, so many
engines can read the same table — pick the one that fits your stack. The tabs
below use [delta-rs](model:deltaRs) (via its `deltalake` Python package),
[Polars](model:polars), and [DuckDB](model:duckdb).

The examples below all read the `orders` sample table. To create it locally,
first bootstrap the data (this is the same table our CI reads):

```console
pip install docs-factory-seed
docs-factory-seed orders   # prints the table path
```

::::tabs{syncKey=engine}

:::tab[Python (deltalake)]

```python file=../../../examples/python/read_delta_table.py start=start:read-delta-table end=end:read-delta-table
```

:::

:::tab[Polars]

```python file=../../../examples/polars/read_delta_table.py start=start:read-delta-table end=end:read-delta-table
```

:::

:::tab[DuckDB]

```python file=../../../examples/duckdb/read_delta_table.py start=start:read-delta-table end=end:read-delta-table
```

:::

::::

## Related

- [Query a Delta table as of a version](./query-a-table-as-of-version.md) — read historical versions.
- [What is Delta Lake?](../explanation/what-is-delta-lake.md) — the concepts behind the format.
