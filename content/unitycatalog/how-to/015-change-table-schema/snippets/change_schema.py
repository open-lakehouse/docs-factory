# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0", "unitycatalog-client==0.7.0", "duckdb==1.5.6"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.spark-sql = [
#   { journey = "managed.alter-schema", region = "add-columns", api = "ALTER TABLE … ADD COLUMNS" },
#   { journey = "managed.set-properties", region = "properties", api = "SET TBLPROPERTIES" },
#   { journey = "managed.rename", fails = "ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet", anchor = "rename-a-table-or-column" },
# ]
# claims.spark-python = [
#   { journey = "managed.alter-schema", region = "add-columns", api = "ALTER TABLE … ADD COLUMNS" },
#   { journey = "managed.set-properties", region = "properties", api = "SET TBLPROPERTIES" },
#   { journey = "managed.rename", fails = "ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet", anchor = "rename-a-table-or-column" },
# ]
# claims.duckdb-sql = [
#   { journey = "managed.alter-schema", fails = "UCTableSet::AlterTable", anchor = "choose-a-client" },
# ]
# claims."python-sdk" = [
#   { journey = "table.describe", region = "verify-sdk", api = "TablesApi.get_table" },
# ]
# ///
"""Change a managed Delta table's columns and properties with Spark, and check
what Unity Catalog records.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run change_schema.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import os

import duckdb
from unitycatalog.client import CatalogsApi, CreateCatalog
from unitycatalog.client.exceptions import NotFoundException

UC_API = "http://localhost:8080/api/2.1/unity-catalog"
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")


async def _reset_catalog(create: bool) -> None:
    from unitycatalog.client import ApiClient, Configuration

    async with ApiClient(Configuration(host=UC_API)) as api:
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


def _rejects(statement: str, message: str) -> None:
    try:
        spark.sql(statement)
    except Exception as error:  # noqa: BLE001 - Py4J and Spark errors both count
        assert message in str(error), (statement, str(error)[:2000])
        return
    raise AssertionError(f"now accepted, update the page: {statement}")


def _table() -> dict:
    import json
    import urllib.request

    with urllib.request.urlopen(f"{UC_API}/tables/warehouse.sales.orders") as resp:
        return json.load(resp)


asyncio.run(_reset_catalog(create=True))

# --8<-- [start:session]
from pyspark.sql import SparkSession  # noqa: E402

spark = (
    SparkSession.builder.appName("change-schema")
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
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")

# --8<-- [start:create-table]
spark.sql("CREATE SCHEMA IF NOT EXISTS sales")
spark.sql("""
    CREATE TABLE sales.orders (
        order_id    BIGINT,
        customer    STRING,
        amount      DECIMAL(10, 2),
        quantity    INT,
        legacy_code STRING
    ) USING DELTA
""")
spark.sql("""
    INSERT INTO sales.orders VALUES
        (1, 'ada', 9.50, 1, 'A'),
        (2, 'grace', 20.00, 2, 'B')
""")
# --8<-- [end:create-table]
props = dict(spark.sql("SHOW TBLPROPERTIES sales.orders").collect())
# Column mapping is what lets DROP COLUMN work without rewriting data.
assert props["delta.columnMapping.mode"] == "name", props
for key in [
    "delta.enableDeletionVectors",
    "delta.enableInCommitTimestamps",
    "delta.checkpoint.writeStatsAsStruct",
    "delta.checkpoint.writeStatsAsJson",
]:
    assert props[key] == "true", (key, props)
assert props["delta.checkpointPolicy"] == "v2", props

# --8<-- [start:add-columns]
spark.sql("""
    ALTER TABLE sales.orders
    ADD COLUMNS (channel STRING COMMENT 'Where the order was placed')
""")
spark.sql("ALTER TABLE sales.orders ALTER COLUMN amount COMMENT 'Order total in EUR'")
spark.sql("COMMENT ON TABLE sales.orders IS 'One row per customer order'")
# --8<-- [end:add-columns]
columns = {c["name"]: c for c in _table()["columns"]}
assert columns["channel"]["comment"] == "Where the order was placed", columns
assert columns["amount"]["comment"] == "Order total in EUR", columns
assert _table()["comment"] == "One row per customer order"

# --8<-- [start:check-column-mapping]
spark.sql("SHOW TBLPROPERTIES sales.orders ('delta.columnMapping.mode')").show(
    truncate=False
)
# --8<-- [end:check-column-mapping]
assert (
    spark.sql("SHOW TBLPROPERTIES sales.orders ('delta.columnMapping.mode')")
    .first()
    .value
    == "name"
)

# --8<-- [start:drop-column]
spark.sql("ALTER TABLE sales.orders DROP COLUMN legacy_code")
# --8<-- [end:drop-column]
assert "legacy_code" not in [c["name"] for c in _table()["columns"]]

# A table created with column mapping off can't drop columns.
spark.sql("""
    CREATE TABLE sales.no_mapping (id BIGINT, note STRING) USING DELTA
    TBLPROPERTIES ('delta.columnMapping.mode' = 'none')
""")
_rejects(
    "ALTER TABLE sales.no_mapping DROP COLUMN note",
    "DELTA_UNSUPPORTED_DROP_COLUMN",
)
spark.sql("DROP TABLE sales.no_mapping")

# Without type widening enabled, Delta rejects the type change.
_rejects(
    "ALTER TABLE sales.orders ALTER COLUMN quantity TYPE BIGINT",
    "DELTA_UNSUPPORTED_ALTER_TABLE_CHANGE_COL_OP",
)

# --8<-- [start:widen-type]
spark.sql(
    "ALTER TABLE sales.orders SET TBLPROPERTIES ('delta.enableTypeWidening' = 'true')"
)
spark.sql("ALTER TABLE sales.orders ALTER COLUMN quantity TYPE BIGINT")
# --8<-- [end:widen-type]
assert {c["name"]: c["type_text"] for c in _table()["columns"]}["quantity"] == "bigint"
assert dict(spark.table("sales.orders").dtypes)["quantity"] == "bigint"

# --8<-- [start:properties]
spark.sql("""
    ALTER TABLE sales.orders
    SET TBLPROPERTIES ('sales.owner' = 'orders-team', 'sales.tier' = 'gold')
""")
spark.sql("ALTER TABLE sales.orders UNSET TBLPROPERTIES ('sales.tier')")
spark.sql("SHOW TBLPROPERTIES sales.orders ('sales.owner')").show()
# --8<-- [end:properties]
recorded = _table()["properties"]
assert recorded["sales.owner"] == "orders-team", recorded
assert "sales.tier" not in recorded, recorded

# --8<-- [start:history]
spark.sql("DESCRIBE HISTORY sales.orders").select("version", "operation").show()
# --8<-- [end:history]
history = [
    (r.version, r.operation)
    for r in spark.sql("DESCRIBE HISTORY sales.orders").orderBy("version").collect()
]
assert history == [
    (0, "CREATE TABLE"),
    (1, "WRITE"),
    (2, "ADD COLUMNS"),
    (3, "CHANGE COLUMN"),
    (4, "SET TBLPROPERTIES"),
    (5, "DROP COLUMNS"),
    (6, "SET TBLPROPERTIES"),
    (7, "CHANGE COLUMN"),
    (8, "SET TBLPROPERTIES"),
    (9, "UNSET TBLPROPERTIES"),
], history
# Each change is a catalog-accepted commit: the server's record moved with it.
assert _table()["properties"]["delta.lastUpdateVersion"] == "9"

# --8<-- [start:verify-sdk]
import asyncio  # noqa: E402

from unitycatalog.client import ApiClient, Configuration, TablesApi  # noqa: E402


async def show_table() -> None:
    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    async with ApiClient(config) as api:
        table = await TablesApi(api).get_table(full_name="warehouse.sales.orders")
    print(table.comment)
    for column in table.columns:
        print(column.name, column.type_text, column.comment)
    print(table.properties["sales.owner"])


asyncio.run(show_table())
# --8<-- [end:verify-sdk]


async def _sdk_table():
    async with ApiClient(Configuration(host=UC_API)) as api:
        return await TablesApi(api).get_table(full_name="warehouse.sales.orders")


sdk_table = asyncio.run(_sdk_table())
assert [(c.name, c.type_text) for c in sdk_table.columns] == [
    ("order_id", "bigint"),
    ("customer", "string"),
    ("amount", "decimal(10,2)"),
    ("quantity", "bigint"),
    ("channel", "string"),
], sdk_table.columns
assert sdk_table.properties["sales.owner"] == "orders-team"

# The connector rejects renames.
_rejects(
    "ALTER TABLE sales.orders RENAME COLUMN customer TO buyer",
    "ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet",
)
_rejects(
    "ALTER TABLE sales.orders RENAME TO sales.customer_orders",
    "Renaming a table is not supported yet",
)

# Required managed-table properties: Delta rejects in-commit timestamp changes,
# but Spark and the server both accept turning deletion vectors off. Pin that on
# a scratch table so the page's warning is re-checked when either side changes.
spark.sql("CREATE TABLE sales.scratch_props (id BIGINT) USING DELTA")
_rejects(
    "ALTER TABLE sales.scratch_props SET TBLPROPERTIES ('delta.enableInCommitTimestamps' = 'false')",
    "DELTA_CANNOT_MODIFY_CATALOG_MANAGED_DEPENDENCIES",
)
spark.sql(
    "ALTER TABLE sales.scratch_props SET TBLPROPERTIES ('delta.enableDeletionVectors' = 'false')"
)
import json  # noqa: E402
import urllib.request  # noqa: E402

with urllib.request.urlopen(f"{UC_API}/tables/warehouse.sales.scratch_props") as resp:
    scratch = json.load(resp)
assert scratch["properties"]["delta.enableDeletionVectors"] == "false", scratch
# The other required values aren't protected either.
changed = {
    "delta.checkpointPolicy": "classic",
    "delta.checkpoint.writeStatsAsStruct": "false",
    "delta.checkpoint.writeStatsAsJson": "false",
}
for key, value in changed.items():
    spark.sql(
        f"ALTER TABLE sales.scratch_props SET TBLPROPERTIES ('{key}' = '{value}')"
    )
with urllib.request.urlopen(f"{UC_API}/tables/warehouse.sales.scratch_props") as resp:
    scratch = json.load(resp)
for key, value in changed.items():
    assert scratch["properties"][key] == value, (key, scratch["properties"])
spark.sql("DROP TABLE sales.scratch_props")

# DuckDB attaches the catalog but can't alter its tables.
con = duckdb.connect()
con.execute("INSTALL delta")
con.execute("LOAD delta")
con.execute("FORCE INSTALL unity_catalog FROM core_nightly")
con.execute("LOAD unity_catalog")
con.execute(
    "CREATE SECRET (TYPE unity_catalog, TOKEN 'not-used', ENDPOINT 'http://localhost:8080')"
)
con.execute(
    "ATTACH 'warehouse' AS warehouse (TYPE unity_catalog, DEFAULT_SCHEMA 'sales')"
)
for statement, error, message in [
    (
        "ALTER TABLE warehouse.sales.orders ADD COLUMN note VARCHAR",
        duckdb.NotImplementedException,
        "UCTableSet::AlterTable",
    ),
    (
        "COMMENT ON TABLE warehouse.sales.orders IS 'x'",
        duckdb.BinderException,
        "Only altering tables is supported for now",
    ),
]:
    try:
        con.execute(statement)
    except error as exc:
        assert message in str(exc), exc
        continue
    raise AssertionError(f"now supported, update the page: {statement}")
con.close()

rows_before = sorted(spark.table("sales.orders").collect())
# --8<-- [start:rename-table]
spark.sql(
    "CREATE TABLE sales.customer_orders USING DELTA AS SELECT * FROM sales.orders"
)
spark.sql("DROP TABLE sales.orders")
# --8<-- [end:rename-table]
assert not spark.catalog.tableExists("warehouse.sales.orders")
assert sorted(spark.table("sales.customer_orders").collect()) == rows_before
# The new table starts its own history, without the old table's comment or properties.
renamed_history = [
    (r.version, r.operation)
    for r in spark.sql("DESCRIBE HISTORY sales.customer_orders").collect()
]
assert renamed_history == [(0, "CREATE TABLE AS SELECT")], renamed_history
with urllib.request.urlopen(f"{UC_API}/tables/warehouse.sales.customer_orders") as resp:
    renamed = json.load(resp)
assert renamed.get("comment") is None, renamed.get("comment")
assert "sales.owner" not in renamed["properties"], renamed["properties"]

spark.sql("DROP TABLE sales.customer_orders")
spark.sql("DROP SCHEMA sales")
spark.stop()
asyncio.run(_reset_catalog(create=False))
