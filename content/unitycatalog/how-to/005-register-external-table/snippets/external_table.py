# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0", "deltalake==1.6.6", "pyarrow>=18"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Register an existing Delta table in Unity Catalog, read it back, and drop it.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run external_table.py
"""

import asyncio
import json
import os
import shutil
import sys
from pathlib import Path

# --8<-- [start:connect]
import pyarrow as pa
from deltalake import DeltaTable, write_deltalake
from unitycatalog.client import ApiClient, Configuration, CreateTable, TablesApi
from unitycatalog.client.models import (
    ColumnInfo,
    ColumnTypeName,
    DataSourceFormat,
    TableType,
)

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
# --8<-- [end:connect]

ROOT = Path(os.environ.get("UC_DOCS_ROOT", "/tmp/uc-docs"))


def write_sample() -> str:
    # --8<-- [start:write-sample]
    location = f"file://{ROOT}/orders"
    orders = pa.table(
        {
            "order_id": pa.array([1, 2, 3], pa.int64()),
            "customer": ["ada", "grace", "linus"],
            "amount": [9.5, 20.0, 3.25],
        }
    )
    write_deltalake(location, orders)
    # --8<-- [end:write-sample]
    return location


# --8<-- [start:columns]
# Delta primitive type → (UC type name, SQL type text). Extend as your tables need.
DELTA_TO_UC = {
    "boolean": (ColumnTypeName.BOOLEAN, "boolean"),
    "integer": (ColumnTypeName.INT, "int"),
    "long": (ColumnTypeName.LONG, "bigint"),
    "double": (ColumnTypeName.DOUBLE, "double"),
    "string": (ColumnTypeName.STRING, "string"),
    "date": (ColumnTypeName.DATE, "date"),
    "timestamp": (ColumnTypeName.TIMESTAMP, "timestamp"),
}


def columns_from_delta(location: str) -> list[ColumnInfo]:
    fields = json.loads(DeltaTable(location).schema().to_json())["fields"]
    columns = []
    for position, field in enumerate(fields):
        type_name, type_text = DELTA_TO_UC[field["type"]]
        columns.append(
            ColumnInfo(
                name=field["name"],
                type_name=type_name,
                type_text=type_text,
                type_json=json.dumps(field),
                position=position,
                nullable=field["nullable"],
            )
        )
    return columns


# --8<-- [end:columns]


async def main() -> None:
    _reset()
    location = write_sample()
    async with ApiClient(config) as api:
        tables = TablesApi(api)
        await _ensure_schema(api)

        # --8<-- [start:register]
        table = await tables.create_table(
            CreateTable(
                name="orders",
                catalog_name="retail",
                schema_name="sales",
                table_type=TableType.EXTERNAL,
                data_source_format=DataSourceFormat.DELTA,
                storage_location=location,
                columns=columns_from_delta(location),
                comment="Orders exported by the order service",
            )
        )
        print(table.table_id, table.storage_location)
        # --8<-- [end:register]

        # --8<-- [start:view]
        orders = await tables.get_table(full_name="retail.sales.orders")
        print([(c.name, c.type_text) for c in orders.columns or []])

        listed = await tables.list_tables(catalog_name="retail", schema_name="sales")
        print([t.name for t in listed.tables or []])
        # --8<-- [end:view]
        assert [c.name for c in orders.columns or []] == [
            "order_id",
            "customer",
            "amount",
        ]

        # --8<-- [start:read]
        data = DeltaTable(orders.storage_location).to_pyarrow_table()
        print(data.num_rows, data.column_names)
        # --8<-- [end:read]
        assert data.num_rows == 3

        # --8<-- [start:drop]
        await tables.delete_table(full_name="retail.sales.orders")
        # --8<-- [end:drop]

    # Dropping an external table leaves its files in place.
    assert DeltaTable(location).to_pyarrow_table().num_rows == 3


async def _ensure_schema(api: ApiClient) -> None:
    from unitycatalog.client import CatalogsApi, CreateCatalog, CreateSchema, SchemasApi
    from unitycatalog.client.exceptions import NotFoundException

    catalogs = CatalogsApi(api)
    try:
        await catalogs.delete_catalog(name="retail", force=True)
    except NotFoundException:
        pass
    await catalogs.create_catalog(CreateCatalog(name="retail"))
    await SchemasApi(api).create_schema(
        CreateSchema(name="sales", catalog_name="retail")
    )


def _reset() -> None:
    shutil.rmtree(ROOT / "orders", ignore_errors=True)
    ROOT.mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    asyncio.run(main())
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
