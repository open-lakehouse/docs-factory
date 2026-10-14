# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0"]
# ///
# write_orders_spark.py — create a Delta table and an Iceberg table in one catalog from Spark.
# Run:      AWS_ENDPOINT_URL=http://localhost:9000 uv run write_orders_spark.py
# Needs:    Java 17; setup_catalog.py run first. Behind a Maven mirror, export
#           PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell".
# Verified: unitycatalog v0.7.0, pyspark 4.1.0, iceberg 1.11.0, delta-spark 4.3.1.
from pyspark.sql import SparkSession

# --8<-- [start:session]
PACKAGES = [
    "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.7.0",
    "io.delta:delta-spark_4.1_2.13:4.3.1",
    "org.apache.hadoop:hadoop-aws:3.4.2",
    "org.apache.iceberg:iceberg-spark-runtime-4.1_2.13:1.11.0",
    "org.apache.iceberg:iceberg-aws-bundle:1.11.0",
]
UC = "http://localhost:8080"

spark = (
    SparkSession.builder.appName("retail")
    .config("spark.jars.packages", ",".join(PACKAGES))
    .config(
        "spark.sql.extensions",
        "io.delta.sql.DeltaSparkSessionExtension,"
        "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions",
    )
    .config(
        "spark.sql.catalog.spark_catalog",
        "org.apache.spark.sql.delta.catalog.DeltaCatalog",
    )
    .config("spark.hadoop.fs.s3.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
    # Delta tables, through the Unity Catalog connector
    .config("spark.sql.catalog.retail", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.retail.uri", UC)
    .config("spark.sql.catalog.retail.auth.type", "static")
    .config("spark.sql.catalog.retail.auth.token", "not-used")
    # Iceberg tables in the same catalog, through Iceberg REST
    .config("spark.sql.catalog.retail_iceberg", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.retail_iceberg.type", "rest")
    .config(
        "spark.sql.catalog.retail_iceberg.uri", f"{UC}/api/2.1/unity-catalog/iceberg"
    )
    .config("spark.sql.catalog.retail_iceberg.warehouse", "retail")
    .config("spark.sql.catalog.retail_iceberg.token", "not-used")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

# --8<-- [start:write]
spark.sql("CREATE TABLE retail.sales.customers (id BIGINT, name STRING) USING DELTA")
spark.sql(
    "INSERT INTO retail.sales.customers VALUES (1, 'ada'), (2, 'grace'), (3, 'linus')"
)

spark.sql("""
    CREATE TABLE retail_iceberg.sales.orders (
        order_id BIGINT, customer_id BIGINT, amount DOUBLE
    ) USING iceberg
""")
spark.sql("INSERT INTO retail_iceberg.sales.orders VALUES (10, 1, 9.5), (11, 2, 20.0)")
# --8<-- [end:write]
assert spark.table("retail_iceberg.sales.orders").count() == 2
spark.stop()
