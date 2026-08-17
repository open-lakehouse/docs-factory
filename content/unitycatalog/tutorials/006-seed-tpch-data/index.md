---
title: Seed TPC-H data into Unity Catalog
summary: Generate the classic eight-table TPC-H dataset with DuckDB, write it as Delta, and register it in Unity Catalog as a foundation for richer tutorials.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

A single `orders` table is enough to learn the basics, but the interesting
features — joins across entities, governed access, lineage, federation — only
come alive against data that looks like a real business. [TPC-H](https://www.tpc.org/tpch/)
is the standard benchmark schema for exactly that: eight related tables
(`region`, `nation`, `supplier`, `customer`, `part`, `partsupp`, `orders`, and
`lineitem`) modeling a wholesale supplier.

This tutorial seeds that whole schema into a [Unity Catalog](model:unityCatalogOSS)
server so later tutorials and blogs have meaningful data to work with. The flow
is three steps, once per table:

> **generate** (DuckDB) → **write Delta** (deltalake) → **register** (Unity Catalog)

:::note
You'll need a running Unity Catalog server. The colocated `compose.yaml` starts
one with `docker compose up -d`. Unity Catalog only records where an external
table lives — it never reads the files itself — so the script writes the Delta
tables to a local directory it owns (override with `TPCH_STORAGE_ROOT`).
:::

::::journey

### Generate TPC-H

[DuckDB](https://duckdb.org/docs/stable/core_extensions/tpch) ships a `tpch`
extension that generates the benchmark data in-process. `dbgen(sf = ...)` builds every
table at the given **scale factor** (`0.01` here keeps it small and fast; bump it for more data),
and each table comes straight back as an Arrow table.

```python file=./seed_tpch.py start=start:generate end=end:generate
```

### Write each table as Delta

Point [`write_deltalake`](https://delta-io.github.io/delta-rs/) at a location
under our storage root and hand it the Arrow table. That writes a real Delta
table — transaction log and all — and returns its `file://` URI.

```python file=./seed_tpch.py start=start:write-delta end=end:write-delta
```

### Register the tables in Unity Catalog

Connect with the async SDK, then create the `tpch` catalog and a schema named for
the scale factor. For each Delta table we wrote, register an **external** table.
The column list is derived from each table's Arrow schema.

```python file=./seed_tpch.py start=start:register end=end:register
```

:::tip
The `arrow_to_columns` helper (just above `main` in the script) maps Arrow types
to Unity Catalog column types and builds the `type_json` each column needs —
including the `metadata` field the server requires.
:::

### Verify the catalog

List the schema's tables to confirm all eight registered, then read one straight
back from Delta to prove the data is really there.

```python file=./seed_tpch.py start=start:verify end=end:verify
```

::::

## Where to go next

You now have a governed, eight-table TPC-H dataset in Unity Catalog — a
foundation for feature-focused tutorials that need real relationships and
history, for example:

- **Time travel** — build on [Explore a Delta table's history](../../../delta/tutorials/explore-table-history/index.md)
  against `lineitem`.
- **Access control and lineage** — grant scoped access to a subset of the schema.

To regenerate at a larger scale, raise the `sf` argument to `main` (e.g. `0.1`
for ~600k `lineitem` rows) and re-run — the flow is idempotent and safe to repeat.
