# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-aws/compose.yaml"
# services = ["unitycatalog"]
# claims.spark-sql = [
#   { journey = "iceberg.join-delta", region = "join", note = "UC connector and Iceberg REST catalogs in one session" },
# ]
# ///
"""Join a Delta table and an Iceberg table from the same Unity Catalog catalog in one Spark session.

Start the docs' local server from `uc-docs-env/uc-aws`:

    docker compose up -d --wait

Then run this script, with `_setup.py` from the same page beside it:

    AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run spark_cross_format.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# --8<-- [start:session]
from pyspark.sql import SparkSession

PACKAGES = [
    "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.7.0",
    "io.delta:delta-spark_4.1_2.13:4.3.1",
    "org.apache.hadoop:hadoop-aws:3.4.2",
    "org.apache.iceberg:iceberg-spark-runtime-4.1_2.13:1.11.0",
    "org.apache.iceberg:iceberg-aws-bundle:1.11.0",
]

spark = (
    SparkSession.builder.appName("uc-delta-and-iceberg")
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
    # Delta tables, through the Unity Catalog connector.
    .config("spark.sql.catalog.retail", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.retail.uri", "http://localhost:8080")
    .config("spark.sql.catalog.retail.auth.type", "static")
    .config("spark.sql.catalog.retail.auth.token", "not-used")
    # Iceberg tables in the same catalog, through Iceberg REST.
    .config("spark.sql.catalog.retail_iceberg", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.retail_iceberg.type", "rest")
    .config(
        "spark.sql.catalog.retail_iceberg.uri",
        "http://localhost:8080/api/2.1/unity-catalog/iceberg",
    )
    .config("spark.sql.catalog.retail_iceberg.warehouse", "retail")
    .config("spark.sql.catalog.retail_iceberg.token", "not-used")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

from _setup import setup_retail, table_info  # noqa: E402

setup_retail()

# --8<-- [start:tables]
spark.sql("CREATE TABLE retail.sales.customers (id BIGINT, name STRING) USING DELTA")
spark.sql("INSERT INTO retail.sales.customers VALUES (1, 'ada'), (2, 'grace')")

spark.sql("""
    CREATE TABLE retail_iceberg.sales.orders (
        order_id BIGINT, customer_id BIGINT, amount DOUBLE
    ) USING iceberg
""")
spark.sql("""
    INSERT INTO retail_iceberg.sales.orders VALUES
        (10, 1, 9.5), (11, 2, 20.0), (12, 1, 1.5)
""")
# --8<-- [end:tables]
assert table_info("retail.sales.customers")["data_source_format"] == "DELTA"
assert table_info("retail.sales.orders")["data_source_format"] == "ICEBERG"

# --8<-- [start:join]
spark.sql("""
    SELECT c.name, sum(o.amount) AS total
    FROM retail.sales.customers AS c
    JOIN retail_iceberg.sales.orders AS o ON o.customer_id = c.id
    GROUP BY c.name
    ORDER BY c.name
""").show()
# --8<-- [end:join]
totals = spark.sql("""
    SELECT c.name, sum(o.amount) FROM retail.sales.customers c
    JOIN retail_iceberg.sales.orders o ON o.customer_id = c.id
    GROUP BY c.name ORDER BY c.name
""").collect()
assert [tuple(r) for r in totals] == [("ada", 11.0), ("grace", 20.0)], totals

# Iceberg REST lists only Iceberg tables; the connector lists both and reads only Delta.
listed = {
    r.tableName for r in spark.sql("SHOW TABLES IN retail_iceberg.sales").collect()
}
assert listed == {"orders"}, listed
try:
    spark.sql("SELECT * FROM retail.sales.orders").collect()
except Exception as err:
    assert "iceberg is not a valid Spark SQL Data Source" in str(err), err
else:
    raise AssertionError("the UC connector reads Iceberg tables now: update the page")

spark.stop()
