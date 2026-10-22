# /// script
# requires-python = "==3.12.*"
# dependencies = ["unitycatalog-ai==0.4.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""How a client's function cache behaves across a replace.

`UnitycatalogFunctionClient` caches the function it builds from a stored body,
keyed by the function's short name, the first time it runs it. Evidence for the
page's replace warning and the R01 rows. `client` is the reader's session, which
runs the function; `publisher` is another application that replaces it.
`clear-cache` is the one region.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run caching.py
"""

import asyncio
import os

from unitycatalog.ai.core.client import UnitycatalogFunctionClient
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    SchemasApi,
)
from unitycatalog.client.exceptions import NotFoundException

NAME = "tools.pricing.shipping_cost"


async def register(fc, catalog: str, schema: str, body: str, replace=False):
    return await fc.create_function_async(
        function_name=f"{catalog}.{schema}.shipping_cost",
        routine_definition=body,
        data_type="DOUBLE",
        full_data_type="DOUBLE",
        comment="Calculate the shipping cost of a parcel.",
        parameters=[
            {
                "name": "weight_kg",
                "type_name": "DOUBLE",
                "type_text": "DOUBLE",
                "type_json": '{"name": "weight_kg", "type": "double", '
                '"nullable": false, "metadata": {}}',
                "position": 0,
            }
        ],
        replace=replace,
    )


async def run(fc, name: str = NAME):
    result = await fc.execute_function_async(name, parameters={"weight_kg": 2.0})
    assert result.error is None, result
    return result.value


def new_client(config):
    return UnitycatalogFunctionClient(api_client=ApiClient(config))


async def main() -> None:
    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)
    publisher = new_client(config)
    others = []
    try:
        await _seed(api, ("tools", "pricing"), ("legacy", "pricing"))

        await register(publisher, "tools", "pricing", "return 4.5 * weight_kg")
        assert await run(publisher) == 9.0
        assert await run(client) == 9.0  # the session now caches this body

        # The publisher replaces the function; its own cache is cleared.
        await register(
            publisher, "tools", "pricing", "return 2.0 + 4.5 * weight_kg", replace=True
        )
        assert await run(publisher) == 11.0

        # The session keeps running the body it cached before the replace,
        # though the catalog returns the new one.
        stored = await client.get_function_async(NAME)
        assert stored.routine_definition == "return 2.0 + 4.5 * weight_kg"
        assert await run(client) == 9.0
        fresh = new_client(config)
        others.append(fresh)
        assert await run(fresh) == 11.0

        # --8<-- [start:clear-cache]
        client.clear_function_cache()
        # --8<-- [end:clear-cache]
        assert await run(client) == 11.0

        # The cache key is the short name: two functions called shipping_cost in
        # different catalogs collide in one client, which runs whichever it
        # cached first.
        await register(publisher, "legacy", "pricing", "return 100.0")
        collide = new_client(config)
        others.append(collide)
        assert await run(collide, NAME) == 11.0
        assert await run(collide, "legacy.pricing.shipping_cost") == 11.0
        assert {k for k in collide.func_cache if not k.startswith("__")} == {
            "shipping_cost"
        }, collide.func_cache.keys()
        separate = new_client(config)
        others.append(separate)
        assert await run(separate, "legacy.pricing.shipping_cost") == 100.0

        # A delete doesn't clear the cache, but a call looks the function up
        # first, so a cached function that was deleted fails like any other.
        await publisher.delete_function_async(NAME)
        assert "shipping_cost" in client.func_cache
        try:
            await run(client)
        except AttributeError as exc:
            assert str(exc) == "'NoneType' object has no attribute 'input_params'", exc
        else:
            raise AssertionError("a deleted function should fail in a caching client")

        for catalog in ("tools", "legacy"):
            await CatalogsApi(api).delete_catalog(name=catalog, force=True)
    finally:
        for fc in [publisher, *others]:
            await fc.close_async()
        await api.close()


async def _seed(api, *namespaces) -> None:
    catalogs = CatalogsApi(api)
    for catalog, schema in namespaces:
        try:
            await catalogs.delete_catalog(name=catalog, force=True)
        except NotFoundException:
            pass
        await catalogs.create_catalog(CreateCatalog(name=catalog))
        await SchemasApi(api).create_schema(
            CreateSchema(name=schema, catalog_name=catalog)
        )


if __name__ == "__main__":
    asyncio.run(main())
