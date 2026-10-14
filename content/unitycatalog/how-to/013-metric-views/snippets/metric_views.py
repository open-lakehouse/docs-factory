# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims."spark-4.2" = [
#   { journey = "metricview.create", region = "create", api = "CREATE VIEW … WITH METRICS" },
#   { journey = "metricview.list", region = "list", api = "SHOW VIEWS" },
#   { journey = "metricview.describe", region = "inspect", api = "DESCRIBE EXTENDED" },
#   { journey = "metricview.query", region = "query", api = "measure()" },
#   { journey = "metricview.drop", region = "drop", api = "DROP VIEW" },
# ]
# ///
"""Create, query, inspect, change, and drop metric views over the TPC-H sample.

Start the docs' local server from `uc-docs-env/unitycatalog`, and seed the
TPC-H sample into it (`samples.tpch`):

    docker compose up -d --wait

Then run this script beside `orders_metrics.yaml`:

    uv run metric_views.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import os
import subprocess
import tempfile

# --8<-- [start:session]
from pathlib import Path

from pyspark.sql import SparkSession


def uc_catalog(builder, name):
    prefix = f"spark.sql.catalog.{name}"
    return (
        builder.config(prefix, "io.unitycatalog.spark.UCSingleCatalog")
        .config(f"{prefix}.uri", "http://localhost:8080")
        .config(f"{prefix}.auth.type", "static")
        .config(f"{prefix}.auth.token", "not-used")
    )


builder = (
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
)
spark = uc_catalog(builder, "samples").getOrCreate()
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
os.chdir(HERE)
spark.sql("DROP VIEW IF EXISTS samples.tpch.orders_metrics")
spark.sql("DROP VIEW IF EXISTS samples.tpch.segment_metrics")

# --8<-- [start:create]
definition = Path("orders_metrics.yaml").read_text()
spark.sql(f"""
    CREATE VIEW samples.tpch.orders_metrics
    WITH METRICS
    LANGUAGE YAML
    AS $$
{definition}
$$
""")
# --8<-- [end:create]

# --8<-- [start:query]
spark.sql("""
    SELECT `Order Status`, MEASURE(`Order Count`), MEASURE(`Total Revenue`)
    FROM samples.tpch.orders_metrics
    WHERE YEAR(`Order Month`) = 1995
    GROUP BY ALL
    ORDER BY `Order Status`
""").show()
# --8<-- [end:query]
got = spark.sql("""
    SELECT `Order Status`, MEASURE(`Order Count`), MEASURE(`Total Revenue`)
    FROM samples.tpch.orders_metrics
    WHERE YEAR(`Order Month`) = 1995
    GROUP BY ALL ORDER BY `Order Status`
""").collect()
want = spark.sql("""
    SELECT CASE o_orderstatus WHEN 'O' THEN 'Open' WHEN 'P' THEN 'Processing'
                              WHEN 'F' THEN 'Fulfilled' END AS s,
           COUNT(1), SUM(o_totalprice)
    FROM samples.tpch.orders
    WHERE o_orderdate >= DATE'1995-01-01'
      AND YEAR(o_orderdate) = 1995
    GROUP BY 1 ORDER BY 1
""").collect()
assert got and [tuple(r) for r in got] == [tuple(r) for r in want], (got, want)

# --8<-- [start:join-query]
spark.sql("""
CREATE VIEW samples.tpch.segment_metrics
WITH METRICS
LANGUAGE YAML
AS $$
version: "0.1"
source: >-
  SELECT o.o_totalprice, o.o_custkey, c.c_mktsegment
  FROM samples.tpch.orders AS o
  JOIN samples.tpch.customer AS c ON o.o_custkey = c.c_custkey
dimensions:
  - name: Market Segment
    expr: c_mktsegment
measures:
  - name: Total Revenue
    expr: SUM(o_totalprice)
  - name: Customers
    expr: COUNT(DISTINCT o_custkey)
$$
""")
spark.sql("""
    SELECT `Market Segment`, MEASURE(`Total Revenue`), MEASURE(`Customers`)
    FROM samples.tpch.segment_metrics
    GROUP BY ALL
    ORDER BY `Market Segment`
""").show()
# --8<-- [end:join-query]
segments = spark.sql("""
    SELECT `Market Segment`, MEASURE(`Total Revenue`) FROM samples.tpch.segment_metrics
    GROUP BY ALL ORDER BY 1
""").collect()
direct = spark.sql("""
    SELECT c.c_mktsegment, SUM(o.o_totalprice)
    FROM samples.tpch.orders o JOIN samples.tpch.customer c ON o.o_custkey = c.c_custkey
    GROUP BY 1 ORDER BY 1
""").collect()
assert len(segments) == 5 and [tuple(r) for r in segments] == [
    tuple(r) for r in direct
], (segments, direct)

# --8<-- [start:list]
spark.sql("SHOW VIEWS IN samples.tpch").show()
# --8<-- [end:list]
views = {r.viewName for r in spark.sql("SHOW VIEWS IN samples.tpch").collect()}
assert {"orders_metrics", "segment_metrics"} <= views, views

# --8<-- [start:inspect]
details = dict(
    spark.sql("DESCRIBE EXTENDED samples.tpch.orders_metrics")
    .select("col_name", "data_type")
    .collect()
)
print(details["Type"])
print(details["View Text"])
# --8<-- [end:inspect]
assert details["Type"] == "METRIC_VIEW", details
assert "Revenue per Customer" in details["View Text"], details

# The reader edits orders_metrics.yaml in place; here, an edited copy.
edited = Path(tempfile.mkdtemp())
(edited / "orders_metrics.yaml").write_text(
    (HERE / "orders_metrics.yaml").read_text() + (HERE / "new_measure.yaml").read_text()
)
os.chdir(edited)

# --8<-- [start:change]
spark.sql("DROP VIEW samples.tpch.orders_metrics")

definition = Path("orders_metrics.yaml").read_text()
spark.sql(f"""
    CREATE VIEW samples.tpch.orders_metrics
    WITH METRICS
    LANGUAGE YAML
    AS $$
{definition}
$$
""")
# --8<-- [end:change]
columns = [
    r.col_name for r in spark.sql("DESCRIBE samples.tpch.orders_metrics").collect()
]
assert columns[-1] == "Average Order Value", columns

for statement, error in [
    (
        f"CREATE OR REPLACE VIEW samples.tpch.orders_metrics WITH METRICS LANGUAGE YAML AS $${definition}$$",
        "Replacing a view is not supported yet",
    ),
    (
        "ALTER VIEW samples.tpch.orders_metrics RENAME TO samples.tpch.renamed",
        "Renaming a view is not supported yet",
    ),
    (
        """CREATE VIEW samples.tpch.v11 WITH METRICS LANGUAGE YAML AS $$
version: 1.1
source: samples.tpch.orders
dimensions:
  - name: status
    expr: o_orderstatus
measures:
  - name: orders
    expr: COUNT(1)
$$""",
        "Invalid YAML version: 1.1",
    ),
    (
        """CREATE VIEW samples.tpch.vjoin WITH METRICS LANGUAGE YAML AS $$
version: "0.1"
source: samples.tpch.orders
joins:
  - name: customer
    source: samples.tpch.customer
    'on': source.o_custkey = customer.c_custkey
dimensions:
  - name: status
    expr: o_orderstatus
measures:
  - name: orders
    expr: COUNT(1)
$$""",
        'Unrecognized field "joins"',
    ),
    (
        """CREATE VIEW samples.tpch.vmeta WITH METRICS LANGUAGE YAML AS $$
version: "0.1"
source: samples.tpch.orders
dimensions:
  - name: status
    expr: o_orderstatus
    display_name: Order Status
measures:
  - name: orders
    expr: COUNT(1)
$$""",
        'Unrecognized field "display_name"',
    ),
]:
    try:
        spark.sql(statement)
    except Exception as exc:
        assert error in str(exc), (error, exc)
    else:
        raise AssertionError(f"expected {error!r}: {statement[:60]}")

# --8<-- [start:drop]
spark.sql("DROP VIEW samples.tpch.segment_metrics")
spark.sql("DROP VIEW samples.tpch.orders_metrics")
# --8<-- [end:drop]
views = {r.viewName for r in spark.sql("SHOW VIEWS IN samples.tpch").collect()}
assert not views & {"orders_metrics", "segment_metrics"}, views
assert spark.table("samples.tpch.orders").count() > 0
spark.stop()
