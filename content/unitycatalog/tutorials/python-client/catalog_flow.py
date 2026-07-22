# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client>=0.5"]
#
# [tool.docs-factory]
# compose = "docker-compose.uc.yml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Create a catalog, schema, and table with the official Unity Catalog Python SDK.

Run it directly against a Unity Catalog server (see the colocated tutorial):

    uv run catalog_flow.py                       # talks to http://localhost:8080
    UC_BASE_URL=http://host:8080/api/2.1/unity-catalog uv run catalog_flow.py

The docs page inlines the marked regions below; the whole file is one runnable
program our CI executes against a real server, so what you copy is what we test.
"""

import asyncio
import os

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


async def main(base_url: str = DEFAULT_URL) -> dict[str, str]:
    """Run the full catalog → schema → table flow; return the names created."""
    # --8<-- [start:connect]
    config = Configuration(host=base_url)
    async with ApiClient(config) as api:
        catalogs = CatalogsApi(api)
        schemas = SchemasApi(api)
        tables = TablesApi(api)
        # --8<-- [end:connect]

        # Start from a clean slate so the flow is safe to re-run.
        await _delete_demo_catalog(catalogs)

        # --8<-- [start:create-catalog]
        catalog = await catalogs.create_catalog(
            CreateCatalog(name="demo_catalog", comment="Created from the Python SDK")
        )
        print(f"created catalog: {catalog.name}")
        # --8<-- [end:create-catalog]

        # --8<-- [start:list-catalogs]
        listed = await catalogs.list_catalogs()
        for c in listed.catalogs or []:
            print(c.name)
        # --8<-- [end:list-catalogs]

        # --8<-- [start:create-schema]
        schema = await schemas.create_schema(
            CreateSchema(name="demo_schema", catalog_name="demo_catalog")
        )
        print(f"created schema: {schema.full_name}")  # demo_catalog.demo_schema
        # --8<-- [end:create-schema]

        # --8<-- [start:create-table]
        table = await tables.create_table(
            CreateTable(
                name="demo_table",
                catalog_name="demo_catalog",
                schema_name="demo_schema",
                table_type=TableType.EXTERNAL,
                data_source_format=DataSourceFormat.DELTA,
                storage_location="file:///tmp/uc-test/demo_table",
                columns=[
                    ColumnInfo(
                        name="id",
                        type_name=ColumnTypeName.LONG,
                        type_text="bigint",
                        type_json='{"name":"id","type":"long","nullable":false,"metadata":{}}',
                        position=0,
                        nullable=False,
                    )
                ],
            )
        )
        table_full_name = f"{table.catalog_name}.{table.schema_name}.{table.name}"
        print(f"created table: {table_full_name}")
        # --8<-- [end:create-table]

        # --8<-- [start:handle-error]
        try:
            await schemas.get_schema(full_name="demo_catalog.does_not_exist")
        except NotFoundException as exc:
            print(f"expected miss: HTTP {exc.status}")
        # --8<-- [end:handle-error]

        # --8<-- [start:cleanup]
        # Delete inner-to-outer: tables, then the schema, then the catalog.
        await tables.delete_table(full_name="demo_catalog.demo_schema.demo_table")
        await schemas.delete_schema(full_name="demo_catalog.demo_schema")
        await catalogs.delete_catalog(name="demo_catalog")
        # --8<-- [end:cleanup]

    return {
        "catalog": catalog.name,
        "schema": schema.full_name,
        "table": table_full_name,
    }


async def _delete_demo_catalog(catalogs: CatalogsApi) -> None:
    """Best-effort teardown so the flow can re-run against an existing server."""
    try:
        # force=True cascades through schemas/tables the demo may have left behind.
        await catalogs.delete_catalog(name="demo_catalog", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main(os.environ.get("UC_BASE_URL", DEFAULT_URL)))
