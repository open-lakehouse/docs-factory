---
title: One catalog, both formats, any engine
slug: uc-iceberg-rest
status: draft
tags: [unity-catalog, iceberg, apache-spark, table-formats]
series:
series_order:
author: Robert Pack
target: unitycatalog
---

Unity Catalog 0.7 turned on native Iceberg tables behind its Iceberg REST API.
Any Iceberg REST client, such as Spark, DuckDB, or PyIceberg, can now create,
write, and drop Iceberg tables in the same catalog that already governs
your Delta tables, with storage the catalog allocates and credentials it vends
per table.

:::tldr
- Unity Catalog 0.7 serves the Iceberg REST catalog API at
  `/api/2.1/unity-catalog/iceberg`, and native Iceberg tables are on by default.
- The warehouse is a Unity Catalog catalog and a namespace is a schema. New
  tables are managed tables, and clients get table-scoped S3 credentials, not
  bucket keys.
- Spark, DuckDB, and PyIceberg all create, write, update, and read the same
  table. Below, four of them pass one table around.
- One Spark session can join a Delta table and an Iceberg table from the same
  catalog.
:::

## Why your catalog shouldn't pick your format

I have sat through more than one architecture review where the table format
was decided by the catalog someone had already bought. Delta here, Iceberg
there, and two copies of the governance story to keep in sync. That was never a
good trade. The format is a property of a table and of the engines that write
it. The catalog's job is to know where the table lives, who may touch it, and
which commit is the current one.

With 0.7 Unity Catalog does that job for both. Delta tables go through the
Unity Catalog connector and the Delta API, as before. Iceberg tables go through
the Iceberg REST protocol, which nearly every Iceberg engine already speaks.
Both kinds sit in the same schemas, under the same grants. You pick the engine
per job, and nobody has to argue about the catalog.

## How Iceberg REST maps onto Unity Catalog

An Iceberg REST client needs three settings, and each maps onto something
Unity Catalog already has:

| Iceberg REST setting | In Unity Catalog |
| --- | --- |
| Catalog URI | The server's base URL plus `/api/2.1/unity-catalog/iceberg` |
| Warehouse | One catalog, for example `retail` |
| Namespace | A schema in that catalog, for example `sales` |

When a client creates a table without a location, the server places it under
the catalog's managed storage root and records it as a managed table with
format `ICEBERG`. When a client loads that table, the response carries
short-lived S3 credentials scoped to the table's prefix, plus an endpoint to
renew them
([`IcebergRestCatalogService.java` at v0.7.0](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/IcebergRestCatalogService.java)).
Read-write credentials go to the table's owner or to someone with `SELECT` and
`MODIFY`, and everyone else gets read-only ones. No engine in this post is
configured with a bucket key.

## Passing one table between four engines

To see it hold up, I had four engines take turns on one table. Spark creates
it, DuckDB changes it, PyIceberg reads it back, and Spark joins it with a Delta
table. Everything runs against the Unity Catalog docs' local environment,
which runs the 0.7.0 server next to a simulated S3. Each step is its own script
in this post's `snippets/` folder, run in order.

::::journey

### Give the catalog managed storage

Managed tables need somewhere to live. An admin registers a storage credential
and an external location once, then gives the catalog a storage root under it:

```python file=./snippets/setup_catalog.py start=start:setup end=end:setup
```

On real AWS the role ARN is an IAM role the server can assume. The
[managed storage guide](../../content/unitycatalog/how-to/010-managed-storage-s3/index.md)
covers it in depth.

### Spark writes a Delta table and an Iceberg table

One Spark session registers the catalog twice: once through the Unity Catalog
connector for Delta, once through Iceberg's own REST catalog for Iceberg.

```python file=./snippets/write_orders_spark.py start=start:session end=end:session
```

Then each catalog creates its own kind of table:

```python file=./snippets/write_orders_spark.py start=start:write end=end:write
```

`retail.sales.customers` is a managed Delta table and
`retail_iceberg.sales.orders` is a managed Iceberg table. Both sit in the same
schema, `retail.sales`.

### DuckDB appends and updates

DuckDB's `iceberg` extension attaches the same catalog by its warehouse name:

```python file=./snippets/change_orders_duckdb.py start=start:attach end=end:attach
```

```python file=./snippets/change_orders_duckdb.py start=start:change end=end:change
```

```text
┌──────────┬─────────────┬────────┐
│ order_id │ customer_id │ amount │
│  int64   │    int64    │ double │
├──────────┼─────────────┼────────┤
│       10 │           1 │    9.5 │
│       11 │           2 │   21.0 │
│       12 │           3 │   3.25 │
│       13 │           1 │    1.5 │
└──────────┴─────────────┴────────┘
```

DuckDB wrote the new Parquet files with credentials the server vended for this
one table, then asked the server to commit. The server only accepts a commit
when the table hasn't moved since the client read it, so when two engines write
at once, one gets a conflict instead of silently losing the other's rows.

### PyIceberg reads it, and the history shows who wrote what

PyIceberg needs no JVM and no extension. It needs the same three settings:

```python file=./snippets/read_orders_pyiceberg.py start=start:read end=end:read
```

```text
   order_id  customer_id  amount
0        10            1    9.50
1        11            2   21.00
2        12            3    3.25
3        13            1    1.50
7760906185630061565 append spark
9064122352910680227 append (no engine-name)
8819572098351907679 overwrite (no engine-name)
```

That snapshot list is the round trip in three lines. Spark's append stamps
`engine-name`, and DuckDB's append and update don't. DuckDB's `UPDATE` lands as
an `overwrite` snapshot.

### Spark joins Delta with Iceberg

Back in Spark, with the same two-catalog session, a join crosses the formats:

```python file=./snippets/join_orders_spark.py start=start:join end=end:join
```

```text
+-----+------+-----+
| name|orders|total|
+-----+------+-----+
|grace|     1| 21.0|
|  ada|     2| 11.0|
|linus|     1| 3.25|
+-----+------+-----+
```

Grace's 21.0 is DuckDB's update, and Linus's order is DuckDB's append. Spark
reads both through the catalog without knowing or caring which engine wrote
them.

::::

## The rough edges I hit

None of these blocked the round trip, but you will meet them:

- DuckDB's metadata log tripped me up. On a long-running local server, DuckDB 1.5.4 and
  1.5.6 sometimes failed a session's second write with
  `Requirement failed: branch main has changed`. The commit asserted the table
  as it was before DuckDB's own last write. `SET iceberg_use_metadata_log = false`
  made it go away every time. On a fresh server I couldn't reproduce it at all,
  so treat the setting as a workaround, not a diagnosis.
- Simulated S3 needs endpoint settings. Spark's S3 clients pick up `AWS_ENDPOINT_URL`.
  DuckDB and PyIceberg don't, so against the local environment they need their
  own endpoint settings, which you can see in the scripts. On AWS none of them
  need any.
- UniForm from Spark isn't there yet. Unity Catalog also serves Delta tables that carry
  UniForm Iceberg metadata through the same API. With Spark 4.1 and Delta Spark
  4.3.1, though, I couldn't create one Iceberg clients can read. The catalog
  requires deletion vectors on managed Delta tables, and UniForm's IcebergCompatV2
  requires them off. For now, if Iceberg engines need the data, write it as
  Iceberg.

## What we learned

What I like about this release is that the catalog stopped caring which
format a table uses. One set of grants, one
storage root, and one set of vended credentials cover a Delta table that Spark
writes through the connector and an Iceberg table that three different engines
write through a protocol none of them had to learn for Unity Catalog
specifically. Spark did the joins, DuckDB made quick changes from a laptop, and
PyIceberg read the table into pandas without a JVM, and none of them needed to
know who wrote the table last.

If you want to go further than the round trip,
[Use Iceberg REST clients with Unity Catalog](../../content/unitycatalog/how-to/012-iceberg-rest/index.md)
walks through every operation (schemas, tables, updates, renames, drops) for
Spark, DuckDB, and PyIceberg, each one tested against the 0.7.0 server.
