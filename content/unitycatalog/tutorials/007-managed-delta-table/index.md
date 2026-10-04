---
title: Create and update a catalog-managed Delta table
summary: Give a catalog managed storage, then use Spark to create a Delta table that Unity Catalog manages, write and change its rows, read an earlier version, and drop it.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
  - deltaSpark
status: draft
---

In this tutorial you create a Delta table that Unity Catalog *manages*: the
catalog picks where its files live and approves every change to it. You write
it with plain Spark SQL, change some rows, look back at an earlier version,
and finally drop it. Along the way you see what makes a managed table different
from a folder of Delta files.

Allow about fifteen minutes.

:::prerequisites
- Java 17.
- [uv](https://docs.astral.sh/uv/), which installs the Python packages for the
  session.
- Maven access the first time: Spark downloads its Unity Catalog and Delta jars
  from Maven.
:::

::::journey

### Open a Python session

Start the environment under **Prerequisites** if it isn't already running
from an earlier tutorial. Spark on your machine writes the
table's files under the server's
[shared folder](../../how-to/run-local-server/index.md#share-a-folder-with-the-server),
`UC_DOCS_ROOT`. The server needs to see them too, because it deletes them when
you drop the table.

Open a Python session with PySpark and the Unity Catalog client, from a
terminal where `UC_DOCS_ROOT` is set the same way as for the server:

```bash
uv run --with pyspark==4.1.0 --with unitycatalog-client==0.6.0 python
```

Enter each of the following snippets in it, in order, starting with the
imports:

```python file=./snippets/managed_table.py start=start:imports end=end:imports
```

### Give a catalog managed storage

A managed table needs somewhere to live. Create a catalog with a
*storage root*, the location under which Unity Catalog places the files of
every managed table and volume in the catalog:

```python file=./snippets/managed_table.py start=start:catalog end=end:catalog
```

The output is the catalog's own folder under that root, ending in
`__unitystorage/catalogs/<catalog-id>`. Unity Catalog chooses these paths. You
never pick one for a managed table.

### Connect Spark

Start a Spark session that knows the `retail` catalog:

```python file=./snippets/managed_table.py start=start:session end=end:session
```

The first run takes a minute while Spark downloads the jars.
[Configure Spark to use Unity Catalog](../../how-to/configure-spark/index.md)
explains each setting.

### Create the table

Create a schema and a table in it. Leaving out a `LOCATION` is what makes the
table managed:

```python file=./snippets/managed_table.py start=start:create-table end=end:create-table
```

Behind this statement, Spark asks the server to reserve a table, receives a
location and a short-lived credential to write there, writes the first Delta
log entry, and asks the server to make the table official.

### Write some rows

Insert three orders and read them back:

```python file=./snippets/managed_table.py start=start:write-rows end=end:write-rows
```

```text
+--------+--------+------+
|order_id|customer|amount|
+--------+--------+------+
|       1|     ada|  9.50|
|       2|   grace| 20.00|
|       3|   linus|  3.25|
+--------+--------+------+
```

### See where the table lives

Ask Delta for the table's location and for the property that marks it as
catalog-managed:

```python file=./snippets/managed_table.py start=start:inspect end=end:inspect
```

```text
file:/tmp/uc-docs/managed/__unitystorage/catalogs/<catalog-id>/tables/<table-id>
Row(key='delta.feature.catalogManaged', value='supported')
```

You didn't set `delta.feature.catalogManaged` yourself. The connector adds it
when it creates a managed table. It tells every Delta client that the catalog,
not the files, has the final say on the table's latest version.

### Change rows

Update one order and delete another, then list the table's history:

```python file=./snippets/managed_table.py start=start:change-rows end=end:change-rows
```

```text
+-------+------------+
|version|   operation|
+-------+------------+
|      3|      DELETE|
|      2|      UPDATE|
|      1|       WRITE|
|      0|CREATE TABLE|
+-------+------------+
```

Each statement became one new version. For each one, Spark wrote the change to
storage and then asked the server to accept it as the next version. If two
writers race for the same version, the server accepts exactly one of them.

### Read an earlier version

Delta keeps old versions, so you can still count the orders as they were before
the update and the delete:

```python file=./snippets/managed_table.py start=start:time-travel end=end:time-travel
```

```text
+------+
|orders|
+------+
|     3|
+------+
```

### Clean up

Drop the table and the schema, and stop Spark. Then leave the session with
`Ctrl+D`:

```python file=./snippets/managed_table.py start=start:clean-up end=end:clean-up
```

:::warning
Dropping a managed table deletes its files. This is the opposite of an
[external table](../../how-to/register-external-table/index.md), whose files
stay where they are.
:::

To run the tutorial again, delete the `retail` catalog first:
`uc catalog delete --name retail --force true`, with the `uc` shortcut from
[Create your first catalog](../getting-started/index.md#define-a-shortcut-for-the-cli).

::::

## What you did

You created a table without choosing where it lives, changed it three times, and
read it as it was two versions ago, all with ordinary Spark SQL. Unity Catalog
chose the location, handed Spark credentials for it, and approved each new
version. Any other engine that speaks the same protocol sees exactly those
versions. To try that, read the table from DuckDB.

## Next steps

- [Read and write Unity Catalog tables from DuckDB](../../how-to/duckdb/index.md)
  reads and appends to a managed table from a second engine.
- [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
  explains the protocol behind each step.
- [Create and manage catalogs and schemas](../../how-to/manage-catalogs-and-schemas/index.md)
  covers storage roots for schemas as well as catalogs.
