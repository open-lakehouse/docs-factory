---
title: Query Unity Catalog tables from Python DataFrame libraries
summary: Find, read, and append to external Delta tables in Unity Catalog from Polars, Daft, and pandas, with storage credentials vended by the server.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
  - polars
  - deltaRs
status: draft
---

Polars, Daft, and pandas can find [Unity Catalog](model:unityCatalogOSS)
tables by name and read and append to them. Each library looks up the table,
asks the server for temporary storage credentials, and then reads or writes the
[Delta](model:deltaSpec) files directly in storage.

All three work with external Delta tables, through
[delta-rs](model:deltaRs). For catalog-managed tables, use
[Spark](../configure-spark/index.md) or [DuckDB](../duckdb/index.md), which
commit through the server.

## Requirements

- A Unity Catalog server, version 0.6.0, with an external Delta table. This
  page uses `retail.sales.orders`; to register your own, see
  [Register an existing external table](../register-external-table/index.md).
- Python 3.11 or later, with one of:

  | Library | Packages |
  | --- | --- |
  | Polars | `polars==1.44.2` |
  | Daft | `daft[unity]==0.7.25` and `tenacity` |
  | pandas | `pandas==2.3.3` and `deltalake==1.6.6` |

  `daft[unity]` 0.7.25 doesn't declare its `tenacity` dependency, so install it
  yourself.
- For tables on S3, an
  [external location](../configure-aws-storage/index.md) that covers the
  table's path, so that the server can vend credentials for it.

To follow along, start the
[local server with simulated S3](../run-local-server/index.md#start-the-server-with-simulated-s3)
and set its `AWS_ENDPOINT_URL` and `AWS_ALLOW_HTTP` variables. On real AWS,
leave them unset.

The Polars and pandas examples use a table on S3, and the Daft examples a table
on local storage, which is what each library is tested with here; see
[Known issues in 0.6.0](../../reference/features-and-limitations/index.md#known-issues-in-060).

## Connect to the server

:::tab[Polars]
```python file=./snippets/polars_tables.py start=start:connect end=end:connect
```

`pl.Catalog` takes the server's base URL, without `/api/2.1/unity-catalog`.
`require_https=False` allows the local `http://` address. On a secured server,
pass a Unity Catalog access token as `bearer_token`. Polars marks `pl.Catalog`
as unstable, so its API may change in any release.
:::

:::tab[Daft]
```python file=./snippets/daft_tables.py start=start:connect end=end:connect
```

Pass a `token` even though the local server has authorization disabled. Without
one, Daft 0.7.25 sends an empty `Authorization` header and every request fails.
On a secured server, use a Unity Catalog access token. Daft 0.7.25 exposes the
client only from `daft.catalog.__unity`.
:::

:::tab[pandas]
```python file=./snippets/pandas_tables.py start=start:connect end=end:connect
```

pandas has no catalog support of its own. The `deltalake` package resolves
`uc://catalog.schema.table` names through these `unity_*` options and returns
pandas DataFrames.
:::

## List tables

:::tab[Polars]
```python file=./snippets/polars_tables.py start=start:list end=end:list
```

```text
orders EXTERNAL s3://uc-docs/retail/orders
```

`list_catalogs()` and `list_namespaces(catalog)` list the levels above.
:::

:::tab[Daft]
```python file=./snippets/daft_tables.py start=start:list end=end:list
```

```text
[Identifier('retail.sales.orders')]
```
:::

`deltalake` can't list tables. With pandas, use the
[Python client](../../tutorials/python-client/index.md) to find them.

## Read a table

:::tab[Polars]
```python file=./snippets/polars_tables.py start=start:read end=end:read
```

`scan_table` returns a `LazyFrame`, so filters run as Polars reads the files.
:::

:::tab[Daft]
```python file=./snippets/daft_tables.py start=start:read end=end:read
```
:::

:::tab[pandas]
```python file=./snippets/pandas_tables.py start=start:read end=end:read
```
:::

Each library requests read credentials for the table's location from the
server, and then reads the Delta files with them. For how vending works, see
[Credential vending](../../explanation/credential-vending/index.md).

## Append rows

:::tab[Polars]
```python file=./snippets/polars_tables.py start=start:append end=end:append
```
:::

:::tab[pandas]
```python file=./snippets/pandas_tables.py start=start:append end=end:append
```
:::

The library requests read-write credentials, writes new Parquet files, and
commits a new version to the table's Delta log. The server isn't involved in
the commit, so it doesn't coordinate writers on an external table.

## Other table operations

Create and drop tables with the [Python client](../../tutorials/python-client/index.md)
or Spark. [Clients and engines](../../reference/clients-and-engines/index.md#table-operations-by-engine)
lists the operations each library supports with these versions, and
[Known issues in 0.6.0](../../reference/features-and-limitations/index.md#known-issues-in-060) lists the errors you see outside them.

## Required privileges

With authorization enabled, reading needs `USE CATALOG` on the catalog,
`USE SCHEMA` on the schema, and `SELECT` on the table. Appending also needs
`MODIFY` on the table. Owners have all of these. See
[Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md#ownership-and-privileges).

## Next steps

- [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
  explains why path-based libraries can't use managed tables.
- The [Polars](https://docs.pola.rs/api/python/stable/reference/catalog/index.html),
  [Daft](https://docs.daft.ai/en/stable/connectors/unity_catalog/), and
  [delta-rs](https://delta-io.github.io/delta-rs/) documentation cover other
  storage options and authentication methods.
