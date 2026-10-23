# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims."spark-4.2" = [
#   { journey = "view.create", region = "create", api = "CREATE VIEW" },
#   { journey = "view.query", region = "query", api = "SELECT" },
#   { journey = "view.list", region = "list", api = "SHOW VIEWS" },
#   { journey = "view.describe", region = "describe", api = "DESCRIBE EXTENDED" },
#   { journey = "view.replace", region = "change", fails = "Replacing a view is not supported yet" },
#   { journey = "view.rename", region = "change", fails = "Renaming a view is not supported yet" },
#   { journey = "view.drop", region = "drop", api = "DROP VIEW" },
# ]
# ///
"""Create, query, list, inspect, change, and drop SQL views over the TPC-H sample.

Start the docs' local server from `uc-docs-env/unitycatalog`, and seed the
TPC-H sample into it (`samples.tpch`):

    docker compose up -d --wait

Then run this script:

    uv run sql_views.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import os
import subprocess
from pathlib import Path

# --8<-- [start:session]
from pyspark.sql import SparkSession

UC_SPARK = "io.unitycatalog:unitycatalog-spark_4.2_2.13:0.7.0"
DELTA_SPARK = "io.delta:delta-spark_4.2_2.13:4.4.1"
CATALOG = "spark.sql.catalog.samples"

options = [
    ("spark.jars.packages", f"{UC_SPARK},{DELTA_SPARK}"),
    ("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension"),
    (
        "spark.sql.catalog.spark_catalog",
        "org.apache.spark.sql.delta.catalog.DeltaCatalog",
    ),
    (CATALOG, "io.unitycatalog.spark.UCSingleCatalog"),
    (f"{CATALOG}.uri", "http://localhost:8080"),
    (f"{CATALOG}.auth.type", "static"),
    (f"{CATALOG}.auth.token", "not-used"),
]
builder = SparkSession.builder.appName("sql-views")
for key, value in options:
    builder = builder.config(key, value)
spark = builder.getOrCreate()
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

HERE = Path(__file__).resolve().parent
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
SEED = HERE.parents[1] / "003-seed-tpch-data" / "seed_tpch.py"
subprocess.run(
    ["uv", "run", "-q", str(SEED)],
    check=True,
    env={**os.environ, "TPCH_STORAGE_ROOT": f"{DOCS_ROOT}/tpch"},
)
spark.sql("DROP VIEW IF EXISTS samples.tpch.customer_orders")

# --8<-- [start:create]
spark.sql("""
    CREATE VIEW samples.tpch.customer_orders (
        order_key, order_date, total_price, customer, market_segment
    )
    COMMENT 'Orders with the name and market segment of the customer who placed them'
    AS SELECT o.o_orderkey, o.o_orderdate, o.o_totalprice, c.c_name, c.c_mktsegment
    FROM samples.tpch.orders AS o
    JOIN samples.tpch.customer AS c ON o.o_custkey = c.c_custkey
""")
# --8<-- [end:create]

# --8<-- [start:query]
spark.sql("""
    SELECT market_segment, COUNT(*) AS orders, SUM(total_price) AS revenue
    FROM samples.tpch.customer_orders
    GROUP BY market_segment
    ORDER BY market_segment
""").show()
# --8<-- [end:query]
got = spark.sql("""
    SELECT market_segment, COUNT(*), SUM(total_price)
    FROM samples.tpch.customer_orders GROUP BY 1 ORDER BY 1
""").collect()
want = spark.sql("""
    SELECT c.c_mktsegment, COUNT(*), SUM(o.o_totalprice)
    FROM samples.tpch.orders o JOIN samples.tpch.customer c ON o.o_custkey = c.c_custkey
    GROUP BY 1 ORDER BY 1
""").collect()
assert len(got) == 5 and [tuple(r) for r in got] == [tuple(r) for r in want], (
    got,
    want,
)

# --8<-- [start:list]
spark.sql("SHOW VIEWS IN samples.tpch").show()
# --8<-- [end:list]
views = {r.viewName for r in spark.sql("SHOW VIEWS IN samples.tpch").collect()}
assert views == {"customer_orders"}, views
tables = {r.tableName for r in spark.sql("SHOW TABLES IN samples.tpch").collect()}
assert {"customer_orders", "orders", "customer"} <= tables, tables

# --8<-- [start:describe]
details = dict(
    spark.sql("DESCRIBE EXTENDED samples.tpch.customer_orders")
    .select("col_name", "data_type")
    .collect()
)
print(details["Type"])
print(details["View Text"])
# --8<-- [end:describe]
assert details["Type"] == "VIEW", details
assert "JOIN samples.tpch.customer AS c" in details["View Text"], details
assert details["Comment"].startswith("Orders with the name"), details
assert details["market_segment"] == "string", details
assert details["total_price"] == "decimal(15,2)", details

# Changing a view in place fails: replacing the definition, renaming it, and
# altering its definition or properties.
for statement, error in [
    (
        "CREATE OR REPLACE VIEW samples.tpch.customer_orders"
        " AS SELECT o_orderkey FROM samples.tpch.orders",
        "Replacing a view is not supported yet",
    ),
    (
        "ALTER VIEW samples.tpch.customer_orders AS SELECT o_orderkey FROM samples.tpch.orders",
        "Replacing a view is not supported yet",
    ),
    (
        "ALTER VIEW samples.tpch.customer_orders SET TBLPROPERTIES ('owner_team' = 'sales')",
        "Replacing a view is not supported yet",
    ),
    (
        "ALTER VIEW samples.tpch.customer_orders RENAME TO samples.tpch.orders_by_customer",
        "Renaming a view is not supported yet",
    ),
    (
        "CREATE VIEW samples.tpch.customer_orders AS SELECT 1 AS x",
        "Table already exists: samples.tpch.customer_orders",
    ),
    # A name a table holds fails the same way, even with IF NOT EXISTS.
    (
        "CREATE VIEW samples.tpch.orders AS SELECT 1 AS x",
        "Table already exists: samples.tpch.orders",
    ),
    (
        "CREATE VIEW IF NOT EXISTS samples.tpch.orders AS SELECT 1 AS x",
        "Table already exists: samples.tpch.orders",
    ),
]:
    try:
        spark.sql(statement)
    except Exception as exc:
        assert error in str(exc), (error, exc)
    else:
        raise AssertionError(f"expected {error!r}: {statement[:60]}")
assert (
    "JOIN"
    in dict(
        spark.sql("DESCRIBE EXTENDED samples.tpch.customer_orders")
        .select("col_name", "data_type")
        .collect()
    )["View Text"]
)

# --8<-- [start:change]
spark.sql("DROP VIEW samples.tpch.customer_orders")
spark.sql("""
    CREATE VIEW samples.tpch.customer_orders (
        order_key, order_date, total_price, customer, market_segment, nation
    )
    COMMENT 'Orders with the name, market segment, and nation of the customer who placed them'
    AS SELECT o.o_orderkey, o.o_orderdate, o.o_totalprice, c.c_name, c.c_mktsegment,
              n.n_name
    FROM samples.tpch.orders AS o
    JOIN samples.tpch.customer AS c ON o.o_custkey = c.c_custkey
    JOIN samples.tpch.nation AS n ON c.c_nationkey = n.n_nationkey
""")
# --8<-- [end:change]
columns = [
    r.col_name for r in spark.sql("DESCRIBE samples.tpch.customer_orders").collect()
]
assert columns[-1] == "nation", columns
assert (
    spark.sql(
        "SELECT COUNT(DISTINCT nation) FROM samples.tpch.customer_orders"
    ).first()[0]
    == 25
)

# The rename workaround: create the view under the new name, drop the old
# name, and query the new one.
spark.sql("DROP VIEW IF EXISTS samples.tpch.orders_by_customer")
spark.sql("DROP VIEW IF EXISTS samples.tpch.open_order_customers")
spark.sql("""
    CREATE VIEW samples.tpch.open_order_customers
    AS SELECT order_key, customer FROM samples.tpch.customer_orders
    WHERE order_key IN (SELECT o_orderkey FROM samples.tpch.orders WHERE o_orderstatus = 'O')
""")
before = spark.sql(
    "SELECT * FROM samples.tpch.open_order_customers ORDER BY 1"
).collect()
spark.sql("""
    CREATE VIEW samples.tpch.orders_by_customer
    AS SELECT order_key, customer FROM samples.tpch.customer_orders
    WHERE order_key IN (SELECT o_orderkey FROM samples.tpch.orders WHERE o_orderstatus = 'O')
""")
spark.sql("DROP VIEW samples.tpch.open_order_customers")
after = spark.sql("SELECT * FROM samples.tpch.orders_by_customer ORDER BY 1").collect()
assert before and before == after, (len(before), len(after))
views = {r.viewName for r in spark.sql("SHOW VIEWS IN samples.tpch").collect()}
assert views == {"customer_orders", "orders_by_customer"}, views
spark.sql("DROP VIEW samples.tpch.orders_by_customer")

# --8<-- [start:second-catalog]
for key, value in [
    ("spark.sql.catalog.unity", "io.unitycatalog.spark.UCSingleCatalog"),
    ("spark.sql.catalog.unity.uri", "http://localhost:8080"),
    ("spark.sql.catalog.unity.auth.type", "static"),
    ("spark.sql.catalog.unity.auth.token", "not-used"),
]:
    spark.conf.set(key, value)

spark.sql("""
    CREATE VIEW unity.default.open_orders
    AS SELECT o_orderkey, o_orderdate, o_totalprice
    FROM samples.tpch.orders
    WHERE o_orderstatus = 'O'
""")
spark.sql("SELECT COUNT(*) FROM unity.default.open_orders").show()
# --8<-- [end:second-catalog]
open_count = spark.sql("SELECT COUNT(*) FROM unity.default.open_orders").first()[0]
want_open = spark.sql(
    "SELECT COUNT(*) FROM samples.tpch.orders WHERE o_orderstatus = 'O'"
).first()[0]
assert open_count == want_open > 0, (open_count, want_open)
cross = dict(
    spark.sql("DESCRIBE EXTENDED unity.default.open_orders")
    .select("col_name", "data_type")
    .collect()
)
assert cross["Catalog"] == "unity" and cross["Type"] == "VIEW", cross
spark.sql("DROP VIEW unity.default.open_orders")

# --8<-- [start:drop]
spark.sql("DROP VIEW samples.tpch.customer_orders")
# --8<-- [end:drop]
views = {r.viewName for r in spark.sql("SHOW VIEWS IN samples.tpch").collect()}
assert "customer_orders" not in views, views
assert spark.table("samples.tpch.orders").count() == 15000
assert spark.table("samples.tpch.customer").count() > 0
try:
    spark.sql("SELECT * FROM samples.tpch.customer_orders").collect()
except Exception as exc:
    assert "TABLE_OR_VIEW_NOT_FOUND" in str(exc), exc
else:
    raise AssertionError("the dropped view still resolves")
spark.stop()
