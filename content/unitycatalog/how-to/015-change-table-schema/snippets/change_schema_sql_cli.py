# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "docsnip",
#   "unitycatalog-client==0.7.0",
#   "deltalake==1.6.6",
#   "pyarrow>=18",
# ]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# lane = "spark"
# verifies = "change_schema.sql"
# claims.spark-sql = [
#   { journey = "managed.alter-schema", region = "add-columns", api = "ALTER TABLE … ADD COLUMNS" },
#   { journey = "managed.set-properties", region = "properties", api = "SET TBLPROPERTIES" },
#   { journey = "managed.rename", fails = "ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet", anchor = "rename-a-table-or-column" },
#   { journey = "external.alter-schema", region = "external-alter", api = "ALTER TABLE … ADD COLUMNS", note = "sync through the Delta API" },
#   { journey = "external.set-properties", region = "external-alter", api = "SET TBLPROPERTIES, COMMENT ON TABLE", note = "sync through the Delta API" },
# ]
# claims."delta:spark-sql" = [
#   { journey = "schema.add-column", region = "add-columns", api = "ALTER TABLE ADD COLUMNS", note = "through Unity Catalog" },
#   { journey = "schema.rename-drop", region = "drop-column", api = "DROP COLUMN", note = "through Unity Catalog; RENAME COLUMN is rejected" },
#   { journey = "schema.type-widening", region = "widen-type", api = "ALTER COLUMN … TYPE", note = "through Unity Catalog" },
#   { journey = "feature.properties", region = "properties", api = "SET TBLPROPERTIES", note = "through Unity Catalog" },
# ]
# ///
"""Enter change_schema.sql in the spark-sql shell that spark_sql.sh starts, and
check what Unity Catalog records after each part: the managed table's changes,
the copy-and-drop rename, and an external table whose record stays stale until
it's synced through the Delta API.

The shell prints a failed statement's error and carries on, so every region's
effect is checked against the server, and any unexpected error fails the run.
Needs Java 17 and Maven access on first run; behind a Maven mirror, set
DOCS_FACTORY_MAVEN_MIRROR (the harness points Spark at it).
"""

import asyncio
import json
import os
import shutil
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import pyarrow as pa
from deltalake import DeltaTable, write_deltalake
from docsnip import shellregions, sqlregions
from unitycatalog.client import ApiClient, CatalogsApi, Configuration, CreateCatalog
from unitycatalog.client.exceptions import NotFoundException

HERE = Path(__file__).parent
SQL = HERE / "change_schema.sql"
SHELL = HERE / "spark_sql.sh"
UC_API = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
DOCS_ROOT = os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs")
EVENTS = f"{DOCS_ROOT}/order_events"
TABLES = f"{UC_API}/delta/v1/catalogs/warehouse/schemas/sales/tables"
ERROR_MARKERS = ("SQLSTATE", "Exception", "Error in query")


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


def _request(method: str, path: str, body: dict | None = None) -> dict | None:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{UC_API}/{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def _table(name: str) -> dict | None:
    return _request("GET", f"tables/warehouse.sales.{name}")


def _spark_sql(*regions: str, extra: str = "") -> str:
    # spark-sql writes metastore_db/ and derby.log where it starts; keep them out
    # of the repo.
    with tempfile.TemporaryDirectory() as cwd:
        return shellregions.run(
            SHELL,
            "launch",
            cwd=Path(cwd),
            input=extra + sqlregions.text(SQL, *regions),
        )


def _errors(out: str) -> list[str]:
    """Lines that report a failed statement; Spark's own WARN log lines aside."""
    return [
        line
        for line in out.splitlines()
        if any(marker in line for marker in ERROR_MARKERS) and " WARN " not in line
    ]


def _register_events() -> None:
    """An external table registered with its columns, as on the register page."""
    write_deltalake(
        f"file://{EVENTS}",
        pa.table(
            {"order_id": pa.array([1, 2], pa.int64()), "status": ["created", "shipped"]}
        ),
    )
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
                        {"name": name, "type": delta, "nullable": True, "metadata": {}}
                    ),
                    "position": position,
                    "nullable": True,
                }
                for position, (name, type_name, type_text, delta) in enumerate(
                    [
                        ("order_id", "LONG", "bigint", "long"),
                        ("status", "STRING", "string", "string"),
                    ]
                )
            ],
        },
    )


def _post(name: str, requirements: list, updates: list) -> dict:
    body = json.dumps({"requirements": requirements, "updates": updates}).encode()
    req = urllib.request.Request(
        f"{TABLES}/{name}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)["metadata"]


if __name__ == "__main__":
    asyncio.run(_reset_catalog(create=True))
    shutil.rmtree(EVENTS, ignore_errors=True)

    # Part 1: the managed table's changes, in page order.
    out = _spark_sql(
        "create-table",
        "add-columns",
        "check-column-mapping",
        "drop-column",
        "widen-type",
        "properties",
        "history",
    )
    assert not _errors(out), out
    assert "delta.columnMapping.mode\tname" in out, out
    assert "sales.owner\torders-team" in out, out
    history = sorted(
        (int(fields[0]), fields[4])
        for fields in (line.split("\t") for line in out.splitlines())
        if len(fields) > 4 and fields[0].isdigit()
    )
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

    orders = _table("orders")
    assert orders["comment"] == "One row per customer order", orders.get("comment")
    columns = {c["name"]: c for c in orders["columns"]}
    assert list(columns) == ["order_id", "customer", "amount", "quantity", "channel"]
    assert columns["channel"]["comment"] == "Where the order was placed", columns
    assert columns["amount"]["comment"] == "Order total in EUR", columns
    assert columns["quantity"]["type_text"] == "bigint", columns["quantity"]
    assert orders["properties"]["sales.owner"] == "orders-team", orders["properties"]
    assert "sales.tier" not in orders["properties"], orders["properties"]
    # Each statement was a catalog-accepted commit: versions 1 through 9.
    assert orders["properties"]["delta.lastUpdateVersion"] == "9", orders["properties"]

    # Part 2: the connector rejects renames; the copy-and-drop works. Then an
    # external table's Delta log changes and the catalog's record doesn't.
    _register_events()
    registered = _table("order_events")
    out = _spark_sql(
        "rename-table",
        "external-alter",
        extra=(
            "ALTER TABLE sales.orders RENAME COLUMN customer TO buyer;\n"
            "ALTER TABLE sales.orders RENAME TO sales.renamed_orders;\n"
        ),
    )
    assert (
        "ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet" in out
    ), out
    assert "Renaming a table is not supported yet" in out, out
    # The two rejections are the only failed statements.
    unexpected = [
        line
        for line in _errors(out)
        if not line.startswith("\t")
        and "RENAME COLUMN is not supported" not in line
        and "Renaming a table is not supported yet" not in line
    ]
    assert not unexpected, unexpected
    assert _table("renamed_orders") is None
    assert _table("orders") is None
    renamed = _table("customer_orders")
    assert renamed is not None
    assert renamed.get("comment") is None, renamed.get("comment")
    assert "sales.owner" not in renamed["properties"], renamed["properties"]
    assert [c["name"] for c in renamed["columns"]] == [
        "order_id",
        "customer",
        "amount",
        "quantity",
        "channel",
    ]

    log = DeltaTable(f"file://{EVENTS}")
    fields = {f["name"]: f for f in json.loads(log.schema().to_json())["fields"]}
    assert "carrier" in fields, fields
    assert fields["status"]["metadata"].get("comment") == "Latest order status", fields
    assert log.metadata().description == "One row per order event"
    assert log.metadata().configuration["sales.owner"] == "orders-team"
    stale = _table("order_events")
    assert [c["name"] for c in stale["columns"]] == ["order_id", "status"], stale
    assert all(c.get("comment") is None for c in stale["columns"]), stale["columns"]
    assert stale.get("comment") is None, stale.get("comment")
    assert stale.get("properties") == registered.get("properties"), stale

    # The Delta API sync from the page's Python section brings it in step.
    metadata = json.load(urllib.request.urlopen(f"{TABLES}/order_events"))["metadata"]
    _post(
        "order_events",
        requirements=[
            {"type": "assert-table-uuid", "uuid": metadata["table-uuid"]},
            {"type": "assert-etag", "etag": metadata["etag"]},
        ],
        updates=[
            {"action": "set-columns", "columns": json.loads(log.schema().to_json())},
            {"action": "set-table-comment", "comment": log.metadata().description},
            {"action": "set-properties", "updates": log.metadata().configuration},
        ],
    )
    synced = _table("order_events")
    assert [c["name"] for c in synced["columns"]] == ["order_id", "status", "carrier"]
    assert synced["columns"][1]["comment"] == "Latest order status", synced["columns"]
    assert synced["comment"] == "One row per order event", synced.get("comment")
    assert synced["properties"]["sales.owner"] == "orders-team", synced["properties"]

    asyncio.run(_reset_catalog(create=False))
    shutil.rmtree(EVENTS, ignore_errors=True)
