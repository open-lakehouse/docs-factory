# /// script
# requires-python = "==3.12.*"
# dependencies = ["pyspark==4.1.0", "unitycatalog-ai==0.4.0"]
# ///
# spark_udf.py — fetch the catalog function with unitycatalog-ai and register it as a
# Spark session UDF, because Spark can't call a Unity Catalog function by name.
# Run:      EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run spark_udf.py   (beside pricing.py)
# Needs:    Java 17, Maven access on first run, and a local Unity Catalog server on
#           http://localhost:8080 (`just env-up unitycatalog`). The script registers
#           uc_functions_demo.pricing.order_total in a catalog of its own: it stops if
#           uc_functions_demo already exists, and deletes only the catalog it created.
# Verified: unitycatalog v0.7.0 (unitycatalog-spark_4.1_2.13:0.7.0), pyspark 4.1.0,
#           delta-spark 4.3.1, unitycatalog-ai 0.4.0, Python 3.12.
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

API = "http://localhost:8080/api/2.1/unity-catalog"
CATALOG = "uc_functions_demo"


async def _refuse_existing() -> None:
    """Stop before touching anything if the demo catalog already exists."""
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration
    from unitycatalog.client.exceptions import NotFoundException

    api = ApiClient(Configuration(host=API))
    try:
        await CatalogsApi(api).get_catalog(name=CATALOG)
    except NotFoundException:
        return
    finally:
        await api.close()
    sys.exit(f"catalog {CATALOG} already exists; drop it or rename CATALOG")


async def _setup() -> None:
    """Register order_total in the catalog of this script's own."""
    from pricing import order_total
    from unitycatalog.ai.core.client import (
        UnitycatalogClient,
        UnitycatalogFunctionClient,
    )
    from unitycatalog.client import ApiClient, Configuration

    api = ApiClient(Configuration(host=API))
    try:
        uc = UnitycatalogClient(api_client=api)
        await uc.create_catalog_async(name=CATALOG)
        await uc.create_schema_async(name="pricing", catalog_name=CATALOG)
        await UnitycatalogFunctionClient(api_client=api).create_python_function_async(
            func=order_total, catalog=CATALOG, schema="pricing"
        )
    finally:
        await api.close()


async def _teardown() -> None:
    """Delete the catalog _setup created, and nothing else."""
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration
    from unitycatalog.client.exceptions import NotFoundException

    api = ApiClient(Configuration(host=API))
    try:
        await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
    except NotFoundException:
        pass  # setup failed before it created the catalog
    finally:
        await api.close()


def _run(step) -> None:
    asyncio.run(step())


def main() -> None:
    # The region imports asyncio itself, which makes the name local to main().
    _run(_refuse_existing)
    # From here on, anything named uc_functions_demo is this run's to delete.
    try:
        _run(_setup)
        # --8<-- [start:udf]
        import asyncio

        from pyspark.sql import SparkSession
        from unitycatalog.ai.core.client import UnitycatalogFunctionClient
        from unitycatalog.client import ApiClient, Configuration

        spark = (
            SparkSession.builder.appName("uc-functions")
            .config(
                "spark.jars.packages",
                "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.7.0,"
                "io.delta:delta-spark_4.1_2.13:4.3.1",
            )
            .config("spark.sql.catalog.unity", "io.unitycatalog.spark.UCSingleCatalog")
            .config("spark.sql.catalog.unity.uri", "http://localhost:8080")
            .config("spark.sql.catalog.unity.auth.type", "static")
            .config("spark.sql.catalog.unity.auth.token", "not-used")
            .config("spark.sql.defaultCatalog", "unity")
            .getOrCreate()
        )

        async def connect():
            config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
            return UnitycatalogFunctionClient(api_client=ApiClient(config))

        client = asyncio.run(connect())

        name = "uc_functions_demo.pricing.order_total"
        order_total = client.get_function_as_callable(name, register_function=False)
        return_type = client.get_function(name).full_data_type  # "DOUBLE"
        spark.udf.register("order_total", order_total, return_type)

        spark.sql("SELECT order_total(3, 19.99D, 10.0D) AS total").show()  # 53.97
        # --8<-- [end:udf]
        spark.sparkContext.setLogLevel("FATAL")
        assert return_type == "DOUBLE", return_type
        total = spark.sql("SELECT order_total(3, 19.99D, 10.0D)").collect()[0][0]
        assert total == 53.97, total

        # By its catalog name, Spark can't resolve the function at all.
        from pyspark.errors import AnalysisException

        try:
            spark.sql(
                f"SELECT {CATALOG}.pricing.order_total(3, 19.99D, 10.0D)"
            ).collect()
        except AnalysisException as exc:
            assert "MISSING_CATALOG_ABILITY.FUNCTIONS" in str(exc), exc
        else:
            raise AssertionError("Spark resolved a catalog function by name")

        spark.stop()
        asyncio.run(client.close_async())
    finally:
        _run(_teardown)


if __name__ == "__main__":
    main()
