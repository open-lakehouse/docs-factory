# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.2.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# ///
"""What Unity Catalog stores for a SQL view and a metric view, and what it
checks.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run stored_definitions.py

It works in its own schema, `samples.views_explained`, and removes it when it
finishes. Needs Java 17 and Maven access on first run. Behind a Maven mirror,
export PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# ruff: noqa: E402
# The regions import what they use, after the hidden setup above them.

import asyncio
import json
import os
import re
import shutil
from decimal import Decimal
from pathlib import Path

from pyspark.sql import SparkSession
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    CreateTable,
    SchemasApi,
    TablesApi,
)
from unitycatalog.client.exceptions import (
    BadRequestException,
    NotFoundException,
)
from unitycatalog.client.models import (
    ColumnInfo,
    ColumnTypeName,
    Dependency,
    DependencyList,
    TableDependency,
    TableType,
)

DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
DATA = Path(DOCS_ROOT) / "views_explained"
CONFIG = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
SCHEMA = "samples.views_explained"


def column(position, name, type_name, type_text, **decimal):
    # type_json takes Spark's JSON type names: `integer`, not `int`.
    json_type = {"int": "integer"}.get(type_text, type_text)
    return ColumnInfo(
        name=name,
        position=position,
        type_name=type_name,
        type_text=type_text,
        type_json=json.dumps(
            {"name": name, "type": json_type, "nullable": True, "metadata": {}}
        ),
        nullable=True,
        **decimal,
    )


def depends_on(*names):
    return DependencyList(
        dependencies=[
            Dependency(table=TableDependency(table_full_name=name)) for name in names
        ]
    )


async def _clean() -> None:
    """Remove the scratch schema and everything in it, leaving samples.tpch."""
    async with ApiClient(CONFIG) as api:
        tables = TablesApi(api)
        try:
            listed = await tables.list_tables(
                catalog_name="samples", schema_name="views_explained"
            )
        except NotFoundException:
            listed = None
        for table in (listed.tables or []) if listed else []:
            await tables.delete_table(f"{SCHEMA}.{table.name}")
        try:
            await SchemasApi(api).delete_schema(SCHEMA)
        except NotFoundException:
            pass


async def _setup() -> bool:
    """Create the scratch schema; True if `samples` had to be created too."""
    created = False
    async with ApiClient(CONFIG) as api:
        try:
            await CatalogsApi(api).get_catalog("samples")
        except NotFoundException:
            await CatalogsApi(api).create_catalog(
                CreateCatalog(name="samples", comment="TPC-H dataset")
            )
            created = True
        await SchemasApi(api).create_schema(
            CreateSchema(name="views_explained", catalog_name="samples")
        )
    return created


async def _drop_samples() -> None:
    async with ApiClient(CONFIG) as api:
        await CatalogsApi(api).delete_catalog("samples", force=True)


asyncio.run(_clean())
shutil.rmtree(DATA, ignore_errors=True)
CREATED_SAMPLES = asyncio.run(_setup())

spark = (
    SparkSession.builder.appName("views-explained")
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


def expect_error(sql: str, *fragments: str) -> str:
    """Run and collect `sql`, require it to fail, and require each fragment."""
    try:
        spark.sql(sql).collect()
    except Exception as exc:  # noqa: BLE001 - Py4J, Analysis, and Parse errors alike
        message = str(exc)
        print(f"ERROR for {sql!r}:\n{message[:600]}\n")
        for fragment in fragments:
            assert fragment in message, (fragment, message)
        return message
    raise AssertionError(f"expected an error from: {sql}")


for name in ("orders", "customers"):
    spark.sql(f"""
        CREATE TABLE {SCHEMA}.{name} (id INT, status STRING, amount DECIMAL(10,2))
        USING DELTA LOCATION 'file://{DATA}/{name}'
    """)
    spark.sql(f"""
        INSERT INTO {SCHEMA}.{name} VALUES
            (1, 'open', 10.00), (2, 'open', 5.50), (3, 'shipped', 7.25)
    """)

try:
    # a. A view Spark creates: definition, columns, and dependencies, no storage.
    # --8<-- [start:spark-view]
    spark.sql("""
        CREATE VIEW samples.views_explained.order_totals
        AS SELECT status, SUM(amount) AS total
        FROM samples.views_explained.orders
        GROUP BY status
    """)
    # --8<-- [end:spark-view]

    # --8<-- [start:rest-view]
    async def stored(full_name):
        async with ApiClient(CONFIG) as api:
            return await TablesApi(api).get_table(full_name)

    view = asyncio.run(stored("samples.views_explained.order_totals"))
    print(view.table_type)
    print(view.view_definition)
    print([(c.name, c.type_text) for c in view.columns])
    print(view.storage_location)
    print(view.view_dependencies)
    print(view.properties)
    # --8<-- [end:rest-view]
    assert view.table_type == TableType.VIEW, view.table_type
    # The stored definition is the query text after AS, exactly as typed in the
    # spark-view region (newlines and indentation kept), minus the surrounding
    # whitespace.
    region = re.search(
        r"\[start:spark-view\]\n(.*?)# --8<-- \[end:spark-view\]",
        Path(__file__).read_text(),
        re.S,
    ).group(1)
    typed = region.split('"""')[1].split(" AS ", 1)[1].strip()
    assert typed.startswith("SELECT status, SUM(amount)"), typed
    assert view.view_definition == typed, (view.view_definition, typed)
    assert [(c.name, c.type_text) for c in view.columns] == [
        ("status", "string"),
        ("total", "decimal(20,2)"),
    ], view.columns
    assert not view.storage_location, view.storage_location
    assert [d.table.table_full_name for d in view.view_dependencies.dependencies] == [
        "samples.views_explained.orders"
    ], view.view_dependencies
    # Spark's own bookkeeping rides along as properties: the session's current
    # catalog and namespace at creation (spark_catalog.default here, not the
    # view's catalog), the schema mode, the output column names, and the
    # session's SQL configs.
    props = view.properties
    print("PROPERTY KEYS:", sorted(props))
    assert props["view.catalogAndNamespace.numParts"] == "2", props
    assert props["view.catalogAndNamespace.part.0"] == "spark_catalog", props
    assert props["view.catalogAndNamespace.part.1"] == "default", props
    assert props["view.schemaMode"] == "COMPENSATION", props
    assert props["view.query.out.numCols"] == "2", props
    assert [props["view.query.out.col.0"], props["view.query.out.col.1"]] == [
        "status",
        "total",
    ], props
    assert props["view.sqlConfig.spark.sql.ansi.enabled"] == "true", props
    assert "view.sqlConfig.spark.sql.session.timeZone" in props, props
    assert all(
        key.startswith(
            ("view.catalogAndNamespace.", "view.query.out.", "view.sqlConfig.")
        )
        or key == "view.schemaMode"
        for key in props
    ), sorted(props)

    # A view over no table records an empty dependency list.
    spark.sql(f"CREATE VIEW {SCHEMA}.constant AS SELECT 1 AS one")
    constant = asyncio.run(stored(f"{SCHEMA}.constant"))
    assert constant.view_dependencies.dependencies == [], constant.view_dependencies

    # b. A metric view's entry: METRIC_VIEW, a YAML definition, and dependencies.
    YAML = (
        'version: "0.1"\n'
        "source: samples.views_explained.orders\n"
        "dimensions:\n"
        "  - name: Status\n"
        "    expr: status\n"
        "measures:\n"
        "  - name: Revenue\n"
        "    expr: SUM(amount)\n"
    )
    metric_columns = [
        column(0, "Status", ColumnTypeName.STRING, "string"),
        column(
            1,
            "Revenue",
            ColumnTypeName.DECIMAL,
            "decimal(20,2)",
            type_precision=20,
            type_scale=2,
        ),
    ]

    async def register_metric_view():
        async with ApiClient(CONFIG) as api:
            tables = TablesApi(api)
            base = dict(
                catalog_name="samples",
                schema_name="views_explained",
                table_type=TableType.METRIC_VIEW,
                view_definition=YAML,
                columns=metric_columns,
            )
            try:
                await tables.create_table(CreateTable(**base, name="no_dependencies"))
            except BadRequestException as exc:
                no_deps = exc.body
            else:
                raise AssertionError("a metric view without dependencies registered")
            await tables.create_table(
                CreateTable(
                    **base,
                    name="order_metrics",
                    view_dependencies=depends_on("samples.views_explained.orders"),
                )
            )
            return no_deps, await tables.get_table(f"{SCHEMA}.order_metrics")

    no_deps, metric = asyncio.run(register_metric_view())
    assert (
        "view_dependencies must contain at least one entry for metric view" in no_deps
    ), no_deps
    assert metric.table_type == TableType.METRIC_VIEW, metric.table_type
    assert metric.view_definition == YAML, metric.view_definition
    assert not metric.storage_location, metric.storage_location
    assert not metric.properties, metric.properties
    assert [d.table.table_full_name for d in metric.view_dependencies.dependencies] == [
        f"{SCHEMA}.orders"
    ], metric.view_dependencies
    got = spark.sql(f"""
        SELECT Status, MEASURE(Revenue) FROM {SCHEMA}.order_metrics
        GROUP BY ALL ORDER BY 1
    """).collect()
    assert [tuple(r) for r in got] == [
        ("open", Decimal("15.50")),
        ("shipped", Decimal("7.25")),
    ], got

    # c. The server stores a definition it never parses; the engine rejects it.
    async def register_not_sql():
        async with ApiClient(CONFIG) as api:
            await TablesApi(api).create_table(
                CreateTable(
                    name="not_sql",
                    catalog_name="samples",
                    schema_name="views_explained",
                    table_type=TableType.VIEW,
                    view_definition="this is not a query",
                    columns=[column(0, "x", ColumnTypeName.INT, "int")],
                )
            )
            return await TablesApi(api).get_table(f"{SCHEMA}.not_sql")

    not_sql = asyncio.run(register_not_sql())
    assert not_sql.view_definition == "this is not a query", not_sql
    expect_error(
        f"SELECT * FROM {SCHEMA}.not_sql",
        "[PARSE_SYNTAX_ERROR] Syntax error at or near 'this'.",
        "== SQL of VIEW samples.views_explained.not_sql",
    )

    # d/e. Dropping a view's source leaves the view entry; reading it fails.
    spark.sql(f"""
        CREATE VIEW {SCHEMA}.open_customers
        AS SELECT id FROM {SCHEMA}.customers WHERE status = 'open'
    """)
    assert spark.sql(f"SELECT COUNT(*) FROM {SCHEMA}.open_customers").first()[0] == 2
    spark.sql(f"DROP TABLE {SCHEMA}.customers")
    orphan = asyncio.run(stored(f"{SCHEMA}.open_customers"))
    assert orphan.table_type == TableType.VIEW, orphan
    # e. The stored dependency still names the dropped table: the server checks
    # dependencies only when the view is created.
    assert [d.table.table_full_name for d in orphan.view_dependencies.dependencies] == [
        f"{SCHEMA}.customers"
    ], orphan.view_dependencies
    expect_error(
        f"SELECT * FROM {SCHEMA}.open_customers",
        "[TABLE_OR_VIEW_NOT_FOUND] The table or view"
        " `samples`.`views_explained`.`customers` cannot be found.",
    )

    # f. Stored columns that disagree with the query fail only at read.
    async def register_mismatch():
        async with ApiClient(CONFIG) as api:
            await TablesApi(api).create_table(
                CreateTable(
                    name="wrong_columns",
                    catalog_name="samples",
                    schema_name="views_explained",
                    table_type=TableType.VIEW,
                    view_definition=f"SELECT status FROM {SCHEMA}.orders",
                    view_dependencies=depends_on(f"{SCHEMA}.orders"),
                    columns=[column(0, "status", ColumnTypeName.INT, "int")],
                )
            )

    asyncio.run(register_mismatch())
    # Spark plans the read without complaint; the stored INT column fails as
    # the rows are cast.
    planned = spark.sql(f"SELECT * FROM {SCHEMA}.wrong_columns").schema
    assert [(f.name, f.dataType.simpleString()) for f in planned] == [
        ("status", "int")
    ], planned
    expect_error(
        f"SELECT * FROM {SCHEMA}.wrong_columns",
        "[CAST_INVALID_INPUT] The value '",
        'of the type "STRING" cannot be cast to "INT" because it is malformed.',
    )
finally:
    spark.stop()
    asyncio.run(_clean())
    if CREATED_SAMPLES:
        asyncio.run(_drop_samples())
    shutil.rmtree(DATA, ignore_errors=True)


async def _gone() -> None:
    async with ApiClient(CONFIG) as api:
        try:
            await SchemasApi(api).get_schema(SCHEMA)
        except NotFoundException:
            return
        raise AssertionError(f"{SCHEMA} survived the cleanup")


asyncio.run(_gone())
