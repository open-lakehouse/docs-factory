# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0", "unitycatalog-client==0.6.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# ///
"""Create a catalog-managed Delta table with Spark, change it, and drop it.

docker compose up -d --wait   # from envs/unitycatalog
uv run snippets/managed_table.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# --8<-- [start:imports]
import asyncio
import os

from pyspark.sql import SparkSession
from unitycatalog.client import ApiClient, CatalogsApi, Configuration, CreateCatalog

# --8<-- [end:imports]
from unitycatalog.client.exceptions import NotFoundException


async def _drop_catalog() -> None:
    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    async with ApiClient(config) as api:
        try:
            await CatalogsApi(api).delete_catalog(name="retail", force=True)
        except NotFoundException:
            pass


asyncio.run(_drop_catalog())

# --8<-- [start:catalog]
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")


async def create_catalog() -> None:
    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    async with ApiClient(config) as api:
        catalog = await CatalogsApi(api).create_catalog(
            CreateCatalog(name="retail", storage_root=f"file://{DOCS_ROOT}/managed")
        )
        print(catalog.storage_location)


asyncio.run(create_catalog())
# --8<-- [end:catalog]


# --8<-- [start:session]
spark = (
    SparkSession.builder.appName("managed-orders")
    .config(
        "spark.jars.packages",
        "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.6.0,"
        "io.delta:delta-spark_4.1_2.13:4.3.1",
    )
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config(
        "spark.sql.catalog.spark_catalog",
        "org.apache.spark.sql.delta.catalog.DeltaCatalog",
    )
    .config("spark.sql.catalog.retail", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.retail.uri", "http://localhost:8080")
    .config("spark.sql.catalog.retail.auth.type", "static")
    .config("spark.sql.catalog.retail.auth.token", "not-used")
    .config("spark.sql.defaultCatalog", "retail")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

# --8<-- [start:create-table]
spark.sql("CREATE SCHEMA sales")
spark.sql("""
    CREATE TABLE sales.orders (
        order_id BIGINT,
        customer STRING,
        amount   DECIMAL(10, 2)
    ) USING DELTA
""")
# --8<-- [end:create-table]

# --8<-- [start:write-rows]
spark.sql("""
    INSERT INTO sales.orders VALUES
        (1, 'ada', 9.50),
        (2, 'grace', 20.00),
        (3, 'linus', 3.25)
""")
spark.table("sales.orders").orderBy("order_id").show()
# --8<-- [end:write-rows]
rows = [tuple(r) for r in spark.table("sales.orders").orderBy("order_id").collect()]
assert [(r[0], r[1], float(r[2])) for r in rows] == [
    (1, "ada", 9.5),
    (2, "grace", 20.0),
    (3, "linus", 3.25),
], rows

# --8<-- [start:inspect]
detail = spark.sql("DESCRIBE DETAIL sales.orders").first()
print(detail.location)
print(
    spark.sql(
        "SHOW TBLPROPERTIES sales.orders ('delta.feature.catalogManaged')"
    ).first()
)
# --8<-- [end:inspect]
assert detail.location.startswith(f"file:{DOCS_ROOT}/managed/__unitystorage/"), (
    detail.location
)
props = dict(spark.sql("SHOW TBLPROPERTIES sales.orders").collect())
assert props["delta.feature.catalogManaged"] == "supported", props
assert props.get("io.unitycatalog.tableId"), props

# --8<-- [start:change-rows]
spark.sql("UPDATE sales.orders SET amount = 25.00 WHERE order_id = 2")
spark.sql("DELETE FROM sales.orders WHERE customer = 'linus'")
spark.sql("DESCRIBE HISTORY sales.orders").select("version", "operation").show()
# --8<-- [end:change-rows]
history = [
    (r.version, r.operation)
    for r in spark.sql("DESCRIBE HISTORY sales.orders").orderBy("version").collect()
]
assert history == [
    (0, "CREATE TABLE"),
    (1, "WRITE"),
    (2, "UPDATE"),
    (3, "DELETE"),
], history
rows = [tuple(r) for r in spark.table("sales.orders").orderBy("order_id").collect()]
assert [(r[0], float(r[2])) for r in rows] == [(1, 9.5), (2, 25.0)], rows

# --8<-- [start:time-travel]
spark.sql("SELECT count(*) AS orders FROM sales.orders VERSION AS OF 1").show()
# --8<-- [end:time-travel]
assert spark.sql("SELECT count(*) FROM sales.orders VERSION AS OF 1").first()[0] == 3

# --8<-- [start:clean-up]
spark.sql("DROP TABLE sales.orders")
spark.sql("DROP SCHEMA sales")
spark.stop()
# --8<-- [end:clean-up]

# The server deletes a managed table's files when the table is dropped.
table_dir = detail.location.removeprefix("file:")
assert not os.path.exists(table_dir), os.listdir(table_dir)

asyncio.run(_drop_catalog())
