# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "unitycatalog-client==0.6.0",
#   "pyarrow>=18",
#   "polars==1.44.2",
#   "duckdb==1.5.4",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Register Parquet, CSV, and JSON files as external tables, read them, and drop them.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run file_formats.py
"""

import asyncio
import json
import os
import shutil
import sys
from pathlib import Path

# --8<-- [start:connect]
import pyarrow as pa
import pyarrow.csv
import pyarrow.parquet
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
FORMATS = ["parquet", "csv", "json"]


def write_sample() -> None:
    # --8<-- [start:write-sample]
    orders = pa.table(
        {
            "order_id": pa.array([1, 2, 3], pa.int64()),
            "customer": ["ada", "grace", "linus"],
            "amount": [9.5, 20.0, 3.25],
        }
    )
    for fmt in ["parquet", "csv", "json"]:
        (ROOT / f"orders_{fmt}").mkdir(parents=True, exist_ok=True)

    pa.parquet.write_table(orders, ROOT / "orders_parquet" / "part-0.parquet")
    pa.csv.write_csv(orders, ROOT / "orders_csv" / "part-0.csv")
    # JSON tables hold newline-delimited JSON: one object per line.
    with open(ROOT / "orders_json" / "part-0.json", "w") as f:
        for row in orders.to_pylist():
            f.write(json.dumps(row) + "\n")
    # --8<-- [end:write-sample]


# --8<-- [start:columns]
# Arrow type → (UC type name, SQL type text, type_json type). Extend as you need.
ARROW_TO_UC = {
    pa.int32(): (ColumnTypeName.INT, "int", "integer"),
    pa.int64(): (ColumnTypeName.LONG, "bigint", "long"),
    pa.float64(): (ColumnTypeName.DOUBLE, "double", "double"),
    pa.string(): (ColumnTypeName.STRING, "string", "string"),
    pa.bool_(): (ColumnTypeName.BOOLEAN, "boolean", "boolean"),
    pa.date32(): (ColumnTypeName.DATE, "date", "date"),
}


def columns_from_arrow(schema: pa.Schema) -> list[ColumnInfo]:
    columns = []
    for position, field in enumerate(schema):
        type_name, type_text, json_type = ARROW_TO_UC[field.type]
        type_json = {
            "name": field.name,
            "type": json_type,
            "nullable": field.nullable,
            "metadata": {},
        }
        columns.append(
            ColumnInfo(
                name=field.name,
                type_name=type_name,
                type_text=type_text,
                type_json=json.dumps(type_json),
                position=position,
                nullable=field.nullable,
            )
        )
    return columns


# --8<-- [end:columns]


async def main() -> None:
    _reset()
    write_sample()
    async with ApiClient(config) as api:
        tables = TablesApi(api)
        await _ensure_schema(api)

        # --8<-- [start:register]
        schema = pa.parquet.read_schema(ROOT / "orders_parquet" / "part-0.parquet")
        for fmt in ["parquet", "csv", "json"]:
            await tables.create_table(
                CreateTable(
                    name=f"orders_{fmt}",
                    catalog_name="retail",
                    schema_name="sales",
                    table_type=TableType.EXTERNAL,
                    data_source_format=DataSourceFormat(fmt.upper()),
                    storage_location=f"file://{ROOT}/orders_{fmt}",
                    columns=columns_from_arrow(schema),
                )
            )
        # --8<-- [end:register]

        # --8<-- [start:lookup]
        table = await tables.get_table(full_name="retail.sales.orders_csv")
        fmt = table.data_source_format.value.lower()  # "parquet", "csv", or "json"
        path = table.storage_location.removeprefix("file://")
        print(fmt, path, [c.name for c in table.columns or []])
        # --8<-- [end:lookup]
        assert (fmt, path) == ("csv", str(ROOT / "orders_csv"))

        for name in FORMATS:
            table = await tables.get_table(full_name=f"retail.sales.orders_{name}")
            fmt = table.data_source_format.value.lower()
            path = table.storage_location.removeprefix("file://")
            for read in [read_pyarrow, read_polars, read_duckdb]:
                rows = read(fmt, path)
                assert rows == 3, (read.__name__, fmt, rows)

        # --8<-- [start:drop]
        for fmt in ["parquet", "csv", "json"]:
            await tables.delete_table(full_name=f"retail.sales.orders_{fmt}")
        # --8<-- [end:drop]

    # Dropping an external table leaves its files in place.
    assert all((ROOT / f"orders_{fmt}" / f"part-0.{fmt}").exists() for fmt in FORMATS)


def read_pyarrow(fmt: str, path: str) -> int:
    # --8<-- [start:pyarrow]
    import pyarrow.dataset as ds

    data = ds.dataset(path, format=fmt).to_table()
    print(data)
    # --8<-- [end:pyarrow]
    return data.num_rows


def read_polars(fmt: str, path: str) -> int:
    # --8<-- [start:polars]
    import polars as pl

    scan = {"parquet": pl.scan_parquet, "csv": pl.scan_csv, "json": pl.scan_ndjson}
    data = scan[fmt](f"{path}/*.{fmt}").collect()
    print(data)
    # --8<-- [end:polars]
    return data.height


def read_duckdb(fmt: str, path: str) -> int:
    # --8<-- [start:duckdb]
    import duckdb

    data = duckdb.sql(f"SELECT * FROM read_{fmt}('{path}/*.{fmt}')")
    data.show()
    # --8<-- [end:duckdb]
    return len(data.fetchall())


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
    for fmt in FORMATS:
        shutil.rmtree(ROOT / f"orders_{fmt}", ignore_errors=True)
    ROOT.mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    asyncio.run(main())
    # pyarrow's thread pool can deadlock in interpreter shutdown on macOS; every
    # assert has passed by now, so skip the native teardown.
    sys.stdout.flush()
    os._exit(0)
