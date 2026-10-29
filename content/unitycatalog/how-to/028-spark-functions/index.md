---
title: Use catalog functions in Spark
summary: Spark can't call Unity Catalog functions by name. Fetch a Python function with unitycatalog-ai and register it as a session UDF for SQL and DataFrames.
diataxis: how-to
project: unitycatalog
references:
  - lakehouse.function
  - unityCatalogAi
  - unityCatalogSpark
  - apacheSpark
status: draft
---

To run a catalog [function](model:lakehouse.function) in
[Spark](model:apacheSpark), fetch it with
[`unitycatalog-ai`](model:unityCatalogAi) and register it as a UDF in your
session. This works for Python functions only. The Unity Catalog Spark
connector resolves tables, not functions, so calling a function by its
catalog name fails with `[MISSING_CATALOG_ABILITY.FUNCTIONS] Catalog unity
does not support functions. SQLSTATE: 0A000`.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17).
- A Python function `tools.pricing.order_total(quantity, unit_price,
  discount_pct)` that returns `DOUBLE`:
  [Register a function](../manage-python-functions/index.md#register-a-function).
:::

Unity Catalog stores two kinds of function. A Python function has
`routine_body` `EXTERNAL`, and it's the kind `unitycatalog-ai` registers. A
SQL-body function has `routine_body` `SQL`, and neither client can run it in
Spark. `unitycatalog-ai` refuses to fetch it with `ValueError: Function
tools.pricing.double_it is not an EXTERNAL Python function and cannot be
retrieved.`, and Spark can't resolve it by name.

## Set up the session and client

Start Python with PySpark and `unitycatalog-ai`:

```bash
uv run --python 3.12 --with pyspark==4.1.0 --with unitycatalog-ai==0.4.0 python
```

Create the Spark session. For what each setting does, see
[Configure the session](../configure-spark/index.md#configure-the-session).

```python file=./snippets/spark_functions.py start=start:session end=end:session
```

The same steps work on Spark 4.2, with `pyspark==4.2.0`,
`io.unitycatalog:unitycatalog-spark_4.2_2.13:0.7.0`, and
`io.delta:delta-spark_4.2_2.13:4.4.1`.

Create the function client:

```python file=./snippets/spark_functions.py start=start:connect end=end:connect
```

The function client authenticates on its own. It doesn't use the connector's
`spark.sql.catalog.<name>.auth.*` settings, so configure it for your server
separately. Fetching a function needs the privileges to view it, listed in
[View a function and get its source back](../manage-python-functions/index.md#view-a-function-and-get-its-source-back).
Those privileges come from the server's source and haven't been tested with
authorization enabled.

## Register a catalog function as a Spark UDF

To register the function, fetch it as a Python callable and pass it to
`spark.udf.register` with the function's return type:

```python file=./snippets/spark_functions.py start=start:register end=end:register
```

The first argument to `spark.udf.register` is the name you call in the
session. `full_data_type` is the return type the catalog stores for the
function, here `DOUBLE`.

Pass `register_function=False`. With the default, calls fail in the worker
with `AttributeError: Can't get attribute 'order_total' on <module
'unitycatalog.ai.core.utils.execution_utils' …>`. With
`register_function=False`, Spark's workers don't need `unitycatalog-ai`.

## Call it from SQL and DataFrames

Call the UDF by the name you registered, without a catalog or schema:

```python file=./snippets/spark_functions.py start=start:sql end=end:sql
```

The query returns `53.97`.

Write decimal arguments as `DOUBLE` literals, such as `19.99D`. A plain
literal such as `19.99` reaches the function as a Python `Decimal`, not a
`float`, and `order_total(3, 19.99, 10.0)` returns `NULL`.

Register the type from `full_data_type`. A return type that doesn't match the
function gives a wrong result, not an error: registered as `BIGINT`,
`order_total` returns `NULL`, and registered as `STRING`, it returns the text
`"53.97"`.

To call the UDF on DataFrame columns, use `expr` or `call_function`:

```python file=./snippets/spark_functions.py start=start:dataframe end=end:dataframe
```

Both return `53.97` and `5.0`.

Pass every argument. The fetched function has no parameter defaults, so
leaving out `discount_pct` fails in the worker with `TypeError: order_total()
missing 1 required positional argument: 'discount_pct'`.

## Keep the session copy current

After the fetch, the session runs its own copy of the function without
contacting the catalog, so later changes in the catalog don't reach it.

:::warning
When someone replaces the function in the catalog, your session keeps
returning the old result, with the old return type. When someone deletes it,
your session still runs it.
:::

To pick up a replaced function, fetch it and its return type again, and
register it under the same name:

```python file=./snippets/spark_functions.py start=start:refresh end=end:refresh
```

The next query runs the new definition with the new return type, for example
`STRING` after a replace that changed it. You don't need to clear any cache
first.

## Next steps

- [Run functions in applications and notebooks](../run-functions/index.md)
  to call the same functions without Spark.
- [Manage Python functions](../manage-python-functions/index.md) to register,
  replace, and delete the functions Spark calls.
- [Use Spark with Unity Catalog](../configure-spark/index.md) to choose
  connector versions and authenticate the session.
