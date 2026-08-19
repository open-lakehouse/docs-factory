# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "unitycatalog-client>=0.5",
#   "duckdb>=1.5.4",
#   "deltalake>=0.20",
#   "pyarrow>=14",
# ]
#
# [tool.docs-factory]
# compose = "compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Seed the classic TPC-H dataset into Unity Catalog as governed Delta tables."""

import asyncio
import json
import os
import tempfile
from pathlib import Path

import duckdb
import pyarrow as pa
from deltalake import DeltaTable, write_deltalake

# --8<-- [start:imports]
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    CreateTable,
    SchemasApi,
    TablesApi,
)
from unitycatalog.client.exceptions import NotFoundException
from unitycatalog.client.models import (
    ColumnInfo,
    ColumnTypeName,
    DataSourceFormat,
    TableType,
)

# --8<-- [end:imports]

DEFAULT_URL = "http://localhost:8080/api/2.1/unity-catalog"

TPCH_TABLES = [
    "region",
    "nation",
    "supplier",
    "customer",
    "part",
    "partsupp",
    "orders",
    "lineitem",
]


def storage_root() -> Path:
    """Where the Delta tables are written.

    Honors ``TPCH_STORAGE_ROOT`` (set it for a stable location); otherwise a fresh temp
    directory, so the tutorial is safe to run anywhere without cleanup.
    """
    override = os.environ.get("TPCH_STORAGE_ROOT")
    root = Path(override) if override else Path(tempfile.mkdtemp(prefix="tpch-"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def generate_tpch(sf: float) -> dict[str, pa.Table]:
    """Generate the TPC-H tables in-process with DuckDB, as Arrow tables."""
    # --8<-- [start:generate]
    con = duckdb.connect()  # in-memory
    con.execute("INSTALL tpch; LOAD tpch;")
    con.execute(f"CALL dbgen(sf = {sf})")  # deterministic for a given scale factor
    tables = {name: con.table(name).to_arrow_table() for name in TPCH_TABLES}
    # --8<-- [end:generate]
    return tables


def write_delta(name: str, arrow: pa.Table, root: Path) -> str:
    """Write one Arrow table as a Delta table under ``root``; return its file URI."""
    # --8<-- [start:write-delta]
    location = root / name
    write_deltalake(location, arrow, mode="overwrite")
    # --8<-- [end:write-delta]
    return location.resolve().as_uri()  # file:///... — what we register with UC


# The Arrow types DuckDB emits for TPC-H, mapped to the Unity Catalog column type
# and the matching Delta primitive-type name. These differ: UC's ColumnTypeName is
# `INT`, but the Delta type_json.type must say `integer` (the server rejects `int`).
_ARROW_TO_UC: dict[str, tuple[ColumnTypeName, str]] = {
    "int8": (ColumnTypeName.BYTE, "byte"),
    "int16": (ColumnTypeName.SHORT, "short"),
    "int32": (ColumnTypeName.INT, "integer"),
    "int64": (ColumnTypeName.LONG, "long"),
    "float": (ColumnTypeName.FLOAT, "float"),
    "double": (ColumnTypeName.DOUBLE, "double"),
    "string": (ColumnTypeName.STRING, "string"),
    "large_string": (ColumnTypeName.STRING, "string"),
    "date32[day]": (ColumnTypeName.DATE, "date"),
}


def arrow_to_columns(schema: pa.Schema) -> list[ColumnInfo]:
    """Map an Arrow schema to the ColumnInfo list Unity Catalog needs.

    Decimals carry precision/scale; everything else looks up a fixed UC type. The
    ``type_json`` uses Delta primitive-type names (not the UC enum) and must
    include a ``metadata`` field — the server rejects a column without it.
    """
    columns: list[ColumnInfo] = []
    for position, field in enumerate(schema):
        if pa.types.is_decimal(field.type):
            uc_type = ColumnTypeName.DECIMAL
            delta_type = f"decimal({field.type.precision},{field.type.scale})"
        else:
            uc_type, delta_type = _ARROW_TO_UC[str(field.type)]
        type_json = json.dumps(
            {
                "name": field.name,
                "type": delta_type,
                "nullable": field.nullable,
                "metadata": {},
            }
        )
        columns.append(
            ColumnInfo(
                name=field.name,
                type_name=uc_type,
                type_text=delta_type,
                type_json=type_json,
                position=position,
                nullable=field.nullable,
            )
        )
    return columns


async def main(base_url: str = DEFAULT_URL, sf: float = 0.01) -> dict[str, object]:
    """Generate TPC-H, write it as Delta, register it in Unity Catalog.

    Returns a summary of what was created so the ``__main__`` footer can assert on
    it — running the whole flow to completion is this tutorial's test.
    """
    arrow_tables = generate_tpch(sf)
    root = storage_root()
    locations = {
        name: write_delta(name, arrow, root) for name, arrow in arrow_tables.items()
    }

    # --8<-- [start:connect]
    config = Configuration(host=base_url)
    async with ApiClient(config) as api:
        catalogs = CatalogsApi(api)
        schemas = SchemasApi(api)
        tables = TablesApi(api)
        # --8<-- [end:connect]

        # Start from a clean slate so the flow is safe to re-run.
        await _delete_tpch_catalog(catalogs)

        # --8<-- [start:register]
        await catalogs.create_catalog(
            CreateCatalog(name="samples", comment="TPC-H dataset")
        )
        await schemas.create_schema(CreateSchema(name="tpch", catalog_name="samples"))

        # Register each Delta table we wrote as an EXTERNAL table Unity Catalog
        # governs — UC stores the schema and location, the data stays in Delta.
        for name, arrow in arrow_tables.items():
            await tables.create_table(
                CreateTable(
                    name=name,
                    catalog_name="samples",
                    schema_name="tpch",
                    table_type=TableType.EXTERNAL,
                    data_source_format=DataSourceFormat.DELTA,
                    storage_location=locations[name],
                    columns=arrow_to_columns(arrow.schema),
                )
            )
            print(f"registered samples.tpch.{name}")
        # --8<-- [end:register]

        # --8<-- [start:verify]
        listed = await tables.list_tables(catalog_name="samples", schema_name="tpch")
        registered = sorted(t.name for t in listed.tables or [])
        print(f"{len(registered)} tables in samples.tpch: {registered}")

        # Read a table straight back from Delta to prove the data is really there.
        lineitem_rows = DeltaTable(locations["lineitem"]).to_pyarrow_table().num_rows
        print(f"lineitem has {lineitem_rows} rows")
        # --8<-- [end:verify]

    return {
        "schema": "samples.tpch",
        "tables": registered,
        "region_rows": arrow_tables["region"].num_rows,
        "nation_rows": arrow_tables["nation"].num_rows,
        "lineitem_rows": lineitem_rows,
    }


async def _delete_tpch_catalog(catalogs: CatalogsApi) -> None:
    """Best-effort teardown so the flow can re-run against an existing server."""
    try:
        # force=True cascades through the schemas/tables a prior run left behind.
        await catalogs.delete_catalog(name="samples", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    summary = asyncio.run(main(os.environ.get("UC_BASE_URL", DEFAULT_URL)))
    assert len(summary["tables"]) == 8, summary
    assert summary["tables"] == sorted(TPCH_TABLES), summary
    assert summary["region_rows"] == 5, summary
    assert summary["nation_rows"] == 25, summary
    assert summary["lineitem_rows"] > 0, summary
