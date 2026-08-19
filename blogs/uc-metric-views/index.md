---
title: Fighting entropy with metric views
slug: uc-metric-views
status: draft
tags: [unity-catalog, apache-spark, lakehouse]
series:
series_order:
author: Robert Pack
target: unitycatalog
---

:::tldr
- Metric Views as part of your semantic layer allow you to centrally
  define and govern metrics and KPIs for your business.
- Metric views are specifically designed to also be cunsumed by agents.
- You can test metric views today using Unity Catalog `0.6` with Apache Spark `4.3`.
:::

When people asked me in one of my previous roles as chief archirect
for major data platform/lakehouse deployments to summarize in a few words
what my main job was, I used to say: "fight entropy!". And while entropy
certainly is one of the more elusive concepts that generations of studentents
in physics, thermodynamics, information theory, and many other fields have struggled
with (including me) it has become my litmus test for quickly gauging
the quality of a design.

In simple terms entropy is a measure for the disorder or uncertainly in a 
system. So how does this relate to data platforms, and more importantly, 
what do metric views have to do with that? Coming back to the litmus test,
try asking a number of consumers of your platform something like: 
"What were our last quarter earnings?".

If only some people can give you an answer, or you get a bunch of different answers
there almost certainly is an unhealthy amount of uncertainlty and/or disorder in your systems.

And while we may be glossing over some of the finer points of thermodynamic
vs. Shannon entropy a bit, I feel that context rot and context management are prime examples
of the effects of entropy on a system and the need to keep it in check.

So without further ado, let's find out how metric views help making sense of your data estate.

## What are metric views?

Metric views are part of the semantic layer for your data, transforming tables and views into
standardized business metrics. They define what to measure, how to aggregate it, and how to
segment it. As a result, every user, human and agent, across the organization reports the
same value for the same KPI, which eliminates inconsistent reporting and enables flexible
analysis across any fields (also called dimensions).

The core components you define are sources, joins, filters, fields, and measures.

| Component | Description | Example |
| --- | --- | --- |
| Source | The base table, view, or SQL query containing the data. | `samples.tpch.orders` |
| Joins | Relationships between tables, views, and metric views to enrich data. | Join `orders` table with `customers` table on `customer_key` |
| Filters | Conditions applied to the source data to define scope. | <ul><li>status = 'completed'</li><li>order_date > '2024-01-01'</li></ul> |
| Fields | Columns used to group, filter, and aggregate metrics. Includes categorical columns and unaggregated numeric columns. Also called dimensions. | Product category, Order month, Unit price |
| Measures | Column aggregations that produce metrics. | `COUNT(o_orderkey)` as Order Count, `SUM(o_totalprice)` as Total Revenue |

### Providing Agent Metadata

Agent metadata includes display names, format specifications, and synonyms that provide additional context.
This in turn grounds your agents' and natural language tools' exploration in facts, rather that it having
to research or guess as to how to interpret the users questions.

We'll be diving deeper into what specifically fields are in the context of metriv views,
but for now let's examine a full definition of a field including some agent metadata.

```yaml
fields:
  - name: order_date
    expr: o_orderdate
    comment: Date when the order was placed
    display_name: Order Date
    format:
      type: date
      date_format: year_month_day
      leading_zeros: true
    synonyms:
      - order time
      - date of order
```

While we could have provided "Order Data" as the field name directly, it is often
advantageous to keep a more engine-friendly name for the actual field, to avoid
quirks in other processing systems that may not honor capitalization or struggle
with spaces in field names.

Dates are one of my favourites. While today this specific scenario has been solved,
I still vividly remember debugging a data pipeline where we were parsing CSV, and the
parser would default to "MM-DD-YYYY" format, in switch to "DD-MM-YYYY" `format` mid-parsing
as it encountered values that could not be parsed uning the prior format. Without additional
metadata, agents and humans alike are left to guess, especially wheb seeing only a few
ambiguous values.

Last, but certainly not least, in natural language you'll encounter people referring
to the same thing via different names - the literal definition of a synonym. However
in your own corporate speak, we should not rely on websters dictionary alone to
disambiguate, so explicitly providing alternative names for your KPIs again
reduces the work an LLM needs to perform - so no loading up the context 
with additional research and keeping entropy accumulation low in your agent loops.

You can find a more complete specification of this structured metadata
in the [official documentation](https://docs.databricks.com/aws/en/uc-semantics/agent-metadata).

However all of this is a bit abstract, so let's put it into practice.

## Working with metric views

Since metric views require some tabular assets as a foundation,
we first need some interesting data. For the remainder of this tutorial,
we assume that you created TCP-H tables per the
[tcp-h tutorial](../../content/unitycatalog/tutorials/006-seed-tpch-data/index.md).

With that data in place, let's create our first metric view.

::::journey

### Define the source data

The definition of a metric-view is just yaml data.

The source data is defined via the `source` field. So lets
define the base for our batric view along with some common metadata.

```yaml file=./metric-view.yaml start=start:source end=end:source
```

### Enrich the source data

To have a view actually be useful, we should probably enrich the data
by joining it with data from another table and maybe applying some filters.

```yaml file=./metric-view.yaml start=start:enrich end=end:enrich
```

As you can see, joins are defined as an array so you can accommodate complex
scenarios, like warehouses build on [star or snowflake schemas](https://docs.databricks.com/aws/en/uc-semantics/metric-views/joins).

### Define relevant fields

Fields are essentially projections (i.e by row computations) we apply to process the data
we within our metric view along with additional metadata as we saw earlier. 

```yaml file=./metric-view.yaml start=start:fields end=end:fields
```

### Define your business KPIs (measures)

Now we get to the heart of the matter and define measures/KPIs we are using
to steer our business.

```yaml file=./metric-view.yaml start=start:measures end=end:measures
```

They mainly differ from from fields in that the expressions for a measure
are aggregates over some group vs. projections. The SQL statements 

### Register the metric view

Copy the full definition of the metric view from below into a local file `metric-view.yaml`.

```yaml collapse file=./metric-view.yaml
```

We now register the metric view as a securable in Unity Catalog.

```python file=./create_metric_view.py start=start:create-metric-view end=end:create-metric-view
```

### Query the metric view

We can now query the 

```sql
SELECT
  `Order Month`,
  `Order Status`,
  MEASURE(`Order Count`),
  MEASURE(`Total Revenue`)
FROM orders_metric_view
GROUP BY ALL
ORDER BY `Order Month`;
```

::::

## OSI interoperability

[KISS]: https://en.wikipedia.org/wiki/KISS_principle
[DRY]: https://en.wikipedia.org/wiki/Don%27t_repeat_yourself
[OOP]: https://en.wikipedia.org/wiki/Object-oriented_programming
[SoC]: https://en.wikipedia.org/wiki/Separation_of_concerns
