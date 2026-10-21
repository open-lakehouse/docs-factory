---
title: Use DuckDB with Unity Catalog
summary: Attach a Unity Catalog catalog in DuckDB, query its Delta tables with SQL, and append rows.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
status: ready
---

DuckDB queries [Unity Catalog](model:unityCatalogOSS) tables with SQL and
appends rows to them, including catalog-managed Delta tables. DuckDB's
`unity_catalog` extension attaches a catalog as a DuckDB database, and its
`delta` extension reads and writes the [Delta](model:deltaSpec) files. Appends
to a catalog-managed table go through the server, like a Spark write.

:::prerequisites
- A Delta table in Unity Catalog, such as `retail.sales.orders` from
  [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md).
- Table files that DuckDB can reach, such as the local server's
  [shared folder](../run-local-server/index.md#share-a-folder-with-the-server).
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
:::

## Install the extensions

Open a Python session with DuckDB:

```bash
uv run --with duckdb==1.5.6 python
```

Install and load `delta` and `unity_catalog`:

```python file=./snippets/duckdb_tables.py start=start:install end=end:install
```

:::note
This page installs `unity_catalog` from DuckDB's `core_nightly` channel.
:::

## Attach a catalog

Create a secret that holds the server's address and a token, then attach one
Unity Catalog catalog as a DuckDB database:

```python file=./snippets/duckdb_tables.py start=start:attach end=end:attach
```

- `ENDPOINT` is the server's base URL, without `/api/2.1/unity-catalog`.
- `TOKEN` is sent as a bearer token. The local server has authorization
  disabled and accepts any value. On a secured server, use a Unity Catalog
  access token.
- `DEFAULT_SCHEMA` is the schema DuckDB uses for unqualified table names.

Leave the secret unnamed. With a named secret (`CREATE SECRET uc (...)`),
`ATTACH` fails with `Could not resolve hostname`.

## List tables

```python file=./snippets/duckdb_tables.py start=start:list end=end:list
```

```text
┌──────────┬─────────┬─────────┐
│ database │ schema  │  name   │
│ varchar  │ varchar │ varchar │
├──────────┼─────────┼─────────┤
│ retail   │ sales   │ orders  │
└──────────┴─────────┴─────────┘
```

## Query a table

Use three-part names, or just the table name for tables in the default schema:

```python file=./snippets/duckdb_tables.py start=start:query end=end:query
```

```text
┌──────────┬───────────────┐
│ customer │    amount     │
│ varchar  │ decimal(10,2) │
├──────────┼───────────────┤
│ ada      │          9.50 │
│ grace    │         20.00 │
└──────────┴───────────────┘
```

DuckDB asks the server for the table's location and for temporary credentials,
then reads the Delta files directly from storage. For a catalog-managed table it
reads the latest version the server has accepted.

## Append rows

`INSERT` adds rows to the table:

```python file=./snippets/duckdb_tables.py start=start:append end=end:append
```

On a catalog-managed table, DuckDB writes the new data and commit file, then
asks the server to accept the commit as the table's next version. From then on,
Spark and every other client see the new rows.

## Create, change, and drop tables

DuckDB reads tables and appends rows. Create tables with Spark. Update, delete
from, and drop them with Spark too, as in
[Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md).

## Required privileges

With authorization enabled, reading needs `USE CATALOG` on the catalog,
`USE SCHEMA` on the schema, and `SELECT` on the table. Appending also needs
`MODIFY` on the table. Owners have all of these. See
[Core concepts](../../explanation/uc-basics/index.md#ownership-and-privileges).

## Next steps

- [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
  explains why an append from DuckDB is safe next to a Spark writer.
- [DuckDB's Unity Catalog extension documentation](https://duckdb.org/docs/stable/core_extensions/unity_catalog)
  covers its other secret options and cloud storage.
