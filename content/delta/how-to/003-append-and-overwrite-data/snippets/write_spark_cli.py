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
# verifies = "write_spark.sql"
# ///
"""Run write_spark.sql region by region against a table deltalake wrote."""

from pathlib import Path

import write
from delta import configure_spark_with_delta_pip
from docsnip.sqlregions import run
from pyspark.sql import SparkSession

SQL = Path(__file__).with_name("write_spark.sql")
TABLE = "delta.`/tmp/delta/orders`"

if __name__ == "__main__":
    write.build_orders()
    # The settings the spark-sql launch command passes.
    builder = (
        SparkSession.builder.appName("write-spark-sql")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
    )
    spark = configure_spark_with_delta_pip(builder).getOrCreate()

    def ids() -> list[int]:
        return [
            r[0]
            for r in spark.sql(f"SELECT order_id FROM {TABLE} ORDER BY 1").collect()
        ]

    try:
        run(SQL, "append", lambda s: spark.sql(s).collect())
        assert ids() == [1, 2, 3, 4, 5, 6], ids()

        run(SQL, "overwrite", lambda s: spark.sql(s).collect())
        assert ids() == [7, 8], ids()

        [history] = run(SQL, "history", lambda s: spark.sql(s).collect())
        assert [
            (r.version, r.operation, r.operationParameters["mode"], r.isBlindAppend)
            for r in history
        ] == [(4, "WRITE", "Overwrite", False), (3, "WRITE", "Append", True)], history

        # The overwritten rows stay readable in the earlier version.
        assert (
            spark.sql(f"SELECT count(*) FROM {TABLE} VERSION AS OF 3").first()[0] == 6
        )
    finally:
        spark.stop()
