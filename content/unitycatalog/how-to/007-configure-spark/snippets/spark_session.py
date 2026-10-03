# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0"]
#
# [tool.docs-factory]
# compose = "../compose.yaml"
# services = ["unitycatalog"]
# ///
"""Connect Spark to Unity Catalog and list what the catalog holds.

docker compose up -d --wait        # from the page folder
uv run snippets/spark_session.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# --8<-- [start:session]
from pyspark.sql import SparkSession

UC_SPARK = "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.6.0"
DELTA_SPARK = "io.delta:delta-spark_4.1_2.13:4.3.1"

spark = (
    SparkSession.builder.appName("uc-spark")
    .config("spark.jars.packages", f"{UC_SPARK},{DELTA_SPARK}")
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config(
        "spark.sql.catalog.spark_catalog",
        "org.apache.spark.sql.delta.catalog.DeltaCatalog",
    )
    .config("spark.sql.catalog.unity", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.unity.uri", "http://localhost:8080")
    .config("spark.sql.catalog.unity.auth.type", "static")
    .config("spark.sql.catalog.unity.auth.token", "not-used")
    .config("spark.sql.defaultCatalog", "unity")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

# --8<-- [start:check]
spark.sql("SHOW SCHEMAS").show()
spark.sql("SHOW TABLES IN default").show()
# --8<-- [end:check]
schemas = {r.namespace for r in spark.sql("SHOW SCHEMAS").collect()}
assert "default" in schemas, schemas
tables = {r.tableName for r in spark.sql("SHOW TABLES IN default").collect()}
assert {"numbers", "marksheet"} <= tables, tables
assert spark.catalog.currentCatalog() == "unity"

spark.stop()
