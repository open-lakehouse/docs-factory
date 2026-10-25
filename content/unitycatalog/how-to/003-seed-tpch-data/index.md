---
title: Seed TPC-H data into Unity Catalog
summary: Generate the eight-table TPC-H benchmark dataset with DuckDB, write it as Delta tables, and register them in Unity Catalog as samples.tpch.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - lakehouse.catalog
status: ready
---

[TPC-H](https://www.tpc.org/tpch/) is the standard benchmark schema. Its eight
related tables model a wholesale supplier: `region`, `nation`, `supplier`,
`customer`, `part`, `partsupp`, `orders`, and `lineitem`. Seeded into
[Unity Catalog](model:unityCatalogServer), it gives you realistic business data
to try joins, access grants, and cross-engine queries on.

This guide generates TPC-H with DuckDB, writes each table as Delta, and
registers it as an external table, three steps per table:

> **generate** (DuckDB) → **write Delta** (deltalake) → **register** (Unity Catalog)

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
:::

Unity Catalog only records where an external table lives. It never reads the
files itself, so the script writes the Delta tables to a local directory it
owns. Set `TPCH_STORAGE_ROOT` to use another directory.

::::journey

### Generate TPC-H

[DuckDB](https://duckdb.org/docs/stable/core_extensions/tpch) ships a `tpch`
extension that generates the benchmark data in-process. `dbgen(sf = ...)` builds
every table at the given **scale factor**, and each table comes straight back as
an Arrow table. A scale factor of `0.01` keeps it small and fast; raise it for
more data.

```python file=./seed_tpch.py start=start:generate end=end:generate
```

### Write each table as Delta

Point [`write_deltalake`](https://delta-io.github.io/delta-rs/) at a location
under the storage root and hand it the Arrow table. That writes a real Delta
table — transaction log and all — and returns its `file://` URI.

```python file=./seed_tpch.py start=start:write-delta end=end:write-delta
```

### Register the tables in Unity Catalog

Connect with the async SDK, then create the catalog `samples` with the schema
`tpch`. For each Delta table written, register an **external** table, with the
column list derived from the table's Arrow schema. The tables are then
`samples.tpch.lineitem`, `samples.tpch.orders`, and so on.

```python file=./seed_tpch.py start=start:register end=end:register
```

:::tip
The `arrow_to_columns` helper, just above `main` in the script, maps Arrow types
to Unity Catalog column types. It also builds the `type_json` each column needs,
including the `metadata` field the server requires.
:::

### Verify the catalog

List the schema's tables to confirm all eight registered, then read one straight
back from Delta to prove the data is really there.

```python file=./seed_tpch.py start=start:verify end=end:verify
```

::::

## Next steps

You now have an eight-table TPC-H dataset in Unity Catalog. To regenerate it at
a larger scale, raise the `sf` argument to `main` and run the script again. For
example, `0.1` gives about 600,000 `lineitem` rows. The new run replaces the
earlier tables.

- [Read and write Unity Catalog tables from DuckDB](../duckdb/index.md) queries
  the tables by name.
- [Query Unity Catalog tables from Python DataFrame libraries](../python-dataframes/index.md)
  reads them from Polars, Daft, or pandas.
