# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "unitycatalog-client==0.6.0",
#   "deltalake==1.6.6",
#   "pyarrow>=18",
#   "polars==1.44.2",
#   "daft[unity]==0.7.25",
#   "tenacity",
#   "duckdb==1.5.4",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# ///
"""Read the registered external table by name from Polars, Daft, and DuckDB.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run read_engines.py
"""

import asyncio
import os
import shutil
import sys

import external_table as et
from unitycatalog.client import ApiClient, CreateTable, TablesApi
from unitycatalog.client.models import DataSourceFormat, TableType


async def register() -> None:
    shutil.rmtree(et.ROOT / "orders", ignore_errors=True)
    et.ROOT.mkdir(parents=True, exist_ok=True)
    location = et.write_sample()
    async with ApiClient(et.config) as api:
        await et._ensure_schema(api)
        await TablesApi(api).create_table(
            CreateTable(
                name="orders",
                catalog_name="retail",
                schema_name="sales",
                table_type=TableType.EXTERNAL,
                data_source_format=DataSourceFormat.DELTA,
                storage_location=location,
                columns=et.columns_from_delta(location),
            )
        )


def read_polars() -> int:
    # --8<-- [start:polars]
    import polars as pl

    catalog = pl.Catalog("http://localhost:8080", require_https=False)
    orders = catalog.scan_table("retail", "sales", "orders").collect()
    print(orders)
    # --8<-- [end:polars]
    return orders.height


def read_daft() -> int:
    # --8<-- [start:daft]
    from daft.catalog import Catalog
    from daft.catalog.__unity import UnityCatalogClient

    client = UnityCatalogClient("http://localhost:8080", token="not-used")
    orders = Catalog.from_unity(client).get_table("retail.sales.orders").read()
    orders.show()
    # --8<-- [end:daft]
    return orders.count_rows()


def read_duckdb() -> int:
    # --8<-- [start:duckdb]
    import duckdb

    con = duckdb.connect()
    con.execute("INSTALL delta")
    con.execute("LOAD delta")
    con.execute("FORCE INSTALL unity_catalog FROM core_nightly")
    con.execute("LOAD unity_catalog")
    con.execute("""
        CREATE SECRET (
            TYPE unity_catalog,
            TOKEN 'not-used',
            ENDPOINT 'http://localhost:8080'
        )
    """)
    con.execute("ATTACH 'retail' AS retail (TYPE unity_catalog)")
    con.sql("SELECT * FROM retail.sales.orders").show()
    # --8<-- [end:duckdb]
    return con.sql("SELECT count(*) FROM retail.sales.orders").fetchone()[0]


if __name__ == "__main__":
    asyncio.run(register())
    for read in [read_polars, read_daft, read_duckdb]:
        assert read() == 3, read.__name__
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
