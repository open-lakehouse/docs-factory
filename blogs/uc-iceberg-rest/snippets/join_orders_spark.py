# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0"]
# ///
# join_orders_spark.py — join the Delta customers with the Iceberg orders the other engines changed.
# Run:      AWS_ENDPOINT_URL=http://localhost:9000 uv run join_orders_spark.py
# Needs:    Java 17; read_orders_pyiceberg.py's predecessors run first. The session is the
#           one in write_orders_spark.py.
# Verified: unitycatalog v0.7.0, pyspark 4.1.0, iceberg 1.11.0, delta-spark 4.3.1.
from pyspark.sql import SparkSession

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
    .config("spark.sql.catalog.retail", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.retail.uri", UC)
    .config("spark.sql.catalog.retail.auth.type", "static")
    .config("spark.sql.catalog.retail.auth.token", "not-used")
    .config("spark.sql.catalog.retail_iceberg", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.retail_iceberg.type", "rest")
    .config(
        "spark.sql.catalog.retail_iceberg.uri", f"{UC}/api/2.1/unity-catalog/iceberg"
    )
    .config("spark.sql.catalog.retail_iceberg.warehouse", "retail")
    .config("spark.sql.catalog.retail_iceberg.token", "not-used")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("ERROR")

# --8<-- [start:join]
spark.sql("""
    SELECT c.name, count(*) AS orders, sum(o.amount) AS total
    FROM retail.sales.customers AS c
    JOIN retail_iceberg.sales.orders AS o ON o.customer_id = c.id
    GROUP BY c.name
    ORDER BY total DESC
""").show()
# --8<-- [end:join]
rows = spark.sql("""
    SELECT c.name, sum(o.amount) FROM retail.sales.customers c
    JOIN retail_iceberg.sales.orders o ON o.customer_id = c.id GROUP BY c.name
""").collect()
assert dict(map(tuple, rows)) == {"ada": 11.0, "grace": 21.0, "linus": 3.25}, rows
spark.stop()
