---
title: Manage SQL views
summary: Create, query, and inspect SQL views in Unity Catalog, and drop and recreate a view to change it.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - deltaSpark
  - lakehouse.sqlView
status: ready
---

A SQL view stores its query text and output columns in Unity Catalog. The
engine that reads the view expands the query and runs it. For how views fit next to tables and metric views, see
[SQL views and metric views](../../explanation/views-and-metric-views/index.md).
Creating a view with SQL needs Spark 4.2 and the Unity Catalog connector. You
can also register one through the REST API.

:::prerequisites
- The TPC-H sample in `samples.tpch`:
  [Seed TPC-H data into Unity Catalog](../seed-tpch-data/index.md).
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17).
:::

## Connect Spark

Start Python with Spark 4.2:

```bash
uv run --with pyspark==4.2.0 python
```

Then create a session with the Unity Catalog connector built for Spark 4.2, and
register the catalog that holds your views and their source tables:

```python file=./snippets/sql_views.py start=start:session end=end:session
```

## Create a view

Run `CREATE VIEW` with a query over catalog tables. A column list after the
name renames the query's output columns, and `COMMENT` describes the view:

```python file=./snippets/sql_views.py start=start:create end=end:create
```

A name that's already taken fails with
`Table already exists: samples.tpch.customer_orders`, whether a table or a
view holds it.

## Query it

Select from the view like a table. Spark expands the stored query, so the
result equals the join written by hand:

```python file=./snippets/sql_views.py start=start:query end=end:query
```

```text
+--------------+------+------------+
|market_segment|orders|     revenue|
+--------------+------+------------+
|    AUTOMOBILE|  2979|422504101.48|
|      BUILDING|  3706|530903495.60|
|     FURNITURE|  3007|419951999.46|
|     HOUSEHOLD|  2772|394447069.86|
|     MACHINERY|  2536|359590163.62|
+--------------+------+------------+
```

A view in one catalog can read tables in another, as long as the session
registers both catalogs. This view lives in `unity.default` and reads
`samples.tpch.orders`:

```python file=./snippets/sql_views.py start=start:second-catalog end=end:second-catalog
```

```text
+--------+
|count(1)|
+--------+
|    7333|
+--------+
```

Reading through a view also needs access to its
source tables. See
[permissions on views](../../explanation/views-and-metric-views/index.md#permissions).

## List and inspect views

`SHOW VIEWS` lists only a schema's views. `SHOW TABLES` lists them with the
schema's tables:

```python file=./snippets/sql_views.py start=start:list end=end:list
```

```text
+---------+---------------+-----------+
|namespace|       viewName|isTemporary|
+---------+---------------+-----------+
|     tpch|customer_orders|      false|
+---------+---------------+-----------+
```

`DESCRIBE EXTENDED` returns the view's columns and their types, its comment,
the type `VIEW`, and the stored query:

```python file=./snippets/sql_views.py start=start:describe end=end:describe
```

```text
VIEW
SELECT o.o_orderkey, o.o_orderdate, o.o_totalprice, c.c_name, c.c_mktsegment
    FROM samples.tpch.orders AS o
    JOIN samples.tpch.customer AS c ON o.o_custkey = c.c_custkey
```

## Change or rename a view

:::note
A view can't be changed in place. `CREATE OR REPLACE VIEW`,
`ALTER VIEW … AS`, and `ALTER VIEW … SET TBLPROPERTIES` fail with
`Replacing a view is not supported yet`. `ALTER VIEW … RENAME TO` fails with
`Renaming a view is not supported yet`.
:::

To change a view, drop it and create it again. This version adds the
customer's nation:

```python file=./snippets/sql_views.py start=start:change end=end:change
```

To rename a view, create it under the new name, then drop the old one.

:::warning
Between the drop and the create, queries against the name fail. Run the change
when nothing reads the view, or create the new version under a new name first
and move readers over.
:::

## Register a view through the REST API

You can store a view without Spark, for example from a deployment pipeline, as
a table of type `VIEW`. The server checks three fields:

- `view_definition`: the query. Without it, the request fails with
  `view_definition is required for view`.
- `columns`: at least one output column, with its type. An empty list fails
  with `columns must contain at least one entry for view`, and the client
  models reject a request that leaves `columns` out before sending it.
- `view_dependencies`: optional. Every table you list must exist, or the
  request fails with `View dependency table does not exist: …`.

From a Python session with the Unity Catalog client, with no
`samples.tpch.orders_by_status` in the catalog yet:

```bash
uv run --with unitycatalog-client==0.7.0 python -m asyncio
```

```python file=./snippets/register_view.py start=start:register end=end:register
```

Find and read registered views with the same API. A view's
`storage_location` is empty:

```python file=./snippets/register_view.py start=start:get end=end:get
```

```text
['orders_by_status']
['o_orderstatus', 'orders', 'revenue']
SELECT o_orderstatus, COUNT(*) AS orders, SUM(o_totalprice) AS revenue FROM samples.tpch.orders GROUP BY o_orderstatus
dependencies=[Dependency(table=TableDependency(table_full_name='samples.tpch.orders'), function=None)]
```

Spark 4.2 queries and lists a registered view like one it created.

## Drop a view

Drop a view with `DROP VIEW` from Spark 4.2:

```python file=./snippets/sql_views.py start=start:drop end=end:drop
```

Or delete it through the REST API with `delete_table`:

```python file=./snippets/register_view.py start=start:delete end=end:delete
```

Either way, the view's source tables stay in place.

## Related

- [Learn how SQL views and metric views work](../../explanation/views-and-metric-views/index.md)
- [Manage metric views](../metric-views/index.md)
- [Working with metric views](../../tutorials/first-metric-view/index.md)
- [Configure Spark to use Unity Catalog](../configure-spark/index.md)
- [Learn how ownership and privileges work](../../explanation/uc-basics/index.md#ownership-and-privileges)
