# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.python-sdk = [
#   { journey = "metricview.create", region = "register", api = "create_table" },
#   { journey = "metricview.list", region = "get", api = "list_tables" },
#   { journey = "metricview.describe", region = "get", api = "get_table" },
#   { journey = "metricview.drop", region = "delete", api = "delete_table" },
# ]
# ///
"""Register a metric view through the Unity Catalog REST API, then query it
with Spark.

Start the docs' local server from `uc-docs-env/unitycatalog`, and seed the
TPC-H sample into it (`samples.tpch`):

    docker compose up -d --wait

Then run this script beside `orders_metrics.yaml`:

    uv run register_metric_view.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import os
import subprocess
from pathlib import Path

from pyspark.sql import SparkSession
from unitycatalog.client.exceptions import NotFoundException

HERE = Path(__file__).resolve().parent
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
SEED = HERE.parents[1] / "003-seed-tpch-data" / "seed_tpch.py"
subprocess.run(
    ["uv", "run", "-q", str(SEED)],
    check=True,
    env={**os.environ, "TPCH_STORAGE_ROOT": f"{DOCS_ROOT}/tpch"},
)
os.chdir(HERE)


async def _delete() -> None:
    from unitycatalog.client import ApiClient, Configuration, TablesApi

    host = "http://localhost:8080/api/2.1/unity-catalog"
    async with ApiClient(Configuration(host=host)) as api:
        try:
            await TablesApi(api).delete_table("samples.tpch.orders_metrics")
        except NotFoundException:
            pass


asyncio.run(_delete())

# --8<-- [start:register]
import json  # noqa: E402
from pathlib import Path  # noqa: E402

from unitycatalog.client import (  # noqa: E402
    ApiClient,
    Configuration,
    CreateTable,
    TablesApi,
)
from unitycatalog.client.models import (  # noqa: E402
    ColumnInfo,
    ColumnTypeName,
    Dependency,
    DependencyList,
    TableDependency,
    TableType,
)

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")


def column(position, name, type_name, type_text, **decimal):
    return ColumnInfo(
        name=name,
        position=position,
        type_name=type_name,
        type_text=type_text,
        type_json=json.dumps(
            {"name": name, "type": type_text, "nullable": True, "metadata": {}}
        ),
        nullable=True,
        **decimal,
    )


async def register():
    async with ApiClient(config) as api:
        await TablesApi(api).create_table(
            CreateTable(
                name="orders_metrics",
                catalog_name="samples",
                schema_name="tpch",
                table_type=TableType.METRIC_VIEW,
                view_definition=Path("orders_metrics.yaml").read_text(),
                view_dependencies=DependencyList(
                    dependencies=[
                        Dependency(
                            table=TableDependency(table_full_name="samples.tpch.orders")
                        )
                    ]
                ),
                columns=[
                    column(0, "Order Month", ColumnTypeName.TIMESTAMP, "timestamp"),
                    column(1, "Order Status", ColumnTypeName.STRING, "string"),
                    column(2, "Order Count", ColumnTypeName.LONG, "long"),
                    column(
                        3,
                        "Total Revenue",
                        ColumnTypeName.DECIMAL,
                        "decimal(25,2)",
                        type_precision=25,
                        type_scale=2,
                    ),
                    column(
                        4,
                        "Revenue per Customer",
                        ColumnTypeName.DECIMAL,
                        "decimal(38,15)",
                        type_precision=38,
                        type_scale=15,
                    ),
                ],
            )
        )


asyncio.run(register())
# --8<-- [end:register]


# --8<-- [start:get]
async def show():
    async with ApiClient(config) as api:
        tables = TablesApi(api)
        listed = await tables.list_tables(catalog_name="samples", schema_name="tpch")
        print([t.name for t in listed.tables if t.table_type == TableType.METRIC_VIEW])

        view = await tables.get_table("samples.tpch.orders_metrics")
        print([c.name for c in view.columns])
        print(view.view_dependencies)
        return view


view = asyncio.run(show())
# --8<-- [end:get]
assert view.table_type == TableType.METRIC_VIEW, view
assert view.view_definition == (HERE / "orders_metrics.yaml").read_text()

spark = (
    SparkSession.builder.appName("metric-views-rest")
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
    .config("spark.sql.catalog.samples", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.samples.uri", "http://localhost:8080")
    .config("spark.sql.catalog.samples.auth.type", "static")
    .config("spark.sql.catalog.samples.auth.token", "not-used")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("ERROR")
try:
    got = spark.sql("""
        SELECT `Order Status`, MEASURE(`Order Count`), MEASURE(`Revenue per Customer`)
        FROM samples.tpch.orders_metrics GROUP BY ALL ORDER BY 1
    """).collect()
    want = spark.sql("""
        SELECT CASE o_orderstatus WHEN 'O' THEN 'Open' WHEN 'P' THEN 'Processing'
                                  WHEN 'F' THEN 'Fulfilled' END,
               COUNT(1), SUM(o_totalprice) / COUNT(DISTINCT o_custkey)
        FROM samples.tpch.orders WHERE o_orderdate >= DATE'1995-01-01'
        GROUP BY 1 ORDER BY 1
    """).collect()
    assert got and [tuple(r) for r in got] == [tuple(r) for r in want], (got, want)
finally:
    spark.stop()


# --8<-- [start:delete]
async def delete():
    async with ApiClient(config) as api:
        await TablesApi(api).delete_table("samples.tpch.orders_metrics")


asyncio.run(delete())
# --8<-- [end:delete]
asyncio.run(_delete())
