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
# verifies = "time_travel_spark.sql"
# claims.spark-sql = [
#   { journey = "read.version", region = "version", api = "VERSION AS OF" },
#   { journey = "read.timestamp", region = "timestamp", api = "TIMESTAMP AS OF" },
#   { journey = "history.list", region = "history", api = "DESCRIBE HISTORY" },
#   { journey = "read.past-retention", fails = "DELTA_UNSUPPORTED_TIME_TRAVEL_BEYOND_DELETED_FILE_RETENTION_DURATION", anchor = "retention-limits-time-travel" },
# ]
# ///
"""Run time_travel_spark.sql region by region against a table deltalake wrote,
then pin the two limits the page states."""

from pathlib import Path

import time_travel
from delta import configure_spark_with_delta_pip
from docsnip.sqlregions import run
from pyspark.errors import AnalysisException
from pyspark.sql import SparkSession

SQL = Path(__file__).with_name("time_travel_spark.sql")


def fails_with(spark, statement: str, error_class: str) -> None:
    try:
        spark.sql(statement).collect()
    except AnalysisException as exc:
        assert error_class in str(exc), exc
    else:
        raise AssertionError(f"expected {error_class}: {statement}")


if __name__ == "__main__":
    time_travel.build_orders()
    # The settings the spark-sql launch command passes.
    builder = (
        SparkSession.builder.appName("time-travel-spark-sql")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
    )
    spark = configure_spark_with_delta_pip(builder).getOrCreate()
    try:
        [history] = run(SQL, "history", lambda s: spark.sql(s).collect())
        assert [(r.version, r.operation) for r in history] == [
            (2, "WRITE"),
            (1, "WRITE"),
            (0, "CREATE TABLE"),
        ], history

        [rows] = run(SQL, "version", lambda s: spark.sql(s).collect())
        assert [r.order_id for r in rows] == [1, 2, 3], rows

        _, rows = run(SQL, "timestamp", lambda s: spark.sql(s).collect())
        assert [r.order_id for r in rows] == [1, 2, 3], rows

        # On a path, only a timestamp string resolves; an expression needs a name.
        fails_with(
            spark,
            "SELECT * FROM delta.`/tmp/delta/orders` "
            "TIMESTAMP AS OF current_timestamp() - INTERVAL 1 DAY",
            "UNSUPPORTED_DATASOURCE_FOR_DIRECT_QUERY",
        )
        # Version 0 is 8 days old, past the 7-day deletedFileRetentionDuration.
        fails_with(
            spark,
            "SELECT * FROM delta.`/tmp/delta/orders` VERSION AS OF 0",
            "DELTA_UNSUPPORTED_TIME_TRAVEL_BEYOND_DELETED_FILE_RETENTION_DURATION",
        )
    finally:
        spark.stop()
