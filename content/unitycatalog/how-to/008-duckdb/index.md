---
title: Read and write Unity Catalog tables from DuckDB
summary: Attach a Unity Catalog catalog in DuckDB, query its Delta tables with SQL, and append rows to a catalog-managed table, plus the operations DuckDB doesn't support yet.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
status: draft
---

This page shows how to query and append to
[Unity Catalog](model:unityCatalogOSS) tables from DuckDB. DuckDB's
`unity_catalog` extension attaches a catalog as a DuckDB database, and its
`delta` extension reads and writes the [Delta](model:deltaSpec) files. Appends
to a catalog-managed table go through the server, like a Spark write.

## Requirements

- A Unity Catalog server, version 0.6.0, with at least one Delta table. DuckDB
  can't create tables in Unity Catalog. Create them with Spark, as in
  [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md),
  or register existing ones as in
  [Register an existing external table](../register-external-table/index.md).
  This page uses the managed table `retail.sales.orders` from that tutorial.
- DuckDB 1.5.4. This page uses its Python package, `duckdb==1.5.4`; the same
  SQL works in the DuckDB CLI.
- Table files that DuckDB can reach. Locally, the compose file below mounts
  `UC_DOCS_ROOT` (default `/tmp/uc-docs`) at the same path on your machine and in
  the server's container.

```yaml file=./compose.yaml title="compose.yaml"
```

```properties file=./server.properties title="server.properties"
```

## Install the extensions

Install and load `delta` and `unity_catalog`:

```python file=./snippets/duckdb_tables.py start=start:install end=end:install
```

:::note
This page installs `unity_catalog` from DuckDB's `core_nightly` channel. The
stable build for DuckDB 1.5.4 can't read tables with `DECIMAL` columns and fails
with `Invalid field found while parsing field: type_precision`. Switch to a plain
`INSTALL unity_catalog` once a stable release reads your tables.
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

`INSERT` adds rows to a Delta table:

```python file=./snippets/duckdb_tables.py start=start:append end=end:append
```

On a catalog-managed table, DuckDB writes the new data and commit file, then
asks the server to accept the commit as the table's next version. From then on,
Spark and every other client see the new rows.

## What DuckDB can't do yet

With DuckDB 1.5.4 and the nightly `unity_catalog` extension (build `3ab8508`):

| Operation | Result |
| --- | --- |
| `CREATE TABLE`, `CREATE TABLE … AS SELECT` | `Not implemented Error` |
| `UPDATE`, `DELETE` | `Binder Error: Can only update base table` (or `delete from`) |
| `DROP TABLE` | `Not implemented Error` |

Use Spark for these. For each table operation's support across engines, see
[Clients and engines](../../reference/clients-and-engines/index.md).

## Required privileges

With authorization enabled, reading needs `USE CATALOG` on the catalog,
`USE SCHEMA` on the schema, and `SELECT` on the table. Appending also needs
`MODIFY` on the table. Owners have all of these. Privilege names follow the
0.6.0 server's authorization rules; see
[Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md).

## Next steps

- [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
  explains why an append from DuckDB is safe next to a Spark writer.
- [DuckDB's Unity Catalog extension documentation](https://duckdb.org/docs/stable/core_extensions/unity_catalog)
  covers its other secret options and cloud storage.
