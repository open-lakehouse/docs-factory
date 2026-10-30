# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==2.0.0", "pyspark==4.1.0", "deltalake==1.6.6", "pyarrow"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.spark-sql = [
#   { journey = "managed.create", region = "create-table", api = "CREATE TABLE" },
#   { journey = "managed.read", region = "spark-read" },
#   { journey = "managed.append", region = "spark-append", api = "INSERT INTO" },
#   { journey = "managed.update", region = "change-rows", api = "UPDATE" },
#   { journey = "managed.delete", region = "change-rows", api = "DELETE FROM" },
#   { journey = "managed.time-travel", region = "time-travel", api = "VERSION AS OF" },
#   { journey = "managed.drop", region = "drop" },
#   { journey = "managed.path-write", fails = true, anchor = "dont-write-to-the-tables-path" },
# ]
# claims.duckdb-sql = [
#   { journey = "managed.read", region = "duckdb-read" },
#   { journey = "managed.append", region = "duckdb-append" },
# ]
# ///
"""Create, write, read, and drop a catalog-managed Delta table with Spark and DuckDB.

The steps run in the page's order: set up both clients, create, write, read,
read an earlier version, then drop.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run managed_tables.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import json
import os
import urllib.error
import urllib.request

import pyarrow as pa
from deltalake import write_deltalake

API = "http://localhost:8080/api/2.1/unity-catalog"
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")


def _call(method: str, path: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        text = response.read()
    return json.loads(text) if text and method != "DELETE" else {}


def _reset_catalogs() -> None:
    """The page's starting state: `inventory.stock` with a storage root, and a catalog without one."""
    for name in ["inventory", "inventory_no_root"]:
        try:
            _call("DELETE", f"/catalogs/{name}?force=true")
        except urllib.error.HTTPError as err:
            if err.code != 404:
                raise
    _call(
        "POST",
        "/catalogs",
        {"name": "inventory", "storage_root": f"file://{DOCS_ROOT}/managed"},
    )
    _call("POST", "/schemas", {"name": "stock", "catalog_name": "inventory"})
    _call("POST", "/catalogs", {"name": "inventory_no_root"})
    _call("POST", "/schemas", {"name": "stock", "catalog_name": "inventory_no_root"})


def _latest_version(name: str = "items") -> int:
    table = _call("GET", f"/delta/v1/catalogs/inventory/schemas/stock/tables/{name}")
    return table["latest-table-version"]


def _rows(sql: str) -> list[tuple]:
    return [tuple(r) for r in spark.sql(sql).collect()]


def _spark_error(sql: str) -> str:
    try:
        spark.sql(sql).collect()
    except Exception as err:  # noqa: BLE001 - Py4J and Spark raise several types
        return str(err)
    raise AssertionError(f"now succeeds, update the page: {sql}")


_reset_catalogs()

# --8<-- [start:session]
from pyspark.sql import SparkSession  # noqa: E402

spark = (
    SparkSession.builder.appName("managed-delta-tables")
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
    .config("spark.sql.catalog.inventory", "io.unitycatalog.spark.UCSingleCatalog")
    .config("spark.sql.catalog.inventory.uri", "http://localhost:8080")
    .config("spark.sql.catalog.inventory.auth.type", "static")
    .config("spark.sql.catalog.inventory.auth.token", "not-used")
    .getOrCreate()
)
# --8<-- [end:session]
spark.sparkContext.setLogLevel("ERROR")
# Only for the no-storage-root check below; the reader's session has one catalog.
spark.conf.set(
    "spark.sql.catalog.inventory_no_root", "io.unitycatalog.spark.UCSingleCatalog"
)
spark.conf.set("spark.sql.catalog.inventory_no_root.uri", "http://localhost:8080")
spark.conf.set("spark.sql.catalog.inventory_no_root.auth.type", "static")
spark.conf.set("spark.sql.catalog.inventory_no_root.auth.token", "not-used")

# --8<-- [start:duckdb-connect]
import duckdb  # noqa: E402

con = duckdb.connect()
con.execute("INSTALL delta")
con.execute("LOAD delta")
con.execute("INSTALL unity_catalog")
con.execute("LOAD unity_catalog")
con.execute("""
    CREATE SECRET (
        TYPE unity_catalog,
        TOKEN 'not-used',
        ENDPOINT 'http://localhost:8080'
    )
""")
con.execute(
    "ATTACH 'inventory' AS inventory (TYPE unity_catalog, DEFAULT_SCHEMA 'stock')"
)
# --8<-- [end:duckdb-connect]

# --8<-- [start:create-table]
spark.sql("""
    CREATE TABLE inventory.stock.items (
        sku STRING,
        qty INT
    ) USING DELTA
""")
# --8<-- [end:create-table]
table = _call("GET", "/tables/inventory.stock.items")
assert table["table_type"] == "MANAGED", table["table_type"]
assert table["storage_location"].startswith(
    f"file://{DOCS_ROOT}/managed/__unitystorage/catalogs/"
), table["storage_location"]
assert table["properties"]["delta.feature.catalogManaged"] == "supported"

# No storage root on the schema, the catalog, or the metastore.
message = _spark_error(
    "CREATE TABLE inventory_no_root.stock.items (sku STRING) USING DELTA"
)
assert (
    "None of catalog, schema or storage-root.tables server property has managed "
    "location configured."
) in message, message

# External tables can't live under the reserved prefix (R01, managed Delta tables).
message = _spark_error(
    "CREATE TABLE inventory.stock.elsewhere (sku STRING) USING DELTA "
    f"LOCATION '{table['storage_location']}-copy'"
)
assert "contains managed storage prefix __unitystorage" in message, message

# --8<-- [start:inspect]
spark.sql("""
    DESCRIBE DETAIL inventory.stock.items
""").select("minReaderVersion", "minWriterVersion", "tableFeatures").show(
    truncate=False
)
# --8<-- [end:inspect]
detail = spark.sql("DESCRIBE DETAIL inventory.stock.items").first()
assert (detail.minReaderVersion, detail.minWriterVersion) == (3, 7), detail
required = {
    "catalogManaged",
    "deletionVectors",
    "v2Checkpoint",
    "vacuumProtocolCheck",
    "inCommitTimestamp",
}
assert required <= set(detail.tableFeatures), detail.tableFeatures
# Spark also takes the server's suggested features: column mapping (`name`),
# row tracking, and domain metadata.
assert {"columnMapping", "rowTracking", "domainMetadata"} <= set(
    detail.tableFeatures
), detail.tableFeatures

# The server's staging response is where the client learns these: the required
# protocol and properties, then the suggested ones (UC Delta API).
staged = _call(
    "POST",
    "/delta/v1/catalogs/inventory/schemas/stock/staging-tables",
    {"name": "staged_only"},
)
assert staged["required-protocol"]["min-reader-version"] == 3, staged
assert staged["required-protocol"]["min-writer-version"] == 7, staged
assert set(staged["required-protocol"]["writer-features"]) == required, staged
assert set(staged["required-protocol"]["reader-features"]) == required - {
    "inCommitTimestamp"
}, staged
assert staged["required-properties"]["delta.enableDeletionVectors"] == "true", staged
assert set(staged["suggested-protocol"]["writer-features"]) == {
    "columnMapping",
    "rowTracking",
    "domainMetadata",
}, staged
assert staged["suggested-properties"]["delta.columnMapping.mode"] == "name", staged

# A suggestion yields to the caller's own value; a requirement doesn't (below).
spark.sql(
    "CREATE TABLE inventory.stock.unmapped (sku STRING, qty INT) USING DELTA "
    "TBLPROPERTIES ('delta.columnMapping.mode' = 'none')"
)
mode = spark.sql(
    "SHOW TBLPROPERTIES inventory.stock.unmapped ('delta.columnMapping.mode')"
).first()
assert mode.value == "none", mode
spark.sql("DROP TABLE inventory.stock.unmapped")

# --8<-- [start:conflicting-property]
try:
    spark.sql("""
        CREATE TABLE inventory.stock.returns (sku STRING, qty INT)
        USING DELTA
        TBLPROPERTIES ('delta.enableDeletionVectors' = 'false')
    """)
except Exception as err:
    print(err)
# --8<-- [end:conflicting-property]
else:
    raise AssertionError("the server accepts DVs off now: update the page")
message = _spark_error(
    "CREATE TABLE inventory.stock.returns (sku STRING, qty INT) USING DELTA "
    "TBLPROPERTIES ('delta.enableDeletionVectors' = 'false')"
)
assert (
    "Cannot create table inventory.stock.returns: catalog requires table property "
    "'delta.enableDeletionVectors'='true' but the caller supplied "
    "'delta.enableDeletionVectors'='false'. Remove the conflicting TBLPROPERTIES "
    "entry and retry."
) in message, message

# --8<-- [start:spark-append]
spark.sql("""
    INSERT INTO inventory.stock.items VALUES
        ('apple', 10),
        ('pear', 4),
        ('plum', 0)
""")
# --8<-- [end:spark-append]
assert _latest_version() == 1
expected_v1 = [("apple", 10), ("pear", 4), ("plum", 0)]
assert _rows("SELECT sku, qty FROM inventory.stock.items ORDER BY sku") == expected_v1

# A second table for DuckDB's writes, with Spark's defaults: column mapping on.
spark.sql("CREATE TABLE inventory.stock.restock (sku STRING, qty INT) USING DELTA")
assert (
    spark.sql("SHOW TBLPROPERTIES inventory.stock.restock ('delta.columnMapping.mode')")
    .first()
    .value
    == "name"
)

# --8<-- [start:duckdb-append]
con.execute("INSERT INTO inventory.stock.restock VALUES ('fig', 7)")
# --8<-- [end:duckdb-append]
# DuckDB attached before Spark created `restock`, and still writes to it. Its
# rows read back by name in both engines, column mapping notwithstanding.
assert _rows("SELECT sku, qty FROM inventory.stock.restock") == [("fig", 7)], (
    "DuckDB's column-mapped append reads wrong in Spark: update the page and R01"
)
assert con.sql("SELECT sku, qty FROM inventory.stock.restock").fetchall() == [
    ("fig", 7)
]

# Stale session (R01, known issues): DuckDB has read the table, then Spark
# commits. DuckDB keeps the snapshot it read: its reads miss Spark's row, and
# its next append fails with HTTP 409 and leaves the table unchanged. Retrying
# in the same attachment fails the same way.
spark.sql("INSERT INTO inventory.stock.restock VALUES ('kiwi', 2)")
restock_version = _latest_version("restock")
restock_rows = sorted(_rows("SELECT sku, qty FROM inventory.stock.restock"))
seen = con.sql("SELECT sku, qty FROM inventory.stock.restock").fetchall()
assert seen == [("fig", 7)], f"DuckDB sees other engines' commits now: {seen}"
for attempt in (1, 2):
    try:
        con.execute("INSERT INTO inventory.stock.restock VALUES ('lime', 3)")
    except duckdb.TransactionException as err:
        message = str(err)
        assert "Failed to commit: Request to" in message, message
        assert "/delta/v1/catalogs/inventory/schemas/stock/tables/restock" in message
        assert "failed (HTTP 409): Conflict" in message, message
    else:
        raise AssertionError(
            f"DuckDB stale append #{attempt} commits now: update the page"
        )
    assert _latest_version("restock") == restock_version
    assert sorted(_rows("SELECT sku, qty FROM inventory.stock.restock")) == restock_rows

# --8<-- [start:duckdb-reattach]
con.execute("DETACH inventory")
con.execute(
    "ATTACH 'inventory' AS inventory (TYPE unity_catalog, DEFAULT_SCHEMA 'stock')"
)
con.execute("INSERT INTO inventory.stock.restock VALUES ('lime', 3)")
# --8<-- [end:duckdb-reattach]
assert _latest_version("restock") == restock_version + 1
assert sorted(_rows("SELECT sku, qty FROM inventory.stock.restock")) == sorted(
    restock_rows + [("lime", 3)]
)
# The new attachment reads every engine's rows, column-mapped, by name.
seen = sorted(con.sql("SELECT sku, qty FROM inventory.stock.restock").fetchall())
assert seen == [("fig", 7), ("kiwi", 2), ("lime", 3)], seen

# --8<-- [start:change-rows]
spark.sql("UPDATE inventory.stock.items SET qty = qty + 5 WHERE sku = 'pear'")
spark.sql("DELETE FROM inventory.stock.items WHERE qty = 0")
# --8<-- [end:change-rows]
expected = [("apple", 10), ("pear", 9)]
assert _rows("SELECT sku, qty FROM inventory.stock.items ORDER BY sku") == expected
assert _latest_version() == 3

# --8<-- [start:spark-read]
spark.sql("""
    SELECT sku, qty
    FROM inventory.stock.items
    ORDER BY sku
""").show()
# --8<-- [end:spark-read]
assert _rows("SELECT sku, qty FROM inventory.stock.items ORDER BY sku") == expected

# --8<-- [start:duckdb-read]
con.sql("""
    SELECT sku, qty
    FROM inventory.stock.items
    ORDER BY sku
""").show()
# --8<-- [end:duckdb-read]
seen = con.sql("SELECT sku, qty FROM inventory.stock.items ORDER BY sku").fetchall()
assert seen == expected, seen

# --8<-- [start:time-travel]
spark.sql("""
    SELECT sku, qty
    FROM inventory.stock.items VERSION AS OF 1
    ORDER BY sku
""").show()
# --8<-- [end:time-travel]
seen = _rows("SELECT sku, qty FROM inventory.stock.items VERSION AS OF 1 ORDER BY sku")
assert seen == expected_v1, seen

# On local storage, the server vends no credentials for the table.
for operation in ["READ", "READ_WRITE"]:
    vended = _call(
        "POST",
        "/temporary-table-credentials",
        {"table_id": table["table_id"], "operation": operation},
    )
    assert vended["url"] == table["storage_location"], vended
    assert not any(
        vended[k]
        for k in [
            "aws_temp_credentials",
            "azure_user_delegation_sas",
            "gcp_oauth_token",
        ]
    ), vended

# Path-based access: Spark and deltalake both refuse, and the table is unchanged.
path_uri = detail.location
message = _spark_error(f"INSERT INTO delta.`{path_uri}` VALUES ('kiwi', 1)")
assert (
    "[DELTA_PATH_BASED_ACCESS_TO_CATALOG_MANAGED_TABLE_BLOCKED] Path-based access "
    "is not allowed for Catalog-Managed table"
) in message, message
local_path = path_uri.removeprefix("file:")
try:
    write_deltalake(
        local_path,
        pa.table({"sku": ["kiwi"], "qty": pa.array([1], pa.int32())}),
        mode="append",
    )
except Exception as err:  # noqa: BLE001 - deltalake raises DeltaError
    assert (
        "Max catalog version is required when loading a catalog-managed table"
        in str(err)
    ), err
else:
    raise AssertionError("deltalake wrote to a catalog-managed path: update the page")
assert _latest_version() == 3
assert _rows("SELECT count(*) FROM inventory.stock.items") == [(2,)]

con.close()

# --8<-- [start:drop]
spark.sql("DROP TABLE inventory.stock.items")
# --8<-- [end:drop]
assert not spark.catalog.tableExists("inventory.stock.items")
# The files outlive the drop until `server.storage-cleanup.initial-delay` passes.
assert os.path.exists(local_path), local_path

spark.stop()
for name in ["inventory", "inventory_no_root"]:
    _call("DELETE", f"/catalogs/{name}?force=true")
