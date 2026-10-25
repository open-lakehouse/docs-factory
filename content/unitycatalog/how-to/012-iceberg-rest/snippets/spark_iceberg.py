# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-aws/compose.yaml"
# services = ["unitycatalog"]
# claims.spark-sql = [
#   { journey = "iceberg.schema-create", region = "schema", api = "CREATE NAMESPACE" },
#   { journey = "iceberg.namespace-list", region = "schema", api = "SHOW NAMESPACES" },
#   { journey = "iceberg.namespace-drop", region = "drop", api = "DROP NAMESPACE" },
#   { journey = "iceberg.merge", region = "change", api = "MERGE INTO" },
#   { journey = "iceberg.create", region = "create", api = "CREATE TABLE" },
#   { journey = "iceberg.append", region = "write", api = "INSERT INTO" },
#   { journey = "iceberg.read", region = "read" },
#   { journey = "iceberg.update", region = "change", api = "UPDATE, MERGE INTO" },
#   { journey = "iceberg.delete", region = "change", api = "DELETE FROM" },
#   { journey = "iceberg.rename", region = "rename", api = "ALTER TABLE … RENAME TO" },
#   { journey = "iceberg.drop", region = "drop", api = "DROP TABLE" },
# ]
# ///
"""Create, change, and drop an Iceberg table in Unity Catalog from Spark, through Iceberg REST.

Start the docs' local server from `uc-docs-env/uc-aws`:

    docker compose up -d --wait

Then run this script, with `_setup.py` from the same page beside it:

    AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true uv run spark_iceberg.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# --8<-- [start:session]
from pyspark.sql import SparkSession

ICEBERG_SPARK = "org.apache.iceberg:iceberg-spark-runtime-4.1_2.13:1.11.0"
ICEBERG_AWS = "org.apache.iceberg:iceberg-aws-bundle:1.11.0"

spark = (
    SparkSession.builder.appName("uc-iceberg")
    .config("spark.jars.packages", f"{ICEBERG_SPARK},{ICEBERG_AWS}")
    .config(
        "spark.sql.extensions",
        "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions",
    )
    .config("spark.sql.catalog.retail", "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.retail.type", "rest")
    .config(
        "spark.sql.catalog.retail.uri",
        "http://localhost:8080/api/2.1/unity-catalog/iceberg",
    )
    .config("spark.sql.catalog.retail.warehouse", "retail")
    .config("spark.sql.catalog.retail.token", "not-used")
    .config("spark.sql.defaultCatalog", "retail")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

from _setup import setup_retail, table_info  # noqa: E402

setup_retail()

# --8<-- [start:schema]
spark.sql("CREATE NAMESPACE staging")
spark.sql("SHOW NAMESPACES").show()
# --8<-- [end:schema]
assert {r.namespace for r in spark.sql("SHOW NAMESPACES").collect()} == {
    "sales",
    "staging",
}

# --8<-- [start:create]
spark.sql("""
    CREATE TABLE sales.orders (
        order_id BIGINT,
        customer STRING,
        amount DOUBLE
    ) USING iceberg
""")
# --8<-- [end:create]
info = table_info("retail.sales.orders")
assert (info["data_source_format"], info["table_type"]) == ("ICEBERG", "MANAGED"), info
assert info["storage_location"].startswith(
    "s3://amzn-s3-demo-bucket/retail/managed/"
), info

# --8<-- [start:write]
spark.sql("""
    INSERT INTO sales.orders VALUES
        (1, 'ada', 9.5),
        (2, 'grace', 20.0),
        (3, 'linus', 3.25)
""")
# --8<-- [end:write]

# --8<-- [start:read]
spark.sql("SELECT * FROM sales.orders WHERE amount > 5 ORDER BY order_id").show()
# --8<-- [end:read]
assert spark.table("sales.orders").count() == 3

# --8<-- [start:change]
spark.sql("UPDATE sales.orders SET amount = 21.0 WHERE order_id = 2")
spark.sql("DELETE FROM sales.orders WHERE customer = 'linus'")
spark.sql("""
    MERGE INTO sales.orders AS t
    USING (SELECT 4 AS order_id, 'barbara' AS customer, 12.0 AS amount) AS s
    ON t.order_id = s.order_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")
# --8<-- [end:change]
rows = spark.sql("SELECT * FROM sales.orders ORDER BY order_id").collect()
assert [tuple(r) for r in rows] == [
    (1, "ada", 9.5),
    (2, "grace", 21.0),
    (4, "barbara", 12.0),
], rows

# --8<-- [start:rename]
spark.sql("ALTER TABLE sales.orders RENAME TO sales.order_history")
# --8<-- [end:rename]
assert [r.tableName for r in spark.sql("SHOW TABLES IN sales").collect()] == [
    "order_history"
]

# --8<-- [start:drop]
spark.sql("DROP TABLE sales.order_history")
spark.sql("DROP NAMESPACE staging")
# --8<-- [end:drop]
assert spark.sql("SHOW TABLES IN sales").collect() == []

spark.stop()
