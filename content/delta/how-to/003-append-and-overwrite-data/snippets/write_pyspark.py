# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0", "delta-spark==4.4.0"]
#
# [tool.docs-factory]
# lane = "spark"
# claims.spark-python = [
#   { journey = "write.append", region = "append", api = 'mode("append")' },
#   { journey = "write.overwrite", region = "overwrite", api = 'mode("overwrite")' },
#   { journey = "write.enforce-schema", region = "append", note = "other columns fail with `DELTA_METADATA_MISMATCH`" },
#   { journey = "history.list", region = "history", api = "DeltaTable.forPath().history()" },
# ]
# ///
"""Append rows to a Delta table with PySpark, then overwrite it.

It first writes the sample `orders` table to /tmp/delta/orders, replacing any
table there. The asserts at the end check the result, so a run that finishes
means the example works.
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

        # --8<-- [start:append]
        schema = (
            "order_id BIGINT, customer_id BIGINT, product STRING, "
            "quantity BIGINT, amount DOUBLE, status STRING"
        )
        new_orders = spark.createDataFrame(
            [(6, 104, "gizmo", 2, 24.50, "placed")], schema
        )
        new_orders.write.format("delta").mode("append").save("/tmp/delta/orders")
        # --8<-- [end:append]
        read = spark.read.format("delta")
        after_append = [r.order_id for r in read.load("/tmp/delta/orders").collect()]

        from pyspark.errors import AnalysisException

        other_columns = spark.createDataFrame(
            [(9, "x")], "order_id BIGINT, note STRING"
        )
        try:
            other_columns.write.format("delta").mode("append").save("/tmp/delta/orders")
        except AnalysisException as exc:
            assert "DELTA_METADATA_MISMATCH" in str(exc), exc
        else:
            raise AssertionError("an append with other columns was accepted")

        # --8<-- [start:overwrite]
        replacement = spark.createDataFrame(
            [
                (7, 105, "widget", 4, 39.96, "placed"),
                (8, 101, "gadget", 2, 49.00, "placed"),
            ],
            schema,
        )
        replacement.write.format("delta").mode("overwrite").save("/tmp/delta/orders")
        # --8<-- [end:overwrite]
        after_overwrite = [r.order_id for r in read.load("/tmp/delta/orders").collect()]

        # --8<-- [start:history]
        from delta.tables import DeltaTable

        history = DeltaTable.forPath(spark, "/tmp/delta/orders").history(2)
        history.select("version", "operation", "operationParameters").show(
            truncate=False
        )
        # --8<-- [end:history]
        entries = [
            (r.version, r.operation, r.operationParameters["mode"])
            for r in history.collect()
        ]
        return after_append, after_overwrite, entries
    finally:
        spark.stop()


if __name__ == "__main__":
    after_append, after_overwrite, entries = main()
    assert sorted(after_append) == [1, 2, 3, 4, 5, 6], after_append
    assert sorted(after_overwrite) == [7, 8], after_overwrite
    assert entries == [(4, "WRITE", "Overwrite"), (3, "WRITE", "Append")], entries
