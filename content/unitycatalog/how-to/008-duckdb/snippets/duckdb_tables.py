# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.4", "pyspark==4.1.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.duckdb = [
#   { journey = "table.list", region = "list" },
#   { journey = "managed.read", region = "query" },
#   { journey = "managed.append", region = "append", note = "tables with column mapping off" },
#   { journey = "managed.create", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.update", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.delete", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.drop", fails = true, anchor = "create-change-and-drop-tables" },
# ]
# claims."delta:duckdb-sql" = [
#   { journey = "write.append", region = "append", api = "INSERT INTO", note = "through Unity Catalog" },
#   { journey = "read.scan", region = "query", note = "through Unity Catalog" },
#   { journey = "catalog.unity", region = "attach", api = "ATTACH … (TYPE unity_catalog)", note = "nightly `unity_catalog`" },
#   { journey = "catalog-managed.read", region = "query", note = "through Unity Catalog" },
#   { journey = "catalog-managed.write", region = "append", api = "INSERT INTO", note = "through Unity Catalog, column mapping off" },
#   { journey = "column-mapping.write", fails = "DuckDB appends to column-mapped tables now", anchor = "append-rows", note = "rows read back as NULL" },
# ]
# ///
"""Read and append to a Unity Catalog managed Delta table from DuckDB.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run duckdb_tables.py

DuckDB can't create Unity Catalog tables, so the script first creates one with
Spark. That needs Java 17 and Maven access on first run. Behind a Maven mirror,
export PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

# --8<-- [start:install]
import duckdb

con = duckdb.connect()
con.execute("INSTALL delta")
con.execute("LOAD delta")
con.execute("FORCE INSTALL unity_catalog FROM core_nightly")
con.execute("LOAD unity_catalog")
# --8<-- [end:install]

import asyncio  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import urllib.request  # noqa: E402

from pyspark.sql import SparkSession  # noqa: E402
from unitycatalog.client import (  # noqa: E402
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
)
from unitycatalog.client.exceptions import NotFoundException  # noqa: E402

UC_URL = "http://localhost:8080"
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")


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


def _seed_with_spark() -> SparkSession:
    """Create retail.sales.orders as a managed table with T03's rows.

    Unlike T03, column mapping is off so that DuckDB's appended rows read back
    correctly.
    """
    spark = (
        SparkSession.builder.appName("duckdb-seed")
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
        "(order_id BIGINT, customer STRING, amount DECIMAL(10, 2)) USING DELTA "
        "TBLPROPERTIES ('delta.columnMapping.mode' = 'none')"
    )
    spark.sql(
        "INSERT INTO retail.sales.orders VALUES "
        "(1, 'ada', 9.50), (2, 'grace', 20.00), (3, 'linus', 3.25)"
    )
    return spark


def _latest_version() -> int:
    url = f"{UC_URL}/api/2.1/unity-catalog/delta/v1/catalogs/retail/schemas/sales/tables/orders"
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)["latest-table-version"]


asyncio.run(_reset_catalog())
spark = _seed_with_spark()
assert _latest_version() == 1  # CREATE TABLE, then INSERT
assert (
    spark.sql("SHOW TBLPROPERTIES retail.sales.orders ('delta.columnMapping.mode')")
    .first()
    .value
    == "none"
)

# --8<-- [start:attach]
con.execute("""
    CREATE SECRET (
        TYPE unity_catalog,
        TOKEN 'not-used',
        ENDPOINT 'http://localhost:8080'
    )
""")
con.execute("ATTACH 'retail' AS retail (TYPE unity_catalog, DEFAULT_SCHEMA 'sales')")
# --8<-- [end:attach]

# --8<-- [start:list]
con.sql("SELECT database, schema, name FROM (SHOW ALL TABLES)").show()
# --8<-- [end:list]
listed = con.sql("SELECT database, schema, name FROM (SHOW ALL TABLES)").fetchall()
assert ("retail", "sales", "orders") in listed, listed

# --8<-- [start:query]
con.sql("""
    SELECT customer, amount
    FROM retail.sales.orders
    WHERE amount > 5
    ORDER BY order_id
""").show()
# --8<-- [end:query]
rows = con.sql("SELECT order_id, customer, amount FROM retail.sales.orders ORDER BY 1")
assert [(r[0], r[1], float(r[2])) for r in rows.fetchall()] == [
    (1, "ada", 9.5),
    (2, "grace", 20.0),
    (3, "linus", 3.25),
]

# --8<-- [start:append]
con.execute("INSERT INTO retail.sales.orders VALUES (4, 'barbara', 12.00)")
# --8<-- [end:append]
assert _latest_version() == 2, "DuckDB's append should be a catalog-accepted commit"
assert con.sql("SELECT count(*) FROM retail.sales.orders").fetchone() == (4,)
# Real values, not NULLs: DuckDB writes logical column names, which only a table
# with column mapping off reads back (R01, Clients and engines).
appended = [(4, "barbara", 12.0)]
duck_seen = con.sql(
    "SELECT order_id, customer, amount FROM retail.sales.orders WHERE order_id = 4"
).fetchall()
assert [(r[0], r[1], float(r[2])) for r in duck_seen] == appended, duck_seen
spark_seen = spark.sql(
    "SELECT order_id, customer, amount FROM retail.sales.orders ORDER BY order_id"
).collect()
assert [(r[0], r[1], float(r[2])) for r in spark_seen] == [
    (1, "ada", 9.5),
    (2, "grace", 20.0),
    (3, "linus", 3.25),
    *appended,
], spark_seen

# DuckDB 1.5.4 with unity_catalog 3ab8508: appends only, no row changes or DDL.
for unsupported in [
    "UPDATE retail.sales.orders SET amount = 1 WHERE order_id = 4",
    "DELETE FROM retail.sales.orders WHERE order_id = 4",
    "CREATE TABLE retail.sales.returns (order_id BIGINT)",
    "DROP TABLE retail.sales.orders",
]:
    try:
        con.execute(unsupported)
    except (duckdb.BinderException, duckdb.NotImplementedException):
        continue
    raise AssertionError(f"now supported, update the page: {unsupported}")
assert _latest_version() == 2

# Negative case: on a table left at Spark's default column mapping (`name`), the
# commit succeeds but DuckDB's rows read as NULL in DuckDB and in Spark (R01).
spark.sql(
    "CREATE TABLE retail.sales.mapped (order_id BIGINT, customer STRING) USING DELTA"
)
assert (
    spark.sql("SHOW TBLPROPERTIES retail.sales.mapped ('delta.columnMapping.mode')")
    .first()
    .value
    == "name"
)
# DuckDB caches the attached catalog's tables, so re-attach to see `mapped`.
con.execute("DETACH retail")
con.execute("ATTACH 'retail' AS retail (TYPE unity_catalog, DEFAULT_SCHEMA 'sales')")
con.execute("INSERT INTO retail.sales.mapped VALUES (1, 'ada')")
duck_mapped = con.sql("SELECT order_id, customer FROM retail.sales.mapped").fetchall()
spark_mapped = [
    tuple(r) for r in spark.sql("SELECT * FROM retail.sales.mapped").collect()
]
spark.sql("DROP TABLE retail.sales.mapped")
assert duck_mapped == [(None, None)], (
    f"DuckDB appends to column-mapped tables now: update the page and R01: {duck_mapped}"
)
assert spark_mapped == [(None, None)], spark_mapped
spark.stop()
