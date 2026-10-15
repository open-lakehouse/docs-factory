---
title: Define and query your first metric view
summary: Use Spark to define order KPIs once as a metric view in Unity Catalog, then query them by month, by status, and in total.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpark
status: draft
---

In this tutorial you define three business metrics, the order count, total
revenue, and revenue per customer, once, as a *metric view* in Unity Catalog.
Then you query them sliced three different ways without writing an
aggregation yourself. Everyone who queries the view gets the same numbers,
because the definition lives in the catalog, not in each query.

Allow about fifteen minutes.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17).
:::

::::journey

### Open a Python session

Start the environment under **Prerequisites** if it isn't already running
from an earlier tutorial. Metric views need Spark 4.2. Open a Python session
with PySpark 4.2, from a terminal where `UC_DOCS_ROOT` is set the same way as
for the server:

```bash
uv run --with pyspark==4.2.0 python
```

Enter each of the following snippets in it, in order. Start Spark with the
Unity Catalog connector for Spark 4.2 and the matching Delta Lake:

```python file=./snippets/metric_view.py start=start:session end=end:session
```

The first run takes a minute while Spark downloads the jars.
[Configure Spark to use Unity Catalog](../../how-to/configure-spark/index.md)
explains each setting.

### Create the orders table

A metric view computes over a source: a table, a view, or a query. Create a
schema and a small Delta table of orders in the server's
[shared folder](../../how-to/run-local-server/index.md#share-a-folder-with-the-server):

```python file=./snippets/metric_view.py start=start:source end=end:source
```

### Define the metric view

The definition is YAML inside a `CREATE VIEW … WITH METRICS` statement. Its
`source` names the table. The `dimensions` are the values you group and filter
by, each an expression on a source row. The `measures` are the aggregations
you report:

```python file=./snippets/metric_view.py start=start:define end=end:define
```

Names can be the ones your reports use, spaces included. Quote them with
backticks in queries. The definition starts with `version: "0.1"`, the only
version Spark reads.

### Inspect it

The view's columns are its dimensions followed by its measures, and its type
is `METRIC_VIEW`:

```python file=./snippets/metric_view.py start=start:inspect end=end:inspect
```

```text
+--------------------+-------------+-------+
|            col_name|    data_type|comment|
+--------------------+-------------+-------+
|         Order Month|    timestamp|   NULL|
|        Order Status|       string|   NULL|
|         Order Count|       bigint|   NULL|
|       Total Revenue|decimal(20,2)|   NULL|
|Revenue per Customer|decimal(21,2)|   NULL|
+--------------------+-------------+-------+

+--------+-----------+-------+
|col_name|  data_type|comment|
+--------+-----------+-------+
|    Type|METRIC_VIEW|       |
+--------+-----------+-------+
```

The catalog stores the YAML. Spark reads it back each time you query the
view.

### Query measures by month

Wrap each measure in `MEASURE()` and group by the dimensions you want:

```python file=./snippets/metric_view.py start=start:query end=end:query
```

```text
+-------------------+--------------------+----------------------+-----------------------------+
|        Order Month|measure(Order Count)|measure(Total Revenue)|measure(Revenue per Customer)|
+-------------------+--------------------+----------------------+-----------------------------+
|2026-01-01 00:00:00|                   4|                225.00|                        75.00|
|2026-02-01 00:00:00|                   4|                275.00|                        68.75|
+-------------------+--------------------+----------------------+-----------------------------+
```

Spark turns each `MEASURE()` into the measure's expression, aggregated over
the source rows in each group. The result is what you'd get by writing the
`GROUP BY` against `shop.orders` yourself. Reading a measure column without
`MEASURE()` fails.

### Slice them differently

Filter on one dimension and group by another, or leave out `GROUP BY` for the
total:

```python file=./snippets/metric_view.py start=start:slice end=end:slice
```

```text
+------------+----------------------+
|Order Status|measure(Total Revenue)|
+------------+----------------------+
|   Fulfilled|                245.00|
|        Open|                 30.00|
+------------+----------------------+

+-----------------------------+
|measure(Revenue per Customer)|
+-----------------------------+
|                       125.00|
+-----------------------------+
```

Revenue per customer over both months is 125.00, not the average of 75.00 and
68.75: four customers spent 500.00 in total. Spark computes each measure from
the source rows, never from other results, so a ratio like this one stays
right however you slice it.

### Clean up

Drop the metric view, the table, and the schema, and stop Spark. Then leave the
session with `Ctrl+D`:

```python file=./snippets/metric_view.py start=start:clean-up end=end:clean-up
```

Dropping the metric view leaves its source table in place. `shop.orders` is
an external table, so its files stay in `UC_DOCS_ROOT/shop` after the drop.

::::

## What you did

You stored three metrics in the catalog and queried them by month, by status,
and in total, without repeating their formulas. A dashboard, a notebook, or an
agent that queries `shop.orders_metrics` gets the same order count and the
same revenue per customer, because none of them define it.

## Next steps

- [Create and maintain metric views](../../how-to/metric-views/index.md)
  covers query sources, joins, registering a definition through the REST API,
  and changing one.
- [Seed the TPC-H sample data](../../how-to/seed-tpch-data/index.md) gives you
  a larger dataset to define metrics over.
