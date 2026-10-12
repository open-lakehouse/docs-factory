# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "docsnip",
#   "pyspark==4.2.0",
#   "delta-spark==4.4.0",
#   "deltalake[pandas,pyarrow]==1.6.6",
# ]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# lane = "spark"
# verifies = "read_spark.sql"
# ///
"""Run read_spark.sql region by region against a table deltalake wrote."""

from pathlib import Path

import read
from delta import configure_spark_with_delta_pip
from docsnip.sqlregions import run
from pyspark.sql import SparkSession

SQL = Path(__file__).with_name("read_spark.sql")

if __name__ == "__main__":
    read.build_orders()
    # The settings the spark-sql launch command passes.
    builder = (
        SparkSession.builder.appName("read-spark-sql")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
    )
    spark = configure_spark_with_delta_pip(builder).getOrCreate()
    try:
        [rows] = run(SQL, "read", lambda s: spark.sql(s).collect())
        assert [r.order_id for r in rows] == [1, 2, 3, 4, 5], rows
        assert rows[2].product == "gizmo" and rows[2].status == "shipped", rows

        [rows] = run(SQL, "filter", lambda s: spark.sql(s).collect())
        assert [tuple(r) for r in rows] == [
            (1, "widget", 19.98),
            (2, "gadget", 24.5),
            (5, "sprocket", 30.0),
        ], rows
    finally:
        spark.stop()
