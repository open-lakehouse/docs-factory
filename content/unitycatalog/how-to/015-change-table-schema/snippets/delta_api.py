# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.spark = [
#   { journey = "external.alter-schema", region = "external-alter", api = "ALTER TABLE … ADD COLUMNS", note = "sync through the Delta API" },
#   { journey = "external.set-properties", region = "external-alter", api = "SET TBLPROPERTIES, COMMENT ON TABLE", note = "sync through the Delta API" },
# ]
# claims.spark-python = [
#   { journey = "external.alter-schema", region = "external-alter", api = "ALTER TABLE … ADD COLUMNS", note = "sync through the Delta API" },
#   { journey = "external.set-properties", region = "external-alter", api = "SET TBLPROPERTIES, COMMENT ON TABLE", note = "sync through the Delta API" },
# ]
# ///
"""Change an external table's columns, comment, and properties with Spark, then
bring the catalog's record back in step with its Delta log through the Unity
Catalog Delta API, with plain HTTP.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run delta_api.py

Spark needs Java 17 and Maven access on first run. Behind a Maven mirror,
export PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import json
import os
import shutil
import urllib.error
import urllib.request

from pyspark.sql import SparkSession
from unitycatalog.client import ApiClient, CatalogsApi, Configuration, CreateCatalog
from unitycatalog.client.exceptions import NotFoundException

UC_API = "http://localhost:8080/api/2.1/unity-catalog"
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
EVENTS = f"{DOCS_ROOT}/order_events"


async def _reset_catalog(create: bool) -> None:
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


def _request(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{UC_API}/{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def _recorded() -> dict:
    return _request("GET", "tables/warehouse.sales.order_events")


def _column_comments() -> dict[str, str | None]:
    return {c["name"]: c.get("comment") for c in _recorded()["columns"]}


asyncio.run(_reset_catalog(create=True))
shutil.rmtree(EVENTS, ignore_errors=True)
spark = (
    SparkSession.builder.appName("delta-api")
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
spark.sparkContext.setLogLevel("ERROR")
spark.sql("CREATE SCHEMA sales")

# An external table registered with its columns, as on the register page.
spark.createDataFrame(
    [(1, "created"), (2, "shipped")], "order_id BIGINT, status STRING"
).write.format("delta").save(f"file://{EVENTS}")
_request(
    "POST",
    "tables",
    {
        "name": "order_events",
        "catalog_name": "warehouse",
        "schema_name": "sales",
        "table_type": "EXTERNAL",
        "data_source_format": "DELTA",
        "storage_location": f"file://{EVENTS}",
        "columns": [
            {
                "name": name,
                "type_name": type_name,
                "type_text": type_text,
                "type_json": json.dumps(
                    {"name": name, "type": delta_type, "nullable": True, "metadata": {}}
                ),
                "position": position,
                "nullable": True,
            }
            for position, (name, type_name, type_text, delta_type) in enumerate(
                [
                    ("order_id", "LONG", "bigint", "long"),
                    ("status", "STRING", "string", "string"),
                ]
            )
        ],
    },
)
registered = _recorded()

# --8<-- [start:external-alter]
spark.sql("ALTER TABLE sales.order_events ADD COLUMNS (carrier STRING)")
spark.sql(
    "ALTER TABLE sales.order_events ALTER COLUMN status COMMENT 'Latest order status'"
)
spark.sql("COMMENT ON TABLE sales.order_events IS 'One row per order event'")
spark.sql(
    "ALTER TABLE sales.order_events SET TBLPROPERTIES ('sales.owner' = 'orders-team')"
)
# --8<-- [end:external-alter]
# Spark wrote every change to the Delta log ...
detail = spark.sql("DESCRIBE DETAIL sales.order_events").first()
assert "carrier" in spark.table("sales.order_events").columns
assert detail.description == "One row per order event", detail
assert detail.properties["sales.owner"] == "orders-team", detail.properties
status = spark.table("sales.order_events").schema["status"]
assert status.metadata.get("comment") == "Latest order status", status.metadata
# ... and the catalog's record kept the columns, comments, and properties it
# was registered with.
stale = _recorded()
assert _column_comments() == {"order_id": None, "status": None}, _column_comments()
assert stale.get("comment") is None, stale.get("comment")
assert stale.get("properties") == registered.get("properties"), stale.get("properties")

# --8<-- [start:delta-api]
import json  # noqa: E402
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402

TABLES = (
    "http://localhost:8080/api/2.1/unity-catalog"
    "/delta/v1/catalogs/warehouse/schemas/sales/tables"
)


def load_table(name: str) -> dict:
    with urllib.request.urlopen(f"{TABLES}/{name}") as resp:
        return json.load(resp)["metadata"]


def update_table(name: str, requirements: list, updates: list) -> dict:
    body = json.dumps({"requirements": requirements, "updates": updates}).encode()
    request = urllib.request.Request(
        f"{TABLES}/{name}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as resp:
        return json.load(resp)["metadata"]
    # --8<-- [end:delta-api]


# --8<-- [start:sync-columns]
detail = spark.sql("DESCRIBE DETAIL sales.order_events").first()
metadata = load_table("order_events")
update_table(
    "order_events",
    requirements=[
        {"type": "assert-table-uuid", "uuid": metadata["table-uuid"]},
        {"type": "assert-etag", "etag": metadata["etag"]},
    ],
    updates=[
        {
            "action": "set-columns",
            "columns": spark.table("sales.order_events").schema.jsonValue(),
        },
        {"action": "set-table-comment", "comment": detail.description},
        {"action": "set-properties", "updates": detail.properties},
    ],
)
# --8<-- [end:sync-columns]
synced = _recorded()
assert [c["name"] for c in synced["columns"]] == ["order_id", "status", "carrier"], (
    synced["columns"]
)
assert _column_comments()["status"] == "Latest order status", _column_comments()
assert synced["comment"] == "One row per order event", synced.get("comment")
assert synced["properties"]["sales.owner"] == "orders-team", synced["properties"]
print("synced properties:", synced["properties"])

# An update with an etag from before the sync is a 409, and nothing applies.
try:
    update_table(
        "order_events",
        requirements=[
            {"type": "assert-table-uuid", "uuid": metadata["table-uuid"]},
            {"type": "assert-etag", "etag": metadata["etag"]},
        ],
        updates=[{"action": "set-table-comment", "comment": "overwritten"}],
    )
except urllib.error.HTTPError as error:
    assert error.code == 409, error.code
    assert json.load(error)["error"]["type"] == "UpdateRequirementConflictException"
else:
    raise AssertionError("a stale etag was accepted")
assert _recorded()["comment"] == "One row per order event"

spark.sql("DROP TABLE sales.order_events")
spark.sql("DROP SCHEMA sales")
spark.stop()
asyncio.run(_reset_catalog(create=False))
shutil.rmtree(EVENTS, ignore_errors=True)
