# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0", "delta-spark==4.4.0"]
#
# [tool.docs-factory]
# lane = "spark"
# claims.spark-python = [
#   { journey = "read.version", region = "version", api = "versionAsOf" },
#   { journey = "read.timestamp", region = "timestamp", api = "timestampAsOf" },
#   { journey = "history.list", region = "history", api = "DeltaTable.forPath().history()" },
# ]
# ///
"""Query earlier versions of a Delta table with PySpark.

It lists the history, then reads the table as of a version and as of a
timestamp. It first writes the sample `orders` table to /tmp/delta/orders,
replacing any table there, and backdates its commits. The asserts at the end
check the result, so a run that finishes means the example works.
"""

import os
import shutil
import time
from pathlib import Path

DAY = 24 * 60 * 60


def build_orders(spark) -> None:
    """Write the `orders` table the tutorials build, with versions 0, 1, and 2
    committed 8 days, 2 days, and 1 hour ago."""
    shutil.rmtree("/tmp/delta/orders", ignore_errors=True)
    spark.sql(
        "CREATE TABLE delta.`/tmp/delta/orders` (order_id BIGINT, customer_id BIGINT, "
        "product STRING, quantity BIGINT, amount DOUBLE, status STRING) USING DELTA"
    )
    spark.sql(
        "INSERT INTO delta.`/tmp/delta/orders` VALUES (1, 101, 'widget', 2, 19.98, 'placed'), "
        "(2, 102, 'gadget', 1, 24.50, 'placed'), (3, 101, 'gizmo', 5, 12.25, 'shipped')"
    )
    spark.sql(
        "INSERT INTO delta.`/tmp/delta/orders` VALUES (4, 103, 'widget', 1, 9.99, 'placed'), "
        "(5, 102, 'sprocket', 3, 30.00, 'placed')"
    )
    # Without in-commit timestamps, a version's time is the modification time
    # of its commit file in _delta_log.
    now = time.time()
    for version, age in enumerate((8 * DAY, 2 * DAY, 60 * 60)):
        commit = Path("/tmp/delta/orders/_delta_log", f"{version:020d}.json")
        os.utime(commit, (now - age, now - age))


def main():
    # --8<-- [start:session]
    from delta import configure_spark_with_delta_pip
    from pyspark.sql import SparkSession

    builder = (
        SparkSession.builder.appName("delta-docs")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
    )
    spark = configure_spark_with_delta_pip(builder).getOrCreate()
    # --8<-- [end:session]
    try:
        build_orders(spark)

        # --8<-- [start:history]
        from delta.tables import DeltaTable

        history = DeltaTable.forPath(spark, "/tmp/delta/orders").history()
        history.select("version", "timestamp", "operation").show(truncate=False)
        # --8<-- [end:history]
        operations = [r.operation for r in history.collect()]

        # --8<-- [start:version]
        df = (
            spark.read.format("delta")
            .option("versionAsOf", 1)
            .load("/tmp/delta/orders")
        )
        df.orderBy("order_id").show()
        # --8<-- [end:version]
        at_version = [r.order_id for r in df.collect()]

        # --8<-- [start:timestamp]
        from datetime import UTC, datetime, timedelta

        day_ago = datetime.now(UTC) - timedelta(days=1)
        df = (
            spark.read.format("delta")
            .option("timestampAsOf", day_ago.isoformat())
            .load("/tmp/delta/orders")
        )
        df.orderBy("order_id").show()
        # --8<-- [end:timestamp]
        return operations, at_version, [r.order_id for r in df.collect()]
    finally:
        spark.stop()


if __name__ == "__main__":
    operations, at_version, at_timestamp = main()
    assert operations == ["WRITE", "WRITE", "CREATE TABLE"], operations
    assert sorted(at_version) == [1, 2, 3], at_version
    assert sorted(at_timestamp) == [1, 2, 3], at_timestamp
