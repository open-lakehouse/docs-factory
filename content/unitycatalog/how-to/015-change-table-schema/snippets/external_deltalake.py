# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "deltalake==1.6.6",
#   "pyarrow>=18",
#   "unitycatalog-client==0.7.0",
#   "duckdb==1.5.6",
#   "pyspark==4.1.0",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.delta-rs-python = [
#   { journey = "external.alter-schema", region = "alter-deltalake", api = "TableAlterer.add_columns", note = "sync through the Delta API" },
#   { journey = "external.set-properties", region = "alter-deltalake", api = "TableAlterer.set_table_properties, set_table_description", note = "sync through the Delta API" },
#   { journey = "managed.alter-schema", fails = "Max catalog version is required when loading a catalog-managed table", anchor = "choose-a-client" },
#   { journey = "managed.set-properties", fails = "Max catalog version is required when loading a catalog-managed table", anchor = "choose-a-client" },
#   { journey = "managed.rename", fails = "Max catalog version is required when loading a catalog-managed table", anchor = "choose-a-client" },
# ]
# claims.duckdb = [
#   { journey = "external.alter-schema", fails = "UCTableSet::AlterTable", anchor = "choose-a-client" },
#   { journey = "external.set-properties", fails = "Only altering tables is supported for now", anchor = "choose-a-client" },
# ]
# claims."delta:delta-rs-python" = [
#   { journey = "schema.add-column", region = "alter-deltalake", api = "TableAlterer.add_columns", note = "on an external Unity Catalog table" },
#   { journey = "feature.properties", region = "alter-deltalake", api = "TableAlterer.set_table_properties", note = "on an external Unity Catalog table" },
# ]
# ///
"""Change an external Delta table's columns, comment, and properties with
delta-rs, then bring the catalog's record in step through the Delta API.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run external_deltalake.py

The script also pins that delta-rs can't open a managed table and that DuckDB
can't alter an external one. Spark creates the managed table, which needs
Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
"""

import ast
import asyncio
import inspect
import json
import os
import re
import shutil
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path

import duckdb
from deltalake import DeltaTable as _DeltaTable
from deltalake.table import TableAlterer
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    SchemasApi,
    TablesApi,
)
from unitycatalog.client.exceptions import NotFoundException

HERE = Path(__file__).parent
UC_API = "http://localhost:8080/api/2.1/unity-catalog"
# The `register-events` region names this path for the reader; it's the
# environment's default UC_DOCS_ROOT.
DOCS_ROOT = "/tmp/uc-docs"
EVENTS = f"{DOCS_ROOT}/order_events"
REGION_RE = re.compile(r"# --8<-- \[start:([\w-]+)\]\n(.*?)# --8<-- \[end:\1\]", re.S)
# deltalake 1.6.6's whole TableAlterer: no method drops, renames, or retypes a
# column in place.
ALTERER_METHODS = {
    "add_columns",
    "add_constraint",
    "add_feature",
    "drop_column_not_null",
    "drop_constraint",
    "set_column_metadata",
    "set_table_description",
    "set_table_name",
    "set_table_properties",
}
TABLES = f"{UC_API}/delta/v1/catalogs/warehouse/schemas/sales/tables"


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
            await SchemasApi(api).create_schema(
                CreateSchema(name="sales", catalog_name="warehouse")
            )


def _regions(path: Path) -> dict[str, str]:
    return {n: textwrap.dedent(b) for n, b in REGION_RE.findall(path.read_text())}


async def _paste(namespace: dict, source: str) -> None:
    """Run a region as `python -m asyncio` runs a pasted block: statement by
    statement, top-level await allowed, in one shared namespace."""
    for statement in ast.parse(source).body:
        code = compile(
            ast.Module([statement], []),
            "<paste>",
            "exec",
            flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT,
        )
        result = eval(code, namespace)  # noqa: S307 - the page's own regions
        if inspect.iscoroutine(result):
            await result


async def _delete_events() -> None:
    async with ApiClient(Configuration(host=UC_API)) as api:
        try:
            await TablesApi(api).delete_table(full_name="warehouse.sales.order_events")
        except NotFoundException:
            pass
    shutil.rmtree(EVENTS, ignore_errors=True)


def _record(name: str = "order_events") -> dict:
    with urllib.request.urlopen(f"{UC_API}/tables/warehouse.sales.{name}") as resp:
        return json.load(resp)


def _columns() -> dict[str, str | None]:
    return {c["name"]: c.get("comment") for c in _record()["columns"]}


# The helpers from delta_api.py's `delta-api` region, which the page shows once.
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


def _create_managed_table() -> str:
    """Create warehouse.sales.orders as a catalog-managed table; return its location."""
    from pyspark.sql import SparkSession

    spark = (
        SparkSession.builder.appName("external-deltalake-seed")
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
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("ERROR")
    spark.sql(
        "CREATE TABLE warehouse.sales.orders (order_id BIGINT, customer STRING) "
        "USING DELTA"
    )
    spark.stop()
    return _record("orders")["storage_location"]


async def main() -> None:
    await _reset_catalog(create=True)
    shutil.rmtree(EVENTS, ignore_errors=True)

    # --8<-- [start:register-events]
    import pyarrow as pa
    from deltalake import write_deltalake
    from unitycatalog.client import ApiClient, Configuration, CreateTable, TablesApi
    from unitycatalog.client.models import (
        ColumnInfo,
        ColumnTypeName,
        DataSourceFormat,
        TableType,
    )

    location = "file:///tmp/uc-docs/order_events"
    events = pa.table(
        {
            "order_id": pa.array([1, 2], pa.int64()),
            "status": ["created", "shipped"],
        }
    )
    write_deltalake(location, events)

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    await TablesApi(api).create_table(
        CreateTable(
            name="order_events",
            catalog_name="warehouse",
            schema_name="sales",
            table_type=TableType.EXTERNAL,
            data_source_format=DataSourceFormat.DELTA,
            storage_location=location,
            columns=[
                ColumnInfo(
                    name="order_id",
                    type_name=ColumnTypeName.LONG,
                    type_text="bigint",
                    type_json='{"name": "order_id", "type": "long", "nullable": true, "metadata": {}}',
                    position=0,
                    nullable=True,
                ),
                ColumnInfo(
                    name="status",
                    type_name=ColumnTypeName.STRING,
                    type_text="string",
                    type_json='{"name": "status", "type": "string", "nullable": true, "metadata": {}}',
                    position=1,
                    nullable=True,
                ),
            ],
        )
    )
    # --8<-- [end:register-events]
    await api.close()
    registered = _record()
    assert [(c["name"], c["type_text"]) for c in registered["columns"]] == [
        ("order_id", "bigint"),
        ("status", "string"),
    ], registered["columns"]
    etag_registered = load_table("order_events")["etag"]

    # --8<-- [start:open-external]
    from deltalake import DeltaTable
    from unitycatalog.client import ApiClient, Configuration, TablesApi

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    table = await TablesApi(api).get_table(full_name="warehouse.sales.order_events")
    dt = DeltaTable(table.storage_location)
    # --8<-- [end:open-external]
    await api.close()
    assert table.table_type == TableType.EXTERNAL, table.table_type
    version_before = dt.version()

    # By default delta-rs accepts only the delta.* keys it knows.
    try:
        dt.alter.set_table_properties({"sales.owner": "orders-team"})
    except Exception as error:  # noqa: BLE001 - deltalake raises DeltaError
        assert "Error parsing property 'sales.owner':'orders-team'" in str(error), error
    else:
        raise AssertionError("a custom key is now accepted: update the page")
    assert DeltaTable(table.storage_location).version() == version_before

    # --8<-- [start:alter-deltalake]
    from deltalake import Field

    dt.alter.add_columns(Field("carrier", "string"))
    dt.alter.set_column_metadata("status", {"comment": "Latest order status"})
    dt.alter.set_table_description("One row per order event")
    dt.alter.set_table_properties(
        {"sales.owner": "orders-team"}, raise_if_not_exists=False
    )
    # --8<-- [end:alter-deltalake]

    # The Delta log has every change, one commit each.
    log = DeltaTable(table.storage_location)
    assert log.version() == version_before + 4, (version_before, log.version())
    fields = {f["name"]: f for f in json.loads(log.schema().to_json())["fields"]}
    assert "carrier" in fields, fields
    assert fields["status"]["metadata"] == {"comment": "Latest order status"}, fields
    assert log.metadata().description == "One row per order event"
    assert log.metadata().configuration["sales.owner"] == "orders-team"

    # Nothing else in deltalake changes a column in place: TableAlterer has no
    # drop, rename, or type change (drop_column_not_null only relaxes NOT NULL),
    # and neither has DeltaTable.
    assert set(m for m in dir(TableAlterer) if not m.startswith("_")) == (
        ALTERER_METHODS
    ), "TableAlterer changed: update the page's deltalake limits"
    for name in dir(_DeltaTable):
        assert not re.search(r"drop_col|rename|column_type|change_col", name), (
            f"DeltaTable.{name}: update the page's deltalake limits"
        )

    # A full overwrite with schema_mode="overwrite" can drop, rename, and retype
    # columns: one WRITE commit that rewrites every row. Pinned on a scratch path.
    scratch = f"file://{DOCS_ROOT}/schema_overwrite"
    shutil.rmtree(scratch.removeprefix("file://"), ignore_errors=True)
    write_deltalake(
        scratch,
        pa.table(
            {
                "order_id": pa.array([1], pa.int64()),
                "status": ["created"],
                "legacy_code": ["A"],
                "quantity": pa.array([1], pa.int32()),
            }
        ),
    )
    write_deltalake(
        scratch,
        pa.table(
            {
                "order_id": pa.array([1], pa.int64()),
                "state": ["created"],
                "quantity": pa.array([1], pa.int64()),
            }
        ),
        mode="overwrite",
        schema_mode="overwrite",
    )
    rewritten = _DeltaTable(scratch)
    assert rewritten.version() == 1, rewritten.version()
    assert [
        (f["name"], f["type"])
        for f in json.loads(rewritten.schema().to_json())["fields"]
    ] == [("order_id", "long"), ("state", "string"), ("quantity", "long")]
    assert rewritten.history(1)[0]["operation"] == "WRITE", rewritten.history(1)
    shutil.rmtree(scratch.removeprefix("file://"), ignore_errors=True)

    # The catalog's record kept all of it as registered: columns, column
    # comments, table comment, and properties.
    stale = _record()
    assert _columns() == {"order_id": None, "status": None}, _columns()
    assert stale.get("comment") is None, stale.get("comment")
    assert "sales.owner" not in (stale.get("properties") or {}), stale["properties"]
    assert stale.get("properties") == registered.get("properties"), stale
    assert load_table("order_events")["etag"] == etag_registered

    # --8<-- [start:sync-deltalake]
    dt = DeltaTable(table.storage_location)
    metadata = load_table("order_events")
    update_table(
        "order_events",
        requirements=[
            {"type": "assert-table-uuid", "uuid": metadata["table-uuid"]},
            {"type": "assert-etag", "etag": metadata["etag"]},
        ],
        updates=[
            {"action": "set-columns", "columns": json.loads(dt.schema().to_json())},
            {"action": "set-table-comment", "comment": dt.metadata().description},
            {"action": "set-properties", "updates": dt.metadata().configuration},
        ],
    )
    # --8<-- [end:sync-deltalake]

    synced = _record()
    assert [c["name"] for c in synced["columns"]] == [
        "order_id",
        "status",
        "carrier",
    ], synced["columns"]
    assert _columns()["status"] == "Latest order status", _columns()
    assert synced["comment"] == "One row per order event", synced
    assert synced["properties"]["sales.owner"] == "orders-team", synced["properties"]
    print("synced properties:", synced["properties"])
    assert load_table("order_events")["etag"] != metadata["etag"]

    # A stale etag (the one from before the sync) is a 409, and nothing applies.
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
        detail = json.load(error)["error"]
        assert detail["type"] == "UpdateRequirementConflictException", detail
    else:
        raise AssertionError("a stale etag was accepted")
    assert _record()["comment"] == "One row per order event"

    # delta-rs can't open a managed table, by its location or otherwise.
    managed_location = _create_managed_table()
    try:
        DeltaTable(managed_location)
    except Exception as error:  # noqa: BLE001 - deltalake raises DeltaError
        assert (
            "Max catalog version is required when loading a catalog-managed table"
            in str(error)
        ), error
    else:
        raise AssertionError("deltalake opened a managed table: update the page")

    # DuckDB attaches the catalog but can't alter an external table either.
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
    for statement, error_type, message in [
        (
            "ALTER TABLE warehouse.sales.order_events ADD COLUMN note VARCHAR",
            duckdb.NotImplementedException,
            "UCTableSet::AlterTable",
        ),
        (
            "ALTER TABLE warehouse.sales.order_events SET ('sales.owner' = 'orders-team')",
            duckdb.NotImplementedException,
            "UCTableSet::AlterTable",
        ),
        (
            "COMMENT ON TABLE warehouse.sales.order_events IS 'x'",
            duckdb.BinderException,
            "Only altering tables is supported for now",
        ),
    ]:
        try:
            con.execute(statement)
        except error_type as exc:
            print(type(exc).__name__, exc)
            assert message in str(exc), exc
            continue
        raise AssertionError(f"now supported, update the page: {statement}")
    con.close()

    # The reader's route in `python -m asyncio`: paste the page's regions in page
    # order on a freshly registered table, then check the record is in step.
    await _delete_events()
    regions = _regions(Path(__file__))
    helpers = _regions(HERE / "delta_api.py")["delta-api"]
    namespace: dict = {"__name__": "__main__"}
    await _paste(namespace, regions["register-events"])
    await _paste(namespace, regions["open-external"])
    await _paste(namespace, regions["alter-deltalake"])
    await _paste(namespace, helpers)
    await _paste(namespace, regions["sync-deltalake"])
    await namespace["api"].close()
    pasted = _record()
    assert [c["name"] for c in pasted["columns"]] == ["order_id", "status", "carrier"]
    assert pasted["columns"][1]["comment"] == "Latest order status", pasted["columns"]
    assert pasted["comment"] == "One row per order event", pasted.get("comment")
    assert pasted["properties"]["sales.owner"] == "orders-team", pasted["properties"]

    await _reset_catalog(create=False)
    shutil.rmtree(EVENTS, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
