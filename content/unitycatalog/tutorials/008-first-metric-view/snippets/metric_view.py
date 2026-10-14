# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims."spark-4.2" = [
#   { journey = "metricview.create", region = "define", api = "CREATE VIEW … WITH METRICS" },
#   { journey = "metricview.describe", region = "inspect", api = "DESCRIBE EXTENDED" },
#   { journey = "metricview.query", region = "query", api = "measure()" },
#   { journey = "metricview.drop", region = "clean-up", api = "DROP VIEW" },
# ]
# ///
"""Define a metric view over a small orders table with Spark, and query it.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run metric_view.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import shutil

# isort: split
# --8<-- [start:session]
import os

from pyspark.sql import SparkSession

spark = (
    SparkSession.builder.appName("metric-views")
    .config(
        "spark.jars.packages",
        "io.unitycatalog:unitycatalog-spark_4.2_2.13:0.7.0,"
        "io.delta:delta-spark_4.2_2.13:4.4.1",
    )
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config(
        "spark.sql.catalog.spark_catalog",
        "org.apache.spark.sql.delta.catalog.DeltaCatalog",
    )
    .config("spark.sql.catalog.unity", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.unity.uri", "http://localhost:8080")
    .config("spark.sql.catalog.unity.auth.type", "static")
    .config("spark.sql.catalog.unity.auth.token", "not-used")
    .config("spark.sql.defaultCatalog", "unity")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
spark.sql("DROP VIEW IF EXISTS shop.orders_metrics")
spark.sql("DROP TABLE IF EXISTS shop.orders")
spark.sql("DROP SCHEMA IF EXISTS shop")
shutil.rmtree(f"{DOCS_ROOT}/shop", ignore_errors=True)

# --8<-- [start:source]
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")

spark.sql("CREATE SCHEMA shop")
spark.sql(f"""
    CREATE TABLE shop.orders (
        order_id   BIGINT,
        customer   STRING,
        status     STRING,
        order_date DATE,
        amount     DECIMAL(10, 2)
    ) USING DELTA
    LOCATION '{DOCS_ROOT}/shop/orders'
""")
spark.sql("""
    INSERT INTO shop.orders VALUES
        (1, 'ada',      'F', DATE'2026-01-05', 100.00),
        (2, 'grace',    'O', DATE'2026-01-12',  40.00),
        (3, 'ada',      'F', DATE'2026-01-20',  60.00),
        (4, 'linus',    'P', DATE'2026-01-28',  25.00),
        (5, 'grace',    'F', DATE'2026-02-02',  80.00),
        (6, 'ada',      'O', DATE'2026-02-10',  30.00),
        (7, 'margaret', 'F', DATE'2026-02-18', 120.00),
        (8, 'linus',    'F', DATE'2026-02-25',  45.00)
""")
# --8<-- [end:source]
assert spark.table("shop.orders").count() == 8

# --8<-- [start:define]
spark.sql("""
CREATE VIEW shop.orders_metrics
WITH METRICS
LANGUAGE YAML
AS $$
version: "0.1"
source: unity.shop.orders
dimensions:
  - name: Order Month
    expr: DATE_TRUNC('MONTH', order_date)
  - name: Order Status
    expr: |-
      CASE status
        WHEN 'O' THEN 'Open'
        WHEN 'P' THEN 'Processing'
        WHEN 'F' THEN 'Fulfilled'
      END
measures:
  - name: Order Count
    expr: COUNT(1)
  - name: Total Revenue
    expr: SUM(amount)
  - name: Revenue per Customer
    expr: ROUND(SUM(amount) / COUNT(DISTINCT customer), 2)
$$
""")
# --8<-- [end:define]

# --8<-- [start:inspect]
spark.sql("DESCRIBE shop.orders_metrics").show()
spark.sql("DESCRIBE EXTENDED shop.orders_metrics").where("col_name = 'Type'").show()
# --8<-- [end:inspect]
columns = {
    r.col_name: r.data_type for r in spark.sql("DESCRIBE shop.orders_metrics").collect()
}
assert list(columns) == [
    "Order Month",
    "Order Status",
    "Order Count",
    "Total Revenue",
    "Revenue per Customer",
], columns
kind = (
    spark.sql("DESCRIBE EXTENDED shop.orders_metrics")
    .where("col_name = 'Type'")
    .first()
)
assert kind.data_type == "METRIC_VIEW", kind

# --8<-- [start:query]
spark.sql("""
    SELECT
      `Order Month`,
      MEASURE(`Order Count`),
      MEASURE(`Total Revenue`),
      MEASURE(`Revenue per Customer`)
    FROM shop.orders_metrics
    GROUP BY ALL
    ORDER BY `Order Month`
""").show()
# --8<-- [end:query]
by_month = spark.sql("""
    SELECT `Order Month`, MEASURE(`Order Count`), MEASURE(`Total Revenue`),
           MEASURE(`Revenue per Customer`)
    FROM shop.orders_metrics GROUP BY ALL ORDER BY `Order Month`
""").collect()
direct = spark.sql("""
    SELECT DATE_TRUNC('MONTH', order_date), COUNT(1), SUM(amount),
           ROUND(SUM(amount) / COUNT(DISTINCT customer), 2)
    FROM shop.orders GROUP BY 1 ORDER BY 1
""").collect()
assert [tuple(r) for r in by_month] == [tuple(r) for r in direct], (by_month, direct)
assert [(r[1], float(r[2]), float(r[3])) for r in by_month] == [
    (4, 225.0, 75.0),
    (4, 275.0, 68.75),
], by_month

# --8<-- [start:slice]
spark.sql("""
    SELECT `Order Status`, MEASURE(`Total Revenue`)
    FROM shop.orders_metrics
    WHERE `Order Month` = DATE'2026-02-01'
    GROUP BY ALL
    ORDER BY `Order Status`
""").show()
spark.sql("""
    SELECT MEASURE(`Revenue per Customer`) FROM shop.orders_metrics
""").show()
# --8<-- [end:slice]
by_status = spark.sql("""
    SELECT `Order Status`, MEASURE(`Total Revenue`) FROM shop.orders_metrics
    WHERE `Order Month` = DATE'2026-02-01' GROUP BY ALL ORDER BY `Order Status`
""").collect()
assert [(r[0], float(r[1])) for r in by_status] == [
    ("Fulfilled", 245.0),
    ("Open", 30.0),
], by_status
overall = spark.sql(
    "SELECT MEASURE(`Revenue per Customer`) FROM shop.orders_metrics"
).first()[0]
assert float(overall) == 125.0, overall

# --8<-- [start:clean-up]
spark.sql("DROP VIEW shop.orders_metrics")
spark.sql("DROP TABLE shop.orders")
spark.sql("DROP SCHEMA shop")
spark.stop()
# --8<-- [end:clean-up]

shutil.rmtree(f"{DOCS_ROOT}/shop", ignore_errors=True)
