# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "unitycatalog-client>=0.5",
#   "duckdb>=1.1",
#   "deltalake>=0.20",
#   "pyarrow>=14",
# ]
#
# [tool.docs-factory]
# compose = "compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Seed the classic TPC-H dataset into Unity Catalog as governed Delta tables.

The `orders` sample table is enough for a single-table walkthrough, but real
features — joins, governed access, lineage, federation — only get interesting
against data that looks like a business. TPC-H is the standard eight-table model
(customer, orders, lineitem, part, supplier, partsupp, nation, region), and this
script builds it end to end so later tutorials and blogs have a meaningful base:

    generate (DuckDB)  ->  write Delta (deltalake)  ->  register (Unity Catalog)

Run it directly against a Unity Catalog server (see the colocated tutorial):

    uv run seed_tpch.py                          # talks to http://localhost:8080
    UC_BASE_URL=http://host:8080/api/2.1/unity-catalog uv run seed_tpch.py

Unity Catalog doesn't ingest rows — it *governs* tables that live in object
storage. So we write each TPC-H table as a real Delta table under the server's
managed root, then register it as an EXTERNAL Delta table. The whole file is one
runnable program our CI executes against a real server, so what you copy is what
we test.
"""

import asyncio
import json
import os

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

# The SDK's default host already includes the /api/2.1/unity-catalog prefix.
DEFAULT_URL = "http://localhost:8080/api/2.1/unity-catalog"

# The eight tables the TPC-H schema is made of, small (region/nation) to large
# (lineitem). Their row counts scale with `sf` except region (5) and nation (25),
# which are fixed by the spec — a handy scale-invariant sanity check.
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

# The server's managed-table root (see server.properties). We write each Delta
# table under here so the UC container and the host agree on the path.
STORAGE_ROOT = "file:///tmp/uc-test/tpch"


def generate_tpch(sf: float) -> dict[str, pa.Table]:
    """Generate the TPC-H tables in-process with DuckDB, as Arrow tables."""
    # --8<-- [start:generate]
    con = duckdb.connect()  # in-memory
    con.execute("INSTALL tpch; LOAD tpch;")
    con.execute(f"CALL dbgen(sf = {sf})")  # deterministic for a given scale factor
    tables = {name: con.table(name).to_arrow_table() for name in TPCH_TABLES}
    # --8<-- [end:generate]
    return tables


def write_delta(name: str, arrow: pa.Table) -> str:
    """Write one Arrow table to the managed root as a Delta table; return its path."""
    # --8<-- [start:write-delta]
    location = f"{STORAGE_ROOT}/{name}"
    write_deltalake(location, arrow, mode="overwrite")
    # --8<-- [end:write-delta]
    return location


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
    locations = {name: write_delta(name, arrow) for name, arrow in arrow_tables.items()}

    # sf=0.01 -> "sf001"; a stable, filesystem-safe schema name per scale factor.
    schema_name = f"sf{int(sf * 100):03d}"

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
            CreateCatalog(name="tpch", comment="TPC-H benchmark dataset")
        )
        await schemas.create_schema(CreateSchema(name=schema_name, catalog_name="tpch"))

        # Register each Delta table we wrote as an EXTERNAL table Unity Catalog
        # governs — UC stores the schema and location, the data stays in Delta.
        for name, arrow in arrow_tables.items():
            await tables.create_table(
                CreateTable(
                    name=name,
                    catalog_name="tpch",
                    schema_name=schema_name,
                    table_type=TableType.EXTERNAL,
                    data_source_format=DataSourceFormat.DELTA,
                    storage_location=locations[name],
                    columns=arrow_to_columns(arrow.schema),
                )
            )
            print(f"registered tpch.{schema_name}.{name}")
        # --8<-- [end:register]

        # --8<-- [start:verify]
        listed = await tables.list_tables(catalog_name="tpch", schema_name=schema_name)
        registered = sorted(t.name for t in listed.tables or [])
        print(f"{len(registered)} tables in tpch.{schema_name}: {registered}")

        # Read a table straight back from Delta to prove the data is really there.
        lineitem_rows = DeltaTable(locations["lineitem"]).to_pyarrow_table().num_rows
        print(f"lineitem has {lineitem_rows} rows")
        # --8<-- [end:verify]

    return {
        "schema": f"tpch.{schema_name}",
        "tables": registered,
        "region_rows": arrow_tables["region"].num_rows,
        "nation_rows": arrow_tables["nation"].num_rows,
        "lineitem_rows": lineitem_rows,
    }


async def _delete_tpch_catalog(catalogs: CatalogsApi) -> None:
    """Best-effort teardown so the flow can re-run against an existing server."""
    try:
        # force=True cascades through the schemas/tables a prior run left behind.
        await catalogs.delete_catalog(name="tpch", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    # Running the script IS the test. region (5 rows) and nation (25 rows) are
    # fixed by the TPC-H spec regardless of scale factor, so these asserts —
    # outside the rendered regions, so readers never see them — turn a silent
    # regression into a non-zero exit the harness catches.
    summary = asyncio.run(main(os.environ.get("UC_BASE_URL", DEFAULT_URL)))
    assert len(summary["tables"]) == 8, summary
    assert summary["tables"] == sorted(TPCH_TABLES), summary
    assert summary["region_rows"] == 5, summary
    assert summary["nation_rows"] == 25, summary
    assert summary["lineitem_rows"] > 0, summary
