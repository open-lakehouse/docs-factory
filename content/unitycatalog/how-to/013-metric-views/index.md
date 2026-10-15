---
title: Manage metric views
summary: Keep metric-view definitions in YAML files, create them with Spark over tables or queries, register them through the REST API, and change or drop them.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpark
status: draft
---

A metric view stores dimensions and measures in Unity Catalog as YAML. The
catalog keeps the definition, and the engine computes measures from it when
you query. This guide uses Spark 4.2, the engine that runs metric views
against Unity Catalog, over the TPC-H sample tables in `samples.tpch`. For a
first walk-through on a small table, see
[Define and query your first metric view](../../tutorials/first-metric-view/index.md).

:::prerequisites
- The TPC-H sample in `samples.tpch`:
  [Seed TPC-H data into Unity Catalog](../seed-tpch-data/index.md).
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17).
:::

## Connect Spark

Metric views need Spark 4.2 and the connector built for it. Open a session in
the folder where you keep your definitions:

```bash
uv run --with pyspark==4.2.0 python
```

Register every Unity Catalog catalog your metric views and their sources live
in. A name in a catalog that the session doesn't know fails with
`Nested namespaces are not supported`:

```python file=./snippets/metric_views.py start=start:session end=end:session
```

## Write a definition

Keep each definition in a YAML file next to your other code, so that changes
to a metric go through review like any other change. Spark reads these keys:

| Key | What it holds |
| --- | --- |
| `version` | `"0.1"`, quoted. Spark rejects other versions. |
| `source` | A table or view name, or a `SELECT` query. |
| `filter` | Optional. A condition on source rows, applied before every measure. |
| `dimensions` | The values you group and filter by: a `name` and an `expr` over a source row. |
| `measures` | The aggregations you report: a `name` and an aggregate `expr`. |

Save this definition as `orders_metrics.yaml`. A dimension can be any
expression on a row, such as a `CASE` that turns codes into labels. A measure
can combine aggregates, such as revenue divided by the number of distinct
customers:

```yaml file=./snippets/orders_metrics.yaml
```

Each dimension and measure takes only `name` and `expr`. Spark rejects
`comment`, `display_name`, `format`, and `synonyms`, as well as `joins` and
any `version` but `"0.1"`; see [Known issues](../../reference/features-and-limitations/index.md#clients-and-engines).
To join tables, write the join in the `source` query, as shown in
[Compute over a query](#compute-over-a-query).

## Create the metric view

Pass the file's contents to `CREATE VIEW … WITH METRICS LANGUAGE YAML`:

```python file=./snippets/metric_views.py start=start:create end=end:create
```

## Query it

Wrap each measure in `MEASURE()`. Group by any dimensions, filter on them in
`WHERE`, or leave out `GROUP BY` for a total:

```python file=./snippets/metric_views.py start=start:query end=end:query
```

```text
+------------+--------------------+----------------------+
|Order Status|measure(Order Count)|measure(Total Revenue)|
+------------+--------------------+----------------------+
|   Fulfilled|                 438|           56417430.31|
|        Open|                1403|          196330856.33|
|  Processing|                 363|           63339475.32|
+------------+--------------------+----------------------+
```

Spark computes each measure from the source rows that pass the definition's
`filter` and the query's `WHERE`, so the result equals the aggregation written
by hand. Selecting a measure column without `MEASURE()` fails.

## Compute over a query

When the source is a `SELECT`, the metric view computes over its result. Use
this to join a fact table to its dimension tables:

```python file=./snippets/metric_views.py start=start:join-query end=end:join-query
```

```text
+--------------+----------------------+------------------+
|Market Segment|measure(Total Revenue)|measure(Customers)|
+--------------+----------------------+------------------+
|    AUTOMOBILE|          422504101.48|               199|
|      BUILDING|          530903495.60|               247|
|     FURNITURE|          419951999.46|               192|
|     HOUSEHOLD|          394447069.86|               185|
|     MACHINERY|          359590163.62|               177|
+--------------+----------------------+------------------+
```

## List and inspect metric views

Metric views are listed with a schema's views, and with its tables:

```python file=./snippets/metric_views.py start=start:list end=end:list
```

```text
+---------+---------------+-----------+
|namespace|       viewName|isTemporary|
+---------+---------------+-----------+
|     tpch| orders_metrics|      false|
|     tpch|segment_metrics|      false|
+---------+---------------+-----------+
```

`DESCRIBE EXTENDED` returns the type, `METRIC_VIEW`, and the stored YAML:

```python file=./snippets/metric_views.py start=start:inspect end=end:inspect
```

## Change a definition

A metric view can't be replaced or renamed in place:
`CREATE OR REPLACE VIEW` fails with `Replacing a view is not supported yet`, and
`ALTER VIEW … RENAME TO` with `Renaming a view is not supported yet`. To change
a definition, edit the file, then drop the metric view and create it again.
For example, add a measure to the end of `orders_metrics.yaml`:

```yaml file=./snippets/new_measure.yaml
```

Then recreate the view from the file:

```python file=./snippets/metric_views.py start=start:change end=end:change
```

Between the drop and the create, queries against the name fail. Run the
change when nothing reads the view, or create the new version under a new
name first and move readers over.

## Register a definition through the REST API

You can store a definition without Spark, for example from a deployment
pipeline, as a table of type `METRIC_VIEW`. The server requires two things
that Spark otherwise fills in:

- `columns`: every dimension and then every measure, in order, with the type
  Spark computes for it. Spark uses these as the view's schema, so a wrong type
  fails at query time, with an error such as `Cannot up cast`. Read the types
  off `DESCRIBE` of a view Spark created from the same definition.
- `view_dependencies`: at least one table the definition reads.

From a Python session with the Unity Catalog client
(`uv run --with unitycatalog-client==0.7.0 python`), in the folder with
`orders_metrics.yaml`, and with no `samples.tpch.orders_metrics` in the
catalog yet:

```python file=./snippets/register_metric_view.py start=start:register end=end:register
```

The server stores the YAML as it is, without parsing it. It's checked only
when an engine reads the view. Find and read registered metric views with
the same API:

```python file=./snippets/register_metric_view.py start=start:get end=end:get
```

```text
['orders_metrics']
['Order Month', 'Order Status', 'Order Count', 'Total Revenue', 'Revenue per Customer']
dependencies=[Dependency(table=TableDependency(table_full_name='samples.tpch.orders'), function=None)]
```

Spark queries a registered metric view like one it created. Delete it with
`delete_table`:

```python file=./snippets/register_metric_view.py start=start:delete end=end:delete
```

## Drop a metric view

Dropping a metric view leaves its source tables in place:

```python file=./snippets/metric_views.py start=start:drop end=end:drop
```

## Related

- [Define and query your first metric view](../../tutorials/first-metric-view/index.md)
- [Configure Spark to use Unity Catalog](../configure-spark/index.md)
- [Features and limitations](../../reference/features-and-limitations/index.md)
