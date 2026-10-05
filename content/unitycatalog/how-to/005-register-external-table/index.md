---
title: Register an existing external table
summary: Register a Delta table that already exists in storage as an external table in Unity Catalog, inspect and read it, and drop it without losing data.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
status: draft
---

Registering a [Delta](model:deltaSpec) table that already exists in storage as
an *external table* gives it a governed name in
[Unity Catalog](model:unityCatalogOSS), so that every engine can find it as
`catalog.schema.table`. An external table is a catalog entry
that records a table's name, columns, format, and storage location. The data
stays where it is, owned by whatever process writes it. Unity Catalog never
moves or rewrites the files.

To let Unity Catalog allocate storage and coordinate writes, use a
[managed table](../../tutorials/managed-delta-table/index.md) instead. For the
difference, see
[External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md).

:::prerequisites
- A Unity Catalog server, version 0.6.0, and a schema to register the table in.
  This page uses `retail.sales`; see
  [Create and manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).
- A Delta table at a location the server can reach. On the
  [local server](../run-local-server/index.md), that's a folder under
  [`UC_DOCS_ROOT`](../run-local-server/index.md#share-a-folder-with-the-server).
- For the Python examples, Python 3.11 or later with `unitycatalog-client`
  0.6.0 and `deltalake`. To read the table from another engine,
  `polars==1.44.2`, `daft[unity]==0.7.25` with `tenacity`, or `duckdb==1.5.4`.
:::

## Set up the client

If you don't have a table at hand, write a small one:

```python file=./snippets/external_table.py start=start:write-sample end=end:write-sample
```

Set up the client for your interface:

:::tab[Python SDK]
```python file=./snippets/external_table.py start=start:connect end=end:connect
```
:::

:::tab[CLI]
```bash file=./snippets/external_table.sh start=start:setup end=end:setup
```
:::

## Describe the table's columns

The catalog stores its own copy of the table's columns. You supply them when you
register the table, and they should match the Delta schema.

:::tab[Python SDK]
Each `ColumnInfo` needs a type name, a SQL type string, and `type_json`, the
column's JSON in Delta schema form. Reading the schema from the Delta log
provides all three:

```python file=./snippets/external_table.py start=start:columns end=end:columns
```
:::

:::tab[CLI]
The CLI takes the columns as one `"name TYPE, ..."` string and builds the column
metadata itself. Supported types: `BOOLEAN`, `BYTE`, `SHORT`, `INT`, `LONG`,
`FLOAT`, `DOUBLE`, `DATE`, `TIMESTAMP`, `TIMESTAMP_NTZ`, `STRING`, `BINARY`,
and `DECIMAL`.
:::

## Register the table

Create the table with type `EXTERNAL`, format `DELTA`, and the table's
location.

::::tab[Python SDK]
```python file=./snippets/external_table.py start=start:register end=end:register
```
::::

::::tab[CLI]
```bash file=./snippets/external_table.sh start=start:register end=end:register
```

:::note
Unlike the API, the CLI creates an empty Delta table if the location doesn't
have one. If the location already holds a Delta table, the CLI leaves it
unchanged.
:::
::::

:::warning
Registration is metadata only. The server doesn't check that the location exists
or that the columns match the files. A typo in `storage_location` still
registers, and the error surfaces later, when an engine tries to read the
table.
:::

For Parquet, CSV, and other formats, see
[Table storage formats](../table-storage-formats/index.md).

**Required privileges:** `USE_CATALOG` on the catalog (or ownership of it),
plus ownership of the schema or `USE_SCHEMA` and `CREATE_TABLE` on it. The
location must not overlap another table or volume. If it falls inside an
external location, you also need `CREATE_EXTERNAL_TABLE` on that external
location, or ownership of it.

## View the table

:::tab[Python SDK]
```python file=./snippets/external_table.py start=start:view end=end:view
```
:::

:::tab[CLI]
```bash file=./snippets/external_table.sh start=start:view end=end:view
```
:::

**Required privileges:** `SELECT`, `MODIFY`, or ownership on the table, plus
`USE_SCHEMA` and `USE_CATALOG`. Owners of the schema (with `USE_CATALOG`), the
catalog, or the metastore can also view it.

## Read the data

Unity Catalog isn't in the data path. A client looks up the table, then reads
the files at `storage_location` with a Delta reader.

:::tab[Python SDK]
```python file=./snippets/external_table.py start=start:read end=end:read
```
:::

:::tab[CLI]
```bash file=./snippets/external_table.sh start=start:read end=end:read
```

`table read` runs inside the server container, so it reads the files at the
container's view of `storage_location`.
:::

:::tab[Polars]
```python file=./snippets/read_engines.py start=start:polars end=end:polars
```

Polars looks up the table by name and reads its location. See
[Query Unity Catalog tables from Python DataFrame libraries](../python-dataframes/index.md).
:::

:::tab[Daft]
```python file=./snippets/read_engines.py start=start:daft end=end:daft
```

See
[Query Unity Catalog tables from Python DataFrame libraries](../python-dataframes/index.md).
:::

:::tab[DuckDB]
```python file=./snippets/read_engines.py start=start:duckdb end=end:duckdb
```

See [Read and write Unity Catalog tables from DuckDB](../duckdb/index.md).
:::

On cloud storage, the reader also needs credentials. A client with the right
privileges can ask the server for short-lived ones; see
[Credential vending](../../explanation/credential-vending/index.md).

## Change a registered table

To change an external table's columns or comment, drop it and register it
again. The data isn't affected. For Delta tables that Unity Catalog manages,
engines change the schema and properties through Delta commits instead.

## Drop the table

Dropping an external table deletes only the catalog entry.

:::tab[Python SDK]
```python file=./snippets/external_table.py start=start:drop end=end:drop
```
:::

:::tab[CLI]
```bash file=./snippets/external_table.sh start=start:drop end=end:drop
```
:::

The files at the old location are untouched. You can read them by path or
register them again. To delete the data too, delete the files with your storage
tools.

**Required privileges:** ownership of the table plus `USE_SCHEMA` and
`USE_CATALOG`, or ownership of the schema (with `USE_CATALOG`) or the catalog.

## Next steps

- [Create and manage volumes](../manage-volumes/index.md) to govern
  non-tabular files in the same schema.
- [Credential vending](../../explanation/credential-vending/index.md) explains
  how engines get access to cloud storage.
