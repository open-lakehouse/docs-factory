# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Create a catalog, schema, and table with the Unity Catalog Python client.

The regions are what a reader types into `python -m asyncio`, step by step.

docker compose up -d --wait   # from envs/unitycatalog
uv run snippets/catalog_flow.py
"""

import asyncio
import os

from unitycatalog.client.exceptions import NotFoundException


async def main() -> None:
    # --8<-- [start:connect]
    from unitycatalog.client import (
        ApiClient,
        CatalogsApi,
        Configuration,
        SchemasApi,
        TablesApi,
    )

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    catalogs = CatalogsApi(api)
    schemas = SchemasApi(api)
    tables = TablesApi(api)
    # --8<-- [end:connect]
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    try:
        await _reset(catalogs)

        # --8<-- [start:create-catalog]
        from unitycatalog.client import CreateCatalog

        catalog = await catalogs.create_catalog(
            CreateCatalog(name="quickstart", comment="Created from Python")
        )
        print(catalog.name, catalog.id)
        # --8<-- [end:create-catalog]
        assert catalog.name == "quickstart"

        # --8<-- [start:list-catalogs]
        listed = await catalogs.list_catalogs()
        print([c.name for c in listed.catalogs])
        # --8<-- [end:list-catalogs]
        assert "quickstart" in [c.name for c in listed.catalogs]

        # --8<-- [start:create-schema]
        from unitycatalog.client import CreateSchema

        schema = await schemas.create_schema(
            CreateSchema(name="sales", catalog_name="quickstart")
        )
        print(schema.full_name)  # quickstart.sales
        # --8<-- [end:create-schema]
        assert schema.full_name == "quickstart.sales"

        # --8<-- [start:create-table]
        from unitycatalog.client import CreateTable
        from unitycatalog.client.models import (
            ColumnInfo,
            ColumnTypeName,
            DataSourceFormat,
            TableType,
        )

        table = await tables.create_table(
            CreateTable(
                name="orders",
                catalog_name="quickstart",
                schema_name="sales",
                table_type=TableType.EXTERNAL,
                data_source_format=DataSourceFormat.DELTA,
                storage_location="file:///tmp/uc-docs/quickstart/orders",
                columns=[
                    ColumnInfo(
                        name="order_id",
                        type_name=ColumnTypeName.LONG,
                        type_text="bigint",
                        type_json='{"name":"order_id","type":"long","nullable":false,"metadata":{}}',
                        position=0,
                        nullable=False,
                    )
                ],
            )
        )
        print(table.catalog_name, table.schema_name, table.name, table.table_type)
        # --8<-- [end:create-table]
        assert table.table_type == TableType.EXTERNAL

        # --8<-- [start:handle-error]
        from unitycatalog.client.exceptions import NotFoundException

        try:
            await tables.get_table(full_name="quickstart.sales.returns")
        except NotFoundException as exc:
            print("not found:", exc.status)  # not found: 404
        # --8<-- [end:handle-error]
        else:
            raise AssertionError("a missing table should raise NotFoundException")

        # --8<-- [start:cleanup]
        await tables.delete_table(full_name="quickstart.sales.orders")
        await schemas.delete_schema(full_name="quickstart.sales")
        await catalogs.delete_catalog(name="quickstart")
        await api.close()
        # --8<-- [end:cleanup]
    finally:
        await api.close()


async def _reset(catalogs) -> None:
    try:
        await catalogs.delete_catalog(name="quickstart", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())
