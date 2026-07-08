"""Read a Delta table with PySpark + delta-spark. STUB — CI-optional (JVM).

Runs only under the gated Spark CI job. Reuses the Python ``docs_factory_seed``
helper to materialize the table, then reads it through Spark.
"""


def read_delta_table(spark, path: str) -> None:
    # docs-read-delta-table-start
    df = spark.read.format("delta").load(path)
    df.show(5)
    # docs-read-delta-table-end


if __name__ == "__main__":
    from delta import configure_spark_with_delta_pip
    from docs_factory_seed import seed_dataset
    from pyspark.sql import SparkSession

    builder = (
        SparkSession.builder.appName("read_delta_table")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
    )
    spark = configure_spark_with_delta_pip(builder).getOrCreate()
    read_delta_table(spark, seed_dataset("orders"))
