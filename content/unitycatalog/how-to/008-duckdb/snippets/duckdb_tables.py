# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.6", "pyspark==4.1.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.duckdb-sql = [
#   { journey = "table.list", region = "list" },
#   { journey = "managed.read", region = "query" },
#   { journey = "managed.append", region = "append", api = "INSERT INTO" },
#   { journey = "managed.create", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.update", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.delete", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.drop", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "column-mapping.write", region = "append", api = "INSERT INTO", note = "through Unity Catalog" },
#   { journey = "column-mapping.read", region = "query", note = "through Unity Catalog" },
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
import subprocess  # noqa: E402
import sys  # noqa: E402
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
    """Create retail.sales.orders as a managed table with T03's rows."""
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
        "(order_id BIGINT, customer STRING, amount DECIMAL(10, 2)) USING DELTA"
    )
    spark.sql(
        "INSERT INTO retail.sales.orders VALUES "
        "(1, 'ada', 9.50), (2, 'grace', 20.00), (3, 'linus', 3.25)"
    )
    return spark


def _latest_version(table: str = "orders") -> int:
    url = f"{UC_URL}/api/2.1/unity-catalog/delta/v1/catalogs/retail/schemas/sales/tables/{table}"
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)["latest-table-version"]


asyncio.run(_reset_catalog())
spark = _seed_with_spark()
assert _latest_version() == 1  # CREATE TABLE, then INSERT
assert (
    spark.sql("SHOW TBLPROPERTIES retail.sales.orders ('delta.columnMapping.mode')")
    .first()
    .value
    == "name"
)  # Spark's default for new managed tables: DuckDB appends to it below.

# The stable `unity_catalog` build (from `core`) reads the table's DECIMAL column
# too: DuckDB 1.5.4's stable build failed on it (`type_precision`). A separate
# process and extension directory, so the nightly install above stays loaded.
_STABLE_PROBE = r"""
import tempfile, duckdb
con = duckdb.connect(config={"extension_directory": tempfile.mkdtemp()})
for s in ["INSTALL delta", "LOAD delta", "INSTALL unity_catalog", "LOAD unity_catalog",
          "CREATE SECRET (TYPE unity_catalog, TOKEN 'not-used', ENDPOINT 'http://localhost:8080')",
          "ATTACH 'retail' AS retail (TYPE unity_catalog, DEFAULT_SCHEMA 'sales')"]:
    con.execute(s)
print(con.sql(
    "SELECT installed_from FROM duckdb_extensions() WHERE extension_name = 'unity_catalog'"
).fetchone()[0])
print(sorted(float(r[0]) for r in con.sql("SELECT amount FROM retail.sales.orders").fetchall()))
"""
_stable = subprocess.run(
    [sys.executable, "-c", _STABLE_PROBE], capture_output=True, text=True, timeout=300
)
assert _stable.returncode == 0, (
    "stable unity_catalog can't read DECIMAL again: update the page and R01: "
    f"out={_stable.stdout!r} err={_stable.stderr[-800:]!r}"
)
assert _stable.stdout.split() == ["core", "[3.25,", "9.5,", "20.0]"], _stable.stdout

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
# Real values, not NULLs, on a table with column mapping.
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

# DuckDB with the `core_nightly` unity_catalog: appends only, no row changes or DDL.
for unsupported, error, prefix in [
    (
        "UPDATE retail.sales.orders SET amount = 1 WHERE order_id = 4",
        duckdb.BinderException,
        "Binder Error: Can only update base table",
    ),
    (
        "DELETE FROM retail.sales.orders WHERE order_id = 4",
        duckdb.BinderException,
        "Binder Error: Can only delete from base table",
    ),
    (
        "CREATE TABLE retail.sales.returns (order_id BIGINT)",
        duckdb.NotImplementedException,
        "Not implemented Error: UCTableSet::CreateTable",
    ),
    (
        "CREATE TABLE retail.sales.returns AS SELECT * FROM retail.sales.orders",
        duckdb.NotImplementedException,
        "Not implemented Error: UnityCatalog PlanCreateTableAs",
    ),
    (
        "DROP TABLE retail.sales.orders",
        duckdb.NotImplementedException,
        "Not implemented Error: UCTableSet::DropEntry",
    ),
]:
    try:
        con.execute(unsupported)
    except duckdb.Error as err:
        assert type(err) is error, (unsupported, type(err), str(err))
        assert str(err).startswith(prefix), (unsupported, str(err))
        continue
    raise AssertionError(f"now supported, update the page: {unsupported}")
assert _latest_version() == 2

# A second column-mapped table that Spark creates after DuckDB attached: DuckDB's
# rows read back by name in DuckDB and in Spark.
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
assert duck_mapped == [(1, "ada")], (
    f"DuckDB's column-mapped append reads wrong: update the page and R01: {duck_mapped}"
)
assert spark_mapped == [(1, "ada")], spark_mapped

# A partitioned table with column mapping: DuckDB's append fails before it
# commits, and the table keeps Spark's rows and version (R01).
spark.sql(
    "CREATE TABLE retail.sales.by_region (order_id BIGINT, region STRING) "
    "USING DELTA PARTITIONED BY (region)"
)
spark.sql("INSERT INTO retail.sales.by_region VALUES (1, 'emea')")
assert (
    spark.sql("SHOW TBLPROPERTIES retail.sales.by_region ('delta.columnMapping.mode')")
    .first()
    .value
    == "name"
)
partitioned_version = _latest_version("by_region")
con.execute("DETACH retail")  # see the new table
con.execute("ATTACH 'retail' AS retail (TYPE unity_catalog, DEFAULT_SCHEMA 'sales')")
try:
    con.execute("INSERT INTO retail.sales.by_region VALUES (2, 'apac')")
except duckdb.NotImplementedException as err:
    assert str(err) == (
        "Not implemented Error: Inserting into a partitioned Delta table that uses "
        "column mapping is not supported"
    ), err
else:
    raise AssertionError("DuckDB appends to partitioned column-mapped tables now")
assert _latest_version("by_region") == partitioned_version
assert [
    tuple(r) for r in spark.sql("SELECT * FROM retail.sales.by_region").collect()
] == [(1, "emea")]
spark.sql("DROP TABLE retail.sales.by_region")
# No DETACH after the rejected insert: it raises a spurious Binder Error.
con.close()
spark.stop()
