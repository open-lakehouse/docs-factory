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

Unity Catalog doesn't ingest rows — it *governs* tables that live in object
storage. So we generate the data, write each table as a real Delta table under
the server's managed root, and then register it as an external Delta table Unity
Catalog knows about. Every step below pulls its code from a single runnable file
our CI executes against a real server, so what you copy is what we test.

:::note
You'll need a running Unity Catalog server. The colocated `compose.yaml` starts
one (`docker compose up -d`) with a managed-table root at `file:///tmp/uc-test`,
matching the storage path this script writes to.
:::

::::journey

### Generate TPC-H with DuckDB

[DuckDB](https://duckdb.org/docs/stable/core_extensions/tpch) ships a `tpch`
extension that generates the benchmark data in-process — no external tool to
install, no files to download. `dbgen(sf = ...)` builds every table at the given
**scale factor** (`0.01` here keeps it small and fast; bump it for more data),
and each table comes straight back as an Arrow table.

```python file=./seed_tpch.py start=start:generate end=end:generate
```

### Write each table as Delta

Point [`write_deltalake`](https://delta-io.github.io/delta-rs/) at a location
under the managed root and hand it the Arrow table. That writes a real Delta
table — transaction log and all — which Unity Catalog will govern in the next
step.

```python file=./seed_tpch.py start=start:write-delta end=end:write-delta
```

### Register the tables in Unity Catalog

Connect with the async SDK, then create the `tpch` catalog and a schema named for
the scale factor. For each Delta table we wrote, register an **external** table:
Unity Catalog stores its schema and storage location while the rows stay in
Delta. The column list is derived from each table's Arrow schema.

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

- **Joins across governed tables** — `orders` ⋈ `lineitem` ⋈ `customer`.
- **Time travel** — build on [Explore a Delta table's history](../../../delta/tutorials/explore-table-history/index.md)
  against `lineitem`.
- **Access control and lineage** — grant scoped access to a subset of the schema.

To regenerate at a larger scale, raise the `sf` argument to `main` (e.g. `0.1`
for ~600k `lineitem` rows) and re-run — the flow is idempotent and safe to repeat.
