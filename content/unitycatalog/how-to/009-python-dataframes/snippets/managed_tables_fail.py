# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "polars==1.44.2",
#   "daft[unity]==0.7.25",
#   "tenacity",
#   "pandas==2.3.3",
#   "deltalake==1.6.6",
#   "pyarrow>=18",
#   "pyspark==4.1.0",
#   "unitycatalog-client==0.7.0",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-aws/compose.yaml"
# services = ["unitycatalog"]
# claims.polars = [
#   { journey = "managed.read", fails = "Max catalog version is required", anchor = "other-table-operations" },
#   { journey = "managed.append", fails = "Max catalog version is required", anchor = "other-table-operations" },
# ]
# claims.daft = [
#   { journey = "managed.read", fails = "Max catalog version is required", anchor = "other-table-operations" },
#   { journey = "managed.append", fails = "io_config was not provided", anchor = "other-table-operations", note = "on local storage" },
# ]
# claims.pandas = [
#   { journey = "managed.read", fails = "Max catalog version is required", anchor = "other-table-operations" },
#   { journey = "managed.append", fails = "Max catalog version is required", anchor = "other-table-operations" },
# ]
# ///
"""Pin that Polars, Daft, and pandas (deltalake) can't read or append to a catalog-managed table.

Start the docs' local server from `uc-docs-env/uc-aws`:

    docker compose up -d --wait

Then run this script:

    uv run managed_tables_fail.py

None of these libraries can create a catalog-managed table, so the script
creates one with Spark first. That needs Java 17 and Maven access on first
run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import json
import os
import sys
import urllib.request
from collections.abc import Callable

import daft
import pandas as pd
import polars as pl
from daft.catalog import Catalog
from daft.catalog.__unity import UnityCatalogClient
from deltalake import DeltaTable, write_deltalake
from pyspark.sql import SparkSession
from unitycatalog.client import ApiClient, CatalogsApi, Configuration, CreateCatalog
from unitycatalog.client.exceptions import NotFoundException

UC_URL = "http://localhost:8080"
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
ERROR = "Max catalog version is required"


async def _reset_catalog() -> None:
    config = Configuration(host=f"{UC_URL}/api/2.1/unity-catalog")
    async with ApiClient(config) as api:
        try:
            await CatalogsApi(api).delete_catalog(name="retail", force=True)
        except NotFoundException:
            pass
        await CatalogsApi(api).create_catalog(
            CreateCatalog(name="retail", storage_root=f"file://{DOCS_ROOT}/managed")
        )


def _create_managed_table() -> None:
    """Create retail.sales.orders as a catalog-managed table, as the T03 tutorial does."""
    spark = (
        SparkSession.builder.appName("dataframes-managed-seed")
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
        .config("spark.sql.catalog.retail", "io.unitycatalog.spark.UCSingleCatalog")
        .config("spark.sql.catalog.retail.uri", UC_URL)
        .config("spark.sql.catalog.retail.auth.type", "static")
        .config("spark.sql.catalog.retail.auth.token", "not-used")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")
    spark.sql("CREATE SCHEMA retail.sales")
    spark.sql(
        "CREATE TABLE retail.sales.orders "
        "(order_id BIGINT, customer STRING, amount DOUBLE) USING DELTA"
    )
    spark.sql(
        "INSERT INTO retail.sales.orders VALUES "
        "(1, 'ada', 9.5), (2, 'grace', 20.0), (3, 'linus', 3.25)"
    )
    spark.stop()


def _table_info() -> dict:
    url = f"{UC_URL}/api/2.1/unity-catalog/tables/retail.sales.orders"
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)


def _latest_version() -> int:
    url = f"{UC_URL}/api/2.1/unity-catalog/delta/v1/catalogs/retail/schemas/sales/tables/orders"
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)["latest-table-version"]


def _assert_refused(
    what: str, attempt: Callable[[], object], error: str = ERROR
) -> None:
    try:
        attempt()
    except Exception as e:  # noqa: BLE001 - each library wraps the delta-rs error differently
        assert error in str(e), f"{what}: {type(e).__name__}: {e}"
        print(f"{what}: refused ({type(e).__name__})")
        return
    raise AssertionError(
        f"{what} now works on a catalog-managed table: update the docs"
    )


def main() -> None:
    info = _table_info()
    assert info["table_type"] == "MANAGED", info
    location = info["storage_location"]
    row = {"order_id": [4], "customer": ["barbara"], "amount": [12.0]}

    polars_catalog = pl.Catalog(UC_URL, require_https=False)
    _assert_refused(
        "Polars read",
        lambda: polars_catalog.scan_table("retail", "sales", "orders").collect(),
    )
    _assert_refused(
        "Polars append",
        lambda: polars_catalog.write_table(
            pl.DataFrame(row), "retail", "sales", "orders", delta_mode="append"
        ),
    )

    daft_catalog = Catalog.from_unity(UnityCatalogClient(UC_URL, token="not-used"))
    _assert_refused(
        "Daft read",
        lambda: daft_catalog.get_table("retail.sales.orders").read().collect(),
    )
    # On local storage Daft stops before it opens the table: the server vends no
    # credentials for file:// paths, so the append has no io_config.
    _assert_refused(
        "Daft append",
        lambda: daft_catalog.get_table("retail.sales.orders").append(
            daft.from_pydict(row)
        ),
        error="io_config was not provided",
    )

    # On local storage, deltalake opens a table by its storage_location path
    # (uc:// names fail there for another reason; see Known issues).
    _assert_refused("pandas read", lambda: DeltaTable(location).to_pandas())
    _assert_refused(
        "pandas append",
        lambda: write_deltalake(location, pd.DataFrame(row), mode="append"),
    )

    # Nothing the libraries tried reached the catalog as a commit.
    assert _latest_version() == 1, _latest_version()


if __name__ == "__main__":
    asyncio.run(_reset_catalog())
    _create_managed_table()
    assert _latest_version() == 1  # CREATE TABLE, then INSERT
    main()
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
