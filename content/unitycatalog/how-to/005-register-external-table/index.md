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

This page shows how to register a [Delta](model:deltaSpec) table that already
exists in storage as an *external table* in
[Unity Catalog](model:unityCatalogOSS). An external table is a catalog entry
that records a table's name, columns, format, and storage location. The data
stays where it is, owned by whatever process writes it. Unity Catalog never
moves or rewrites the files.

To let Unity Catalog allocate storage and coordinate writes, use a managed
table instead. For the difference, see
[Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md).

## Requirements

- A Unity Catalog server, version 0.6.0, and a schema to register the table in.
  This page uses `retail.sales`; see
  [Create and manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).
- A Delta table at a location the server can reach. The local setup below
  mounts one directory, `UC_DOCS_ROOT` (default `/tmp/uc-docs`), at the same
  path on your machine and in the server container. A `file://` location then
  means the same files to both.
- For the Python examples, Python 3.11 or later with `unitycatalog-client`
  0.6.0 and `deltalake`. For the CLI examples, Docker.

```yaml file=./compose.yaml title="compose.yaml"
```

```properties file=./server.properties title="server.properties"
```

:::tip
The server container must see the same directory that your client sees. Docker
Desktop shares `/tmp` by default, but Colima and some other VMs share only your
home directory. On those, set `UC_DOCS_ROOT` to a path under your home directory
before you run `docker compose up -d`, and keep it set while you run the
examples.
:::

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

On cloud storage, the reader also needs credentials. A client with the right
privileges can ask the server for short-lived ones; see
[Credential vending](../../explanation/credential-vending/index.md).

## Change a registered table

The Unity Catalog REST API in 0.6.0 has no update endpoint for tables. To change
an external table's columns or comment, drop it and register it again. The data
isn't affected.

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

The privilege rules on this page come from the server's 0.6.0 table
authorization expressions. They apply only when the server runs with
authorization enabled.

## Next steps

- [Create and manage volumes](../manage-volumes/index.md) to govern
  non-tabular files in the same schema.
- [Credential vending](../../explanation/credential-vending/index.md) explains
  how engines get access to cloud storage.
