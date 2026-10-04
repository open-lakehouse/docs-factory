# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.6.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Create, inspect, update, and delete a catalog and a schema with the Python SDK.

docker compose up -d --wait   # from envs/unitycatalog
uv run snippets/catalogs.py
"""

import asyncio
import os

# --8<-- [start:connect]
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    SchemasApi,
    UpdateCatalog,
    UpdateSchema,
)
from unitycatalog.client.exceptions import BadRequestException, NotFoundException

config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
# --8<-- [end:connect]


async def main() -> None:
    async with ApiClient(config) as api:
        catalogs = CatalogsApi(api)
        schemas = SchemasApi(api)
        await _reset(catalogs)

        # --8<-- [start:create-catalog]
        catalog = await catalogs.create_catalog(
            CreateCatalog(
                name="retail",
                comment="Order and customer data for the retail team",
                properties={"owner_team": "retail-analytics"},
            )
        )
        print(catalog.name, catalog.properties)
        # --8<-- [end:create-catalog]
        assert catalog.properties == {"owner_team": "retail-analytics"}

        # --8<-- [start:view-catalogs]
        listed = await catalogs.list_catalogs()
        print([c.name for c in listed.catalogs or []])

        retail = await catalogs.get_catalog(name="retail")
        print(retail.comment, retail.created_at)
        # --8<-- [end:view-catalogs]
        assert "retail" in [c.name for c in listed.catalogs or []]

        # --8<-- [start:update-catalog]
        updated = await catalogs.update_catalog(
            name="retail",
            update_catalog=UpdateCatalog(
                comment="Curated retail data",
                properties={"owner_team": "retail-analytics", "tier": "gold"},
            ),
        )
        print(updated.comment, updated.properties)
        # --8<-- [end:update-catalog]
        assert updated.properties == {"owner_team": "retail-analytics", "tier": "gold"}

        # --8<-- [start:create-schema]
        schema = await schemas.create_schema(
            CreateSchema(
                name="staging",
                catalog_name="retail",
                comment="Raw order extracts",
            )
        )
        print(schema.full_name)  # retail.staging
        # --8<-- [end:create-schema]

        # --8<-- [start:view-schemas]
        listed_schemas = await schemas.list_schemas(catalog_name="retail")
        print([s.full_name for s in listed_schemas.schemas or []])

        staging = await schemas.get_schema(full_name="retail.staging")
        print(staging.comment)
        # --8<-- [end:view-schemas]

        # --8<-- [start:update-schema]
        renamed = await schemas.update_schema(
            full_name="retail.staging",
            update_schema=UpdateSchema(new_name="sales", comment="Cleaned order data"),
        )
        print(renamed.full_name)  # retail.sales
        # --8<-- [end:update-schema]
        assert renamed.full_name == "retail.sales"

        # --8<-- [start:delete-nonempty]
        try:
            await catalogs.delete_catalog(name="retail")
        except BadRequestException as exc:
            print(f"HTTP {exc.status}: catalog still contains schemas")
        # --8<-- [end:delete-nonempty]
        assert (await catalogs.get_catalog(name="retail")).name == "retail"

        # --8<-- [start:delete-inward]
        await schemas.delete_schema(full_name="retail.sales")
        await catalogs.delete_catalog(name="retail")
        # --8<-- [end:delete-inward]

        try:
            await catalogs.get_catalog(name="retail")
            raise AssertionError("catalog should be gone")
        except NotFoundException:
            pass

        await _check_force_delete(catalogs, schemas)


async def _check_force_delete(catalogs: CatalogsApi, schemas: SchemasApi) -> None:
    """The page states force=True removes a catalog with its contents."""
    await catalogs.create_catalog(CreateCatalog(name="retail"))
    await schemas.create_schema(CreateSchema(name="sales", catalog_name="retail"))
    # --8<-- [start:delete-force]
    await catalogs.delete_catalog(name="retail", force=True)
    # --8<-- [end:delete-force]
    names = [c.name for c in (await catalogs.list_catalogs()).catalogs or []]
    assert "retail" not in names, names


async def _reset(catalogs: CatalogsApi) -> None:
    try:
        await catalogs.delete_catalog(name="retail", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    asyncio.run(main())
