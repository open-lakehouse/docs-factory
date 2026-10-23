# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.python-sdk = [
#   { journey = "view.create", region = "register", api = "create_table" },
#   { journey = "view.list", region = "get", api = "list_tables" },
#   { journey = "view.describe", region = "get", api = "get_table" },
#   { journey = "view.drop", region = "delete", api = "delete_table" },
# ]
# ///
"""Register a SQL view through the Unity Catalog REST API, then query it with
Spark.

Start the docs' local server from `uc-docs-env/unitycatalog`, and seed the
TPC-H sample into it (`samples.tpch`):

    docker compose up -d --wait

Then run this script:

    uv run register_view.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# ruff: noqa: E402
# The regions import what they use, after the hidden setup above them.

import asyncio
import os
import subprocess
from pathlib import Path

from pyspark.sql import SparkSession
from unitycatalog.client.exceptions import (
    BadRequestException,
    NotFoundException,
)

HERE = Path(__file__).resolve().parent
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
SEED = HERE.parents[1] / "003-seed-tpch-data" / "seed_tpch.py"
subprocess.run(
    ["uv", "run", "-q", str(SEED)],
    check=True,
    env={**os.environ, "TPCH_STORAGE_ROOT": f"{DOCS_ROOT}/tpch"},
)

DEFINITION = (
    "SELECT o_orderstatus, COUNT(*) AS orders, SUM(o_totalprice) AS revenue"
    " FROM samples.tpch.orders GROUP BY o_orderstatus"
)


async def _delete() -> None:
    from unitycatalog.client import ApiClient, Configuration, TablesApi

    host = "http://localhost:8080/api/2.1/unity-catalog"
    async with ApiClient(Configuration(host=host)) as api:
        for name in (
            "orders_by_status",
            "no_definition",
            "no_columns",
            "bad_dependency",
        ):
            try:
                await TablesApi(api).delete_table(f"samples.tpch.{name}")
            except NotFoundException:
                pass


asyncio.run(_delete())

# --8<-- [start:register]
import asyncio
import json

from unitycatalog.client import (
    ApiClient,
    Configuration,
    CreateTable,
    TablesApi,
)
from unitycatalog.client.models import (
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
                name="orders_by_status",
                catalog_name="samples",
                schema_name="tpch",
                table_type=TableType.VIEW,
                view_definition=(
                    "SELECT o_orderstatus, COUNT(*) AS orders,"
                    " SUM(o_totalprice) AS revenue"
                    " FROM samples.tpch.orders GROUP BY o_orderstatus"
                ),
                view_dependencies=DependencyList(
                    dependencies=[
                        Dependency(
                            table=TableDependency(table_full_name="samples.tpch.orders")
                        )
                    ]
                ),
                columns=[
                    column(0, "o_orderstatus", ColumnTypeName.STRING, "string"),
                    column(1, "orders", ColumnTypeName.LONG, "long"),
                    column(
                        2,
                        "revenue",
                        ColumnTypeName.DECIMAL,
                        "decimal(25,2)",
                        type_precision=25,
                        type_scale=2,
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
        print([t.name for t in listed.tables if t.table_type == TableType.VIEW])

        view = await tables.get_table("samples.tpch.orders_by_status")
        print([c.name for c in view.columns])
        print(view.view_definition)
        print(view.view_dependencies)
        return view


view = asyncio.run(show())
# --8<-- [end:get]
assert view.table_type == TableType.VIEW, view
assert view.view_definition == DEFINITION, view.view_definition
assert view.storage_location is None, view.storage_location
assert [c.name for c in view.columns] == ["o_orderstatus", "orders", "revenue"]
assert [d.table.table_full_name for d in view.view_dependencies.dependencies] == [
    "samples.tpch.orders"
], view.view_dependencies


async def rejected():
    """The server's checks on a view: a definition, at least one column, and
    dependencies that exist."""
    one = [column(0, "x", ColumnTypeName.INT, "integer")]
    base = dict(catalog_name="samples", schema_name="tpch", table_type=TableType.VIEW)
    cases = [
        (
            CreateTable(**base, name="no_definition", columns=one),
            BadRequestException,
            "view_definition is required for view",
        ),
        (
            CreateTable(
                **base, name="no_columns", view_definition="SELECT 1", columns=[]
            ),
            BadRequestException,
            "columns must contain at least one entry for view",
        ),
        (
            CreateTable(
                **base,
                name="bad_dependency",
                view_definition="SELECT 1 AS x",
                columns=one,
                view_dependencies=DependencyList(
                    dependencies=[
                        Dependency(
                            table=TableDependency(
                                table_full_name="samples.tpch.missing"
                            )
                        )
                    ]
                ),
            ),
            NotFoundException,
            "View dependency table does not exist: samples.tpch.missing",
        ),
    ]
    async with ApiClient(config) as api:
        for request, kind, error in cases:
            try:
                await TablesApi(api).create_table(request)
            except kind as exc:
                assert error in str(exc.body), (error, exc.body)
            else:
                raise AssertionError(f"expected {error!r}")


asyncio.run(rejected())

# The client models require `columns`: leaving it out fails before any request.
try:
    CreateTable(
        name="no_columns",
        catalog_name="samples",
        schema_name="tpch",
        table_type=TableType.VIEW,
        view_definition="SELECT 1",
    )
except ValueError as exc:
    assert "columns" in str(exc), exc
else:
    raise AssertionError("CreateTable accepted a view without columns")

spark = (
    SparkSession.builder.appName("sql-views-rest")
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
    got = spark.sql("SELECT * FROM samples.tpch.orders_by_status ORDER BY 1").collect()
    want = spark.sql(f"{DEFINITION} ORDER BY 1").collect()
    assert got and [tuple(r) for r in got] == [tuple(r) for r in want], (got, want)
    views = {r.viewName for r in spark.sql("SHOW VIEWS IN samples.tpch").collect()}
    assert "orders_by_status" in views, views
finally:
    spark.stop()


# --8<-- [start:delete]
async def delete():
    async with ApiClient(config) as api:
        await TablesApi(api).delete_table("samples.tpch.orders_by_status")


asyncio.run(delete())
# --8<-- [end:delete]


async def gone() -> None:
    async with ApiClient(config) as api:
        tables = TablesApi(api)
        try:
            await tables.get_table("samples.tpch.orders_by_status")
        except NotFoundException:
            pass
        else:
            raise AssertionError("the deleted view still resolves")
        assert (await tables.get_table("samples.tpch.orders")).table_type is not None


asyncio.run(gone())
