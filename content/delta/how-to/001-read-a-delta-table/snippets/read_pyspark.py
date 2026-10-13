# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0", "delta-spark==4.4.0"]
#
# [tool.docs-factory]
# lane = "spark"
# claims.spark-python = [
#   { journey = "read.scan", region = "read", api = 'spark.read.format("delta").load()' },
# ]
# ///
"""Read a Delta table with PySpark.

It reads the whole table, then selected columns and rows. It first writes the
sample `orders` table to /tmp/delta/orders, replacing any table there. The
asserts at the end check the result, so a run that finishes means the example
works.
"""

import shutil


def build_orders(spark) -> None:
    """Write the `orders` table the tutorials build, in the same three versions."""
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

        # --8<-- [start:read]
        df = spark.read.format("delta").load("/tmp/delta/orders")
        df.orderBy("order_id").show()
        # --8<-- [end:read]
        everything = [r.order_id for r in df.collect()]

        # --8<-- [start:filter]
        df = (
            spark.read.format("delta")
            .load("/tmp/delta/orders")
            .select("order_id", "product", "amount")
            .where("status = 'placed' AND amount > 15")
        )
        df.orderBy("order_id").show()
        # --8<-- [end:filter]
        return everything, df.columns, [r.order_id for r in df.collect()]
    finally:
        spark.stop()


if __name__ == "__main__":
    everything, columns, filtered = main()
    assert sorted(everything) == [1, 2, 3, 4, 5], everything
    assert columns == ["order_id", "product", "amount"], columns
    assert sorted(filtered) == [1, 2, 5], filtered
