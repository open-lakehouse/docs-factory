---
title: Use Iceberg REST clients with Unity Catalog
summary: Connect Spark, DuckDB, and PyIceberg to Unity Catalog's Iceberg REST API, then create, write, change, rename, and drop managed Iceberg tables with vended S3 credentials.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - icebergRestSpec
  - icebergSpec
  - apacheSpark
  - duckdb
status: draft
---

[Unity Catalog](model:unityCatalogOSS) serves the
[Iceberg REST catalog API](model:icebergRestSpec), so any client that speaks
it can create, write, read, rename, and drop [Iceberg](model:icebergSpec)
tables in a Unity Catalog catalog. The server allocates storage for each new
table and vends short-lived credentials for it, so clients never hold bucket
keys. Iceberg tables live next to Delta tables in the same schemas, under the
same privileges.

:::prerequisites
- A catalog with managed storage on S3, such as `retail`:
  [Set managed storage for catalogs and schemas on S3](../managed-storage-s3/index.md).
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17), for Spark.
:::

## How Iceberg names map to the catalog

Every client is configured with the same three values:

| Iceberg REST setting | Value |
| --- | --- |
| Catalog URI | `http://localhost:8080/api/2.1/unity-catalog/iceberg`: the server's base URL with `/api/2.1/unity-catalog/iceberg` appended. |
| Warehouse | The name of one Unity Catalog catalog, here `retail`. A client works with one catalog at a time; configure a second client catalog for another. |
| Token | A Unity Catalog access token, sent as a bearer token. The local server has authorization disabled and accepts any value. |

Inside that catalog, an Iceberg namespace is a Unity Catalog schema, and an
Iceberg table is a table whose data source format is `ICEBERG`. Namespaces
don't nest. A table created without a location is a managed table under the
schema's or catalog's storage root; the server records where it lives and
deletes its files when you drop it.

Through this API, the server lists Iceberg tables, and Delta tables only when
they carry UniForm Iceberg metadata. Reach other Delta tables with a Delta
client, or [with both in one Spark session](#join-delta-and-iceberg-tables-in-spark).

## Connect a client

:::tab[Spark]
Open a Python session with PySpark:

```bash
uv run --with pyspark==4.1.0 python
```

```python file=./snippets/spark_iceberg.py start=start:session end=end:session
```

This is Iceberg's own Spark catalog, not the Unity Catalog connector. The
Iceberg runtime is built per Spark minor version, and the AWS bundle adds the
S3 file system that reads and writes table files with the credentials the
server vends. Naming the Spark catalog after the Unity Catalog catalog keeps
three-part names the same in both.
:::

::::tab[DuckDB]
Open a Python session with DuckDB:

```bash
uv run --with duckdb==1.5.4 python
```

Install and load the `iceberg` extension:

```python file=./snippets/duckdb_iceberg.py start=start:install end=end:install
```

Then create a secret that holds the token and attach the catalog:

```python file=./snippets/duckdb_iceberg.py start=start:attach end=end:attach
```

`ATTACH` takes the warehouse, here `retail`. DuckDB uses the credentials the
server vends for each table.

Turning off `iceberg_use_metadata_log` avoids an intermittent commit failure
on a session's second write to a table; see
[Known issues](../../reference/features-and-limitations/index.md#known-issues).

:::note
DuckDB doesn't read `AWS_ENDPOINT_URL`. Against the local environment's
simulated S3, point it at the endpoint yourself:

```python file=./snippets/duckdb_iceberg.py start=start:local-s3 end=end:local-s3
```

On real AWS, leave these settings out.
:::
::::

::::tab[PyIceberg]
Open a Python session with PyIceberg:

```bash
uv run --with "pyiceberg[pyarrow]==0.12.0" python
```

```python file=./snippets/pyiceberg_tables.py start=start:imports end=end:imports
```

```python file=./snippets/pyiceberg_tables.py start=start:connect end=end:connect
```

`load_catalog` takes the client-side name first, then the same three values.
PyIceberg uses the credentials the server vends for each table.

:::note
PyIceberg doesn't read `AWS_ENDPOINT_URL`. Against the local environment's
simulated S3, also export
`PYICEBERG_CATALOG__RETAIL__S3__ENDPOINT=http://localhost:9000` before you
start Python. The `RETAIL` part is the name you pass to `load_catalog`. On
real AWS, leave it unset.
:::
::::

## Create a schema

:::tab[Spark]
```python file=./snippets/spark_iceberg.py start=start:schema end=end:schema
```
:::

:::tab[DuckDB]
```python file=./snippets/duckdb_iceberg.py start=start:schema end=end:schema
```
:::

:::tab[PyIceberg]
```python file=./snippets/pyiceberg_tables.py start=start:schema end=end:schema
```
:::

The new namespace is an ordinary Unity Catalog schema, `retail.staging`, and
other clients see it at once.

## Create a table

:::tab[Spark]
```python file=./snippets/spark_iceberg.py start=start:create end=end:create
```
:::

:::tab[DuckDB]
```python file=./snippets/duckdb_iceberg.py start=start:create end=end:create
```
:::

:::tab[PyIceberg]
```python file=./snippets/pyiceberg_tables.py start=start:create end=end:create
```
:::

The server creates the table as `MANAGED`, with data source format `ICEBERG`,
at a location under the catalog's storage root:
`s3://uc-docs/retail/managed/__unitystorage/catalogs/<catalog id>/tables/<table id>`.

## Write and read rows

:::tab[Spark]
```python file=./snippets/spark_iceberg.py start=start:write end=end:write
```

```python file=./snippets/spark_iceberg.py start=start:read end=end:read
```

```text
+--------+--------+------+
|order_id|customer|amount|
+--------+--------+------+
|       1|     ada|   9.5|
|       2|   grace|  20.0|
+--------+--------+------+
```
:::

:::tab[DuckDB]
```python file=./snippets/duckdb_iceberg.py start=start:write end=end:write
```

```python file=./snippets/duckdb_iceberg.py start=start:read end=end:read
```

```text
┌──────────┬──────────┬────────┐
│ order_id │ customer │ amount │
│  int64   │ varchar  │ double │
├──────────┼──────────┼────────┤
│        1 │ ada      │    9.5 │
│        2 │ grace    │   20.0 │
└──────────┴──────────┴────────┘
```
:::

:::tab[PyIceberg]
```python file=./snippets/pyiceberg_tables.py start=start:write end=end:write
```

```python file=./snippets/pyiceberg_tables.py start=start:read end=end:read
```

```text
pyarrow.Table
order_id: int64
customer: string
amount: double
----
order_id: [[1,2]]
customer: [["ada","grace"]]
amount: [[9.5,20]]
```
:::

The client writes data and metadata files with the vended credentials, then
asks the server to commit the new snapshot. The server accepts a commit only if
the table hasn't changed since the client read it, so concurrent writers can't
overwrite each other.

## Update and delete rows

:::tab[Spark]
```python file=./snippets/spark_iceberg.py start=start:change end=end:change
```

`UPDATE`, `DELETE FROM`, and `MERGE INTO` need the Iceberg SQL extensions from
the session configuration.
:::

:::tab[DuckDB]
```python file=./snippets/duckdb_iceberg.py start=start:change end=end:change
```
:::

:::tab[PyIceberg]
```python file=./snippets/pyiceberg_tables.py start=start:change end=end:change
```

PyIceberg has no `UPDATE`. Replace the matching rows with `overwrite` and an
`overwrite_filter`.
:::

## Rename and drop a table

:::tab[Spark]
```python file=./snippets/spark_iceberg.py start=start:rename end=end:rename
```

```python file=./snippets/spark_iceberg.py start=start:drop end=end:drop
```
:::

:::tab[DuckDB]
```python file=./snippets/duckdb_iceberg.py start=start:rename end=end:rename
```

```python file=./snippets/duckdb_iceberg.py start=start:drop end=end:drop
```
:::

:::tab[PyIceberg]
```python file=./snippets/pyiceberg_tables.py start=start:rename end=end:rename
```

```python file=./snippets/pyiceberg_tables.py start=start:drop end=end:drop
```
:::

A rename keeps the table in its schema. Dropping a managed table removes it
from the catalog, and a background worker on the server deletes its files. An
external table, one created with an explicit location, keeps its files; the
server accepts a purge request for it but leaves the files in place.

Only tables created through Iceberg REST can be dropped through it. Drop a
Delta table through Spark's Unity Catalog connector or the
[Unity Catalog API](../../tutorials/python-client/index.md).

## Join Delta and Iceberg tables in Spark

One Spark session can hold both kinds of table: register the catalog twice,
once through the Unity Catalog connector for Delta tables and once through
Iceberg REST for Iceberg tables.

```python file=./snippets/spark_cross_format.py start=start:session end=end:session
```

The connector needs `hadoop-aws` for `s3://` paths; use the version that
matches your Spark's Hadoop libraries (3.4.2 for Spark 4.1). For the connector
settings, see [Use Spark with Unity Catalog](../configure-spark/index.md).
Create a table of each kind, then query them together:

```python file=./snippets/spark_cross_format.py start=start:tables end=end:tables
```

```python file=./snippets/spark_cross_format.py start=start:join end=end:join
```

```text
+-----+-----+
| name|total|
+-----+-----+
|  ada| 11.0|
|grace| 20.0|
+-----+-----+
```

Name each table through the catalog for its format. The connector lists the
Iceberg table too, but can't read it, and Iceberg REST doesn't list Delta
tables.

## Required privileges

With authorization enabled, the server checks the same privileges as for any
other table. Reading needs `USE CATALOG` on the catalog, `USE SCHEMA` on the
schema, and `SELECT` on the table. Writing also needs `MODIFY`; without it, the
server vends read-only credentials. Creating a table needs `CREATE TABLE` on the
schema, and creating a schema needs `CREATE SCHEMA` on the catalog. Owners have
all of these. See
[Core concepts](../../explanation/uc-basics/index.md#ownership-and-privileges).

## Next steps

- [Credential vending](../../explanation/credential-vending/index.md) explains
  how the server scopes the credentials it hands each client.
- [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
  covers the Delta side of the same catalog.
- The [Iceberg REST catalog specification](https://github.com/apache/iceberg/blob/apache-iceberg-1.11.0/open-api/rest-catalog-open-api.yaml)
  lists the endpoints these clients call.
