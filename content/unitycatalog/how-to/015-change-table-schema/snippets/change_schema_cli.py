# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip", "pyspark==4.1.0", "unitycatalog-client==0.7.0"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# verifies = "change_schema.sh"
# claims.cli = [
#   { journey = "table.describe", region = "get", api = "uc table get" },
# ]
# ///
"""Change a managed table with Spark, then run change_schema.sh's `get` region
and check that the CLI shows the new column, comment, and property.

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import json
import os
from pathlib import Path

from docsnip.shellregions import run
from pyspark.sql import SparkSession
from unitycatalog.client import ApiClient, CatalogsApi, Configuration, CreateCatalog
from unitycatalog.client.exceptions import NotFoundException

SCRIPT = Path(__file__).with_name("change_schema.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")


async def _reset_catalog(create: bool) -> None:
    async with ApiClient(Configuration(host=BASE_URL)) as api:
        catalogs = CatalogsApi(api)
        try:
            await catalogs.delete_catalog(name="warehouse", force=True)
        except NotFoundException:
            pass
        if create:
            await catalogs.create_catalog(
                CreateCatalog(
                    name="warehouse", storage_root=f"file://{DOCS_ROOT}/managed"
                )
            )


if __name__ == "__main__":
    asyncio.run(_reset_catalog(create=True))
    spark = (
        SparkSession.builder.appName("change-schema-cli")
        .config(
            "spark.jars.packages",
            "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.7.0,"
            "io.delta:delta-spark_4.1_2.13:4.3.1",
        )
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .config("spark.sql.catalog.warehouse", "io.unitycatalog.spark.UCSingleCatalog")
        .config("spark.sql.catalog.warehouse.uri", "http://localhost:8080")
        .config("spark.sql.catalog.warehouse.auth.type", "static")
        .config("spark.sql.catalog.warehouse.auth.token", "not-used")
        .config("spark.sql.defaultCatalog", "warehouse")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")
    spark.sql("CREATE SCHEMA sales")
    spark.sql(
        "CREATE TABLE sales.orders (order_id BIGINT, customer STRING, amount DECIMAL(10, 2)) "
        "USING DELTA"
    )
    spark.sql(
        "ALTER TABLE sales.orders "
        "ADD COLUMNS (channel STRING COMMENT 'Where the order was placed')"
    )
    spark.sql("COMMENT ON TABLE sales.orders IS 'One row per customer order'")
    spark.sql("ALTER TABLE sales.orders SET TBLPROPERTIES ('sales.owner' = 'orders-team')")
    spark.stop()

    out = run(SCRIPT, "get")
    table = json.loads(out[out.index("{") :])
    assert table["comment"] == "One row per customer order", table
    channel = next(c for c in table["columns"] if c["name"] == "channel")
    assert channel["comment"] == "Where the order was placed", channel
    assert table["properties"]["sales.owner"] == "orders-team", table["properties"]

    asyncio.run(_reset_catalog(create=False))
