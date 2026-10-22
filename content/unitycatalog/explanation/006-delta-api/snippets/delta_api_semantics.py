# /// script
# requires-python = ">=3.11"
# dependencies = ["pyspark==4.1.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# ///
"""How the Unity Catalog Delta API behaves on the wire, with plain HTTP. It is
the verifier for E14 (explanation/006-delta-api), whose JSON excerpts are the
`.json` files beside it. The script sends the request files and checks that
each response file is a subset of the server's actual response. In a
response file, a value written `<like-this>` stands for any value.

It checks that:

- `/delta/v1/config` negotiates protocol `1.0` and lists the endpoints for the
  named catalog. `catalog` and `protocol-versions` are required.
- A staging table comes with the Delta protocol and properties the table must
  use, the ones the server suggests, and a credential for its location.
- `loadTable` returns the table's schema as a native Delta struct, and the
  `latest-table-version` and `commits` of a managed table move with each
  engine commit, schema changes included.
- A table update is requirements plus updates, applied all or nothing: a stale
  etag is a 409 that applies nothing, `assert-table-uuid` is required, and a
  request that breaks a rule applies none of its updates.
- A managed table accepts a metadata-only update that its Delta log never
  sees (a known gap).

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run delta_api_semantics.py

Spark creates and writes the tables. That needs Java 17 and Maven access on
first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import asyncio
import json
import os
import shutil
import urllib.error
import urllib.request
from pathlib import Path

from pyspark.sql import SparkSession
from unitycatalog.client import ApiClient, CatalogsApi, Configuration, CreateCatalog
from unitycatalog.client.exceptions import NotFoundException

UC_API = "http://localhost:8080/api/2.1/unity-catalog"
DELTA = f"{UC_API}/delta/v1"
TABLES = f"{DELTA}/catalogs/warehouse/schemas/sales/tables"
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
EVENTS = f"{DOCS_ROOT}/order_events"
HERE = Path(__file__).parent


def excerpt(name: str) -> object:
    """A JSON excerpt the page shows."""
    return json.loads((HERE / name).read_text())


def matches(shown: object, actual: object) -> bool:
    """Whether an excerpt is a subset of a response: objects by key, lists as
    an ordered subsequence, and `<placeholder>` strings as any value."""
    if isinstance(shown, str) and shown.startswith("<") and shown.endswith(">"):
        return actual is not None
    if isinstance(shown, dict):
        return isinstance(actual, dict) and all(
            key in actual and matches(value, actual[key])
            for key, value in shown.items()
        )
    if isinstance(shown, list):
        if not isinstance(actual, list):
            return False
        items = iter(actual)
        return all(any(matches(want, got) for got in items) for want in shown)
    return shown == actual


def assert_shown(name: str, actual: object) -> None:
    assert matches(excerpt(name), actual), (name, json.dumps(actual, indent=2))


def fill(body: object, **values: str) -> object:
    """A request excerpt with its `<placeholders>` filled in."""
    text = json.dumps(body)
    for key, value in values.items():
        text = text.replace(f"<{key}>", value)
    return json.loads(text)


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


def call(method: str, url: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def call_error(method: str, url: str, body: dict | None = None) -> tuple[int, dict]:
    try:
        call(method, url, body)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)
    raise AssertionError(f"accepted, update the page: {method} {url} {body}")


def _recorded(name: str) -> dict:
    return call("GET", f"{UC_API}/tables/warehouse.sales.{name}")


asyncio.run(_reset_catalog(create=True))
shutil.rmtree(EVENTS, ignore_errors=True)
spark = (
    SparkSession.builder.appName("delta-api-semantics")
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
spark.sql("CREATE TABLE sales.orders (order_id BIGINT, customer STRING) USING DELTA")

# An external table registered with its columns, as on the register page.
spark.createDataFrame(
    [(1, "created"), (2, "shipped")], "order_id BIGINT, status STRING"
).write.format("delta").save(f"file://{EVENTS}")
call(
    "POST",
    f"{UC_API}/tables",
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


# The helpers from H04's delta_api.py `delta-api` region.
def load_table(name: str) -> dict:
    with urllib.request.urlopen(f"{TABLES}/{name}") as resp:
        return json.load(resp)["metadata"]


def update_table(name: str, requirements: list, updates: list) -> dict:
    return call(
        "POST", f"{TABLES}/{name}", {"requirements": requirements, "updates": updates}
    )["metadata"]


# --- Config: protocol negotiation and the endpoint list ---------------------

config = call("GET", f"{DELTA}/config?catalog=warehouse&protocol-versions=1.0")
assert config["protocol-version"] == "1.0", config
# The server fills in the catalog's name; the other path segments stay templates.
assert (
    "POST /v1/catalogs/warehouse/schemas/{schema}/tables/{table}" in config["endpoints"]
), config["endpoints"]
assert_shown("config-response.json", config)
# The server ignores the versions the client offers and answers 1.0. The spec
# says it selects the highest mutually supported one; a 2.0-only client gets
# 1.0, not a 400. Flags the change when the server starts negotiating.
assert call("GET", f"{DELTA}/config?catalog=warehouse&protocol-versions=2.0") == config
code, body = call_error("GET", f"{DELTA}/config?protocol-versions=1.0")
assert (code, body["error"]["type"]) == (400, "InvalidParameterValueException"), body
assert "catalog" in body["error"]["message"], body
code, body = call_error("GET", f"{DELTA}/config?catalog=warehouse")
assert (code, body["error"]["type"]) == (400, "InvalidParameterValueException"), body
assert "protocol-versions" in body["error"]["message"], body
code, body = call_error("GET", f"{DELTA}/config?catalog=nope&protocol-versions=1.0")
assert (code, body["error"]["type"]) == (404, "NoSuchCatalogException"), body

# --- Staging: the server states the table's protocol up front ---------------

staged = call(
    "POST",
    f"{DELTA}/catalogs/warehouse/schemas/sales/staging-tables",
    {"name": "staged_orders"},
)
required = staged["required-protocol"]
assert required["min-reader-version"] >= 3, required
assert required["min-writer-version"] >= 7, required
assert {"catalogManaged", "vacuumProtocolCheck"} <= set(required["reader-features"])
assert {"catalogManaged", "inCommitTimestamp", "vacuumProtocolCheck"} <= set(
    required["writer-features"]
), required
assert staged["suggested-protocol"], staged
assert staged["required-properties"]["io.unitycatalog.tableId"] == staged["table-id"]
# Values the engine generates (column ids, row-tracking column names) come back
# as null: the server names the property and leaves the value to the engine.
suggested = staged["suggested-properties"]
assert suggested["delta.columnMapping.mode"] == "name", suggested
assert suggested["delta.columnMapping.maxColumnId"] is None, suggested
(credential,) = staged["storage-credentials"]
assert credential["prefix"] == staged["location"], credential
assert credential["operation"] == "READ_WRITE", credential
assert_shown("staging-response.json", staged)

# --- Wire schema: a native Delta struct ------------------------------------

loaded = call("GET", f"{TABLES}/orders")
assert loaded["metadata"]["columns"]["type"] == "struct", loaded["metadata"]["columns"]
assert_shown("columns-response.json", loaded)

# --- Commits: each engine commit moves the version by one -------------------

version = loaded["latest-table-version"]
spark.sql("INSERT INTO sales.orders VALUES (1, 'alice'), (2, 'bob')")
loaded = call("GET", f"{TABLES}/orders")
assert loaded["latest-table-version"] == version + 1, loaded["latest-table-version"]
commit = loaded["commits"][-1]
assert commit["version"] == version + 1, commit
assert {
    "version",
    "timestamp",
    "file-name",
    "file-size",
    "file-modification-timestamp",
} <= set(commit), commit
assert_shown("commits-response.json", loaded)

# A schema change is a commit like any other, and the catalog's schema moves
# with it.
version = loaded["latest-table-version"]
spark.sql("ALTER TABLE sales.orders ADD COLUMNS (amount DOUBLE)")
loaded = call("GET", f"{TABLES}/orders")
assert loaded["latest-table-version"] == version + 1, loaded["latest-table-version"]
fields = [f["name"] for f in loaded["metadata"]["columns"]["fields"]]
assert fields == ["order_id", "customer", "amount"], fields
assert [c["name"] for c in _recorded("orders")["columns"]] == fields

# --- Updates: requirements plus updates, all or nothing ---------------------

metadata = load_table("order_events")
request = excerpt("update-request.json")

# An etag from an earlier load is a 409 that names the conflict, and nothing
# is applied.
code, body = call_error(
    "POST",
    f"{TABLES}/order_events",
    fill(request, **{"table-uuid": metadata["table-uuid"], "etag": "stale-etag"}),
)
assert code == 409, code
assert body["error"]["type"] == "UpdateRequirementConflictException", body
assert "assert-etag failed" in body["error"]["message"], body
assert_shown("conflict-response.json", body)
assert load_table("order_events")["etag"] == metadata["etag"]
assert _recorded("order_events").get("comment") is None

# assert-table-uuid is required; a request without it is a 400.
code, body = call_error(
    "POST",
    f"{TABLES}/order_events",
    {
        "requirements": [{"type": "assert-etag", "etag": metadata["etag"]}],
        "updates": [{"action": "set-table-comment", "comment": "x"}],
    },
)
assert code == 400, code
assert "assert-table-uuid requirement is required" in body["error"]["message"], body


def _rejected(updates: list) -> tuple[int, str]:
    current = load_table("order_events")
    code, body = call_error(
        "POST",
        f"{TABLES}/order_events",
        {
            "requirements": [
                {"type": "assert-table-uuid", "uuid": current["table-uuid"]},
                {"type": "assert-etag", "etag": current["etag"]},
            ],
            "updates": updates,
        },
    )
    return code, body["error"]["message"]


# A request that fails a check applies none of its updates, including the valid ones.
etag_before = load_table("order_events")["etag"]
code, message = _rejected(
    [
        {"action": "set-table-comment", "comment": "One row per order"},
        {"action": "set-properties", "updates": {"sales.a": "1"}},
        {"action": "set-properties", "updates": {"sales.b": "2"}},
    ]
)
assert (code, message) == (400, "At most one set-properties is allowed per request."), (
    code,
    message,
)
code, message = _rejected(
    [
        {"action": "set-properties", "updates": {"sales.a": "1"}},
        {"action": "remove-properties", "removals": ["sales.a"]},
    ]
)
assert code == 400, code
assert "set-properties and remove-properties overlap on keys: [sales.a]" in message, (
    message
)
recorded = _recorded("order_events")
assert recorded.get("comment") is None, recorded.get("comment")
assert not {"sales.a", "sales.b"} & set(recorded.get("properties") or {}), recorded
assert load_table("order_events")["etag"] == etag_before

# With the current uuid and etag the same request applies, all of it, and
# the etag moves.
updated = update_table(
    "order_events",
    **fill(request, **{"table-uuid": metadata["table-uuid"], "etag": etag_before}),
)
assert updated["etag"] != etag_before, updated
assert updated["properties"]["sales.owner"] == "orders-team", updated
recorded = _recorded("order_events")
assert recorded["comment"] == "One row per order", recorded
assert recorded["properties"]["sales.owner"] == "orders-team", recorded

# Known gap: the server accepts a properties-only update to a managed table
# with no Delta commit, so the catalog's record and the Delta log disagree.
# The page tells client authors not to rely on this; the assert flags the fix.
version_before = call("GET", f"{TABLES}/orders")["latest-table-version"]
current = load_table("orders")
update_table(
    "orders",
    requirements=[
        {"type": "assert-table-uuid", "uuid": current["table-uuid"]},
        {"type": "assert-etag", "etag": current["etag"]},
    ],
    updates=[
        {
            "action": "set-properties",
            "updates": {"delta.enableDeletionVectors": "false"},
        }
    ],
)
loaded = call("GET", f"{TABLES}/orders")
assert loaded["latest-table-version"] == version_before, loaded["latest-table-version"]
assert loaded["metadata"]["properties"]["delta.enableDeletionVectors"] == "false"
spark.sql("REFRESH TABLE sales.orders")
delta_log = dict(spark.sql("SHOW TBLPROPERTIES sales.orders").collect())
assert delta_log["delta.enableDeletionVectors"] == "true", delta_log

spark.sql("DROP TABLE sales.orders")
spark.sql("DROP TABLE sales.order_events")
spark.sql("DROP SCHEMA sales")
spark.stop()
asyncio.run(_reset_catalog(create=False))
shutil.rmtree(EVENTS, ignore_errors=True)
