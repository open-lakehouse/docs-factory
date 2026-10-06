---
title: Register external files as tables
summary: Register Parquet, CSV, JSON, and other file-based data as external tables in Unity Catalog, and read them from PyArrow, Polars, or DuckDB.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: ready
---

[Unity Catalog](model:unityCatalogOSS) can give a folder of plain data files a
governed name, just as it does for a Delta table. An external table in format
`PARQUET`, `CSV`, `JSON`, `AVRO`, `ORC`, or `TEXT` records the table's name,
columns, format, and location. The files stay where they are.

These files have no transaction log, so the catalog entry is the only place
their schema is recorded. Registering them works the same way as
[registering a Delta table](../register-external-table/index.md). Reading them
is different: you look the table up, then read its location with the reader for
its format.

:::prerequisites
- A schema to register the tables in. This page uses `retail.sales`; see
  [Create and manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).
- A folder of data files the server can reach. On the
  [local server](../run-local-server/index.md), that's a folder under
  [`UC_DOCS_ROOT`](../run-local-server/index.md#share-a-folder-with-the-server).
- For the Python examples, Python 3.11 or later with `unitycatalog-client`
  0.6.0 and `pyarrow`. To read the tables, `polars==1.44.2` or `duckdb==1.5.4`.
:::

## Set up the client

If you don't have files at hand, write the same three rows as Parquet, CSV, and
JSON, one folder per table:

```python file=./snippets/file_formats.py start=start:write-sample end=end:write-sample
```

Set up the client for your interface:

:::tab[Python SDK]
```python file=./snippets/file_formats.py start=start:connect end=end:connect
```
:::

:::tab[CLI]
```bash file=./snippets/file_formats.sh start=start:setup end=end:setup
```
:::

## Register the tables

Create each table with type `EXTERNAL`, the files' format, and the folder that
holds them. Point the location at a folder, not a single file. The table is
every file in it.

:::tab[Python SDK]
The SDK needs each column's type name, SQL type, and `type_json`. A
small mapping builds them from an Arrow schema:

```python file=./snippets/file_formats.py start=start:columns end=end:columns
```

Read the schema from one of the files and register each folder:

```python file=./snippets/file_formats.py start=start:register end=end:register
```
:::

:::tab[CLI]
```bash file=./snippets/file_formats.sh start=start:register end=end:register
```

For any format other than `DELTA`, the CLI writes nothing to the location.
:::

:::warning
The server doesn't check that the files exist, match the columns, or use the
declared format. It also stores no reader options, such as a CSV header or
delimiter. If you want to record those, add them as table `properties`. Readers
won't apply them on their own.
:::

The privileges are the same as for
[a Delta external table](../register-external-table/index.md#register-the-table).

## Read the data

Look the table up to get its format and location:

```python file=./snippets/file_formats.py start=start:lookup end=end:lookup
```

Then read the folder with that format's reader:

:::tab[PyArrow]
```python file=./snippets/file_formats.py start=start:pyarrow end=end:pyarrow
```
:::

:::tab[Polars]
```python file=./snippets/file_formats.py start=start:polars end=end:polars
```
:::

:::tab[DuckDB]
```python file=./snippets/file_formats.py start=start:duckdb end=end:duckdb
```
:::

These readers infer column types from the files. The catalog's columns are what
other users see, so keep the files consistent with them.

Polars `Catalog.scan_table`, the DuckDB `unity_catalog` extension, and
`uc table read` can't read these tables by name. See
[Known issues](../../reference/features-and-limitations/index.md#known-issues).
On cloud storage, readers also need credentials; see
[Credential vending](../../explanation/credential-vending/index.md).

## Drop the tables

Dropping an external table deletes only the catalog entry. The files are
untouched.

:::tab[Python SDK]
```python file=./snippets/file_formats.py start=start:drop end=end:drop
```
:::

:::tab[CLI]
```bash file=./snippets/file_formats.sh start=start:drop end=end:drop
```
:::

To change a table's columns, drop it and register it again.

## When to use Delta instead

Plain files work for data written once and read many times, such as exports and
drops from other systems. They lack what a table format adds:

- **No transactions.** A reader can see a half-written folder, and two writers
  can overwrite each other's files.
- **No row-level changes.** Updating or deleting rows means rewriting files
  yourself.
- **No schema enforcement or evolution.** Any file in the folder can have any
  columns.
- **Slower reads at scale.** Readers list the folder and read every file's
  footer or contents to plan a query. Delta keeps file lists and statistics in
  its log.

For data that changes, write Delta and
[register it](../register-external-table/index.md), or let Unity Catalog
[manage the table](../../tutorials/managed-delta-table/index.md).

## Next steps

- [Register an existing external table](../register-external-table/index.md)
  covers Delta tables, which engines can read by name.
- [Create and manage volumes](../manage-volumes/index.md) to govern files that
  aren't tables.
