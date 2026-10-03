---
title: Query Unity Catalog tables from Python DataFrame libraries
summary: Find, read, and append to external Delta tables in Unity Catalog from Polars, Daft, and pandas, with storage credentials vended by the server, plus what these libraries can't do yet.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
  - polars
  - deltaRs
status: draft
---

This page shows how to use [Unity Catalog](model:unityCatalogOSS) tables from
three Python DataFrame libraries: Polars, Daft, and pandas. Each one looks up a
table by name, asks the server for temporary storage credentials, and then reads
or writes the [Delta](model:deltaSpec) files directly in storage.

All three read Delta through [delta-rs](model:deltaRs), a path-based Delta
library, so they work only with external tables. For catalog-managed tables, use
[Spark](../configure-spark/index.md) or [DuckDB](../duckdb/index.md); see
[What these libraries can't do yet](#what-these-libraries-cant-do-yet).

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

The compose file below runs the server next to a local stand-in for Amazon S3
and STS. The server vends S3 credentials for
`s3://uc-docs` just as it would on AWS. It also mounts `UC_DOCS_ROOT` (default
`/tmp/uc-docs`) at the same path on your machine and in the container, for
tables on local storage.

```yaml file=./compose.yaml title="compose.yaml"
```

```properties file=./server.properties title="server.properties"
```

Your client reaches the simulated S3 at `localhost:9000` instead of AWS. Set
two variables before you run the examples. On real AWS, leave them unset.

```bash
export AWS_ENDPOINT_URL=http://localhost:9000
export AWS_ALLOW_HTTP=true
```

The Polars and pandas examples use a table on S3. The Daft examples use a table
on local storage, because Daft's reads failed against the simulated S3; see
[What these libraries can't do yet](#what-these-libraries-cant-do-yet).

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
the commit, so it doesn't coordinate writers on an external table. Daft can't
append to a table on local storage; see the next section.

## What these libraries can't do yet

With the versions on this page and a 0.6.0 server:

| Limitation | Affects | Result |
| --- | --- | --- |
| Catalog-managed tables | Polars, Daft, pandas | Reads and writes fail with `Max catalog version is required when loading a catalog-managed table`. See [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md). |
| Append to a table on local storage | Daft | The server vends no credentials for `file://` paths, and Daft then fails with `io_config was not provided to write_deltalake`. |
| Tables on S3 | Daft | Not tested here. Against the simulated S3, Daft received credentials but its reads failed with `Generic S3 error`. |
| `uc://` tables on local storage | pandas | `deltalake` fails with `error decoding response body` on the credentials response. Look up `storage_location` with the Python client and read the path instead, as in [Register an existing external table](../register-external-table/index.md#read-the-data). |
| Tables written by Polars | Daft | Polars writes strings as `Utf8View`, and Daft 0.7.25 fails with `Unsupported Arrow DataType: Utf8View`. |

For other operations, such as creating or dropping tables, use the
[Python client](../../tutorials/python-client/index.md) or Spark. For each
engine's supported operations, see
[Clients and engines](../../reference/clients-and-engines/index.md).

## Required privileges

With authorization enabled, reading needs `USE CATALOG` on the catalog,
`USE SCHEMA` on the schema, and `SELECT` on the table. Appending also needs
`MODIFY` on the table. Owners have all of these. Privilege names follow the
0.6.0 server's authorization rules; see
[Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md).

## Next steps

- [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
  explains why path-based libraries can't use managed tables.
- The [Polars](https://docs.pola.rs/api/python/stable/reference/catalog/index.html),
  [Daft](https://docs.daft.ai/en/stable/connectors/unity_catalog/), and
  [delta-rs](https://delta-io.github.io/delta-rs/) documentation cover other
  storage options and authentication methods.
