# /// script
# requires-python = "==3.12.*"
# dependencies = ["pyspark==4.2.0", "unitycatalog-ai==0.4.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# lane = "spark"
# claims."spark-4.2" = [
#   { journey = "function.execute", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "SELECT on the catalog name" },
#   { journey = "function.create", fails = "MISSING_CATALOG_ABILITY.CREATE_FUNCTION", note = "CREATE FUNCTION of any kind: a SQL body and a JVM class both fail" },
#   { journey = "function.list", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "SHOW FUNCTIONS" },
#   { journey = "function.describe", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "DESCRIBE FUNCTION" },
#   { journey = "function.delete", fails = "MISSING_CATALOG_ABILITY.DROP_FUNCTION", note = "DROP FUNCTION" },
# ]
# ///
"""Check that Spark 4.2 resolves catalog functions no better than 4.1.

Verifies the page's claims on the Spark 4.2 line: every function statement on
a catalog name fails, and the session-UDF registration the page shows works.
The page shows the 4.1 session; this script isn't displayed.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script beside `seed.py`:

    uv run spark42_functions.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")


def main() -> None:
    from pyspark.errors import AnalysisException
    from pyspark.sql import SparkSession
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    _with_api("register_all")
    builder = (
        SparkSession.builder.appName("uc-spark-4.2")
        .config(
            "spark.jars.packages",
            "io.unitycatalog:unitycatalog-spark_4.2_2.13:0.7.0,"
            "io.delta:delta-spark_4.2_2.13:4.4.1",
        )
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
    )
    for name in ("unity", "tools"):
        prefix = f"spark.sql.catalog.{name}"
        builder = (
            builder.config(prefix, "io.unitycatalog.spark.UCSingleCatalog")
            .config(f"{prefix}.uri", "http://localhost:8080")
            .config(f"{prefix}.auth.type", "static")
            .config(f"{prefix}.auth.token", "not-used")
        )
    spark = builder.config("spark.sql.defaultCatalog", "unity").getOrCreate()
    spark.sparkContext.setLogLevel("FATAL")
    assert spark.version == "4.2.0", spark.version

    functions = (
        "[MISSING_CATALOG_ABILITY.FUNCTIONS] Catalog tools does not support "
        "functions. SQLSTATE: 0A000"
    )
    create = (
        "[MISSING_CATALOG_ABILITY.CREATE_FUNCTION] Catalog tools does not support "
        "CREATE FUNCTION. SQLSTATE: 0A000"
    )
    # 4.2 names DROP FUNCTION's capability; 4.1 reports FUNCTIONS for it.
    drop = (
        "[MISSING_CATALOG_ABILITY.DROP_FUNCTION] Catalog tools does not support "
        "DROP FUNCTION. SQLSTATE: 0A000"
    )
    for statement, expected in {
        "SELECT tools.pricing.order_total(3, 19.99D, 10.0D)": functions,
        "SELECT tools.pricing.double_it(3)": functions,
        "SHOW FUNCTIONS IN tools.pricing": functions,
        "DESCRIBE FUNCTION tools.pricing.order_total": functions,
        "CREATE FUNCTION tools.pricing.y(x INT) RETURNS INT RETURN x * 2": create,
        "CREATE FUNCTION tools.pricing.f AS 'com.example.F'": create,
        "DROP FUNCTION tools.pricing.order_total": drop,
    }.items():
        try:
            spark.sql(statement).collect()
        except AnalysisException as exc:
            assert expected in str(exc), (statement, str(exc)[:1000])
        else:
            raise AssertionError(f"{statement} should fail")

    async def connect():
        return UnitycatalogFunctionClient(api_client=ApiClient(Configuration(host=URL)))

    client = asyncio.run(connect())
    name = "tools.pricing.order_total"
    # The page's session-UDF registration works on 4.2 too.
    # --8<-- [start:register]
    order_total = client.get_function_as_callable(name, register_function=False)
    return_type = client.get_function(name).full_data_type
    spark.udf.register("order_total", order_total, return_type)
    # --8<-- [end:register]
    total = spark.sql("SELECT order_total(3, 19.99D, 10.0D)").collect()[0][0]
    assert total == 53.97, total

    spark.stop()
    asyncio.run(client.close_async())
    _with_api("drop_all")


def _with_api(step: str) -> None:
    """Run one of seed.py's steps on a connection of its own."""
    from unitycatalog.client import ApiClient, Configuration

    import seed

    async def go():
        api = ApiClient(Configuration(host=URL))
        try:
            await getattr(seed, step)(api)
        finally:
            await api.close()

    asyncio.run(go())


if __name__ == "__main__":
    main()
