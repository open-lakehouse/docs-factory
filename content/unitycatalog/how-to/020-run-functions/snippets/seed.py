"""Register pricing.py's functions in tools.pricing, the state the page assumes.

The page's scripts import this; it isn't run on its own. Registering
functions is covered by Manage Python functions (H11).
"""

import logging

import pricing
from unitycatalog.ai.core.client import UnitycatalogFunctionClient
from unitycatalog.client import CatalogsApi, CreateCatalog, CreateSchema, SchemasApi
from unitycatalog.client.exceptions import NotFoundException

FUNCTIONS = [
    pricing.order_total,
    pricing.checked_total,
    pricing.slow_quote,
    pricing.busy_total,
    pricing.mean_price,
    pricing.payload_size,
    pricing.python_version,
    pricing.read_rates,
    pricing.process_id,
    pricing.thread_id,
    pricing.allocate,
    pricing.count_items,
]


async def register_all(api) -> None:
    """Recreate catalog `tools`, schema `pricing`, and every function in it."""
    catalogs = CatalogsApi(api)
    try:
        await catalogs.delete_catalog(name="tools", force=True)
    except NotFoundException:
        pass
    await catalogs.create_catalog(CreateCatalog(name="tools"))
    await SchemasApi(api).create_schema(
        CreateSchema(name="pricing", catalog_name="tools")
    )
    client = UnitycatalogFunctionClient(api_client=api)
    # Each create first looks the name up and logs the 404; that's expected.
    logger = logging.getLogger("unitycatalog.ai.core.client")
    level = logger.level
    logger.setLevel(logging.CRITICAL)
    try:
        for func in FUNCTIONS:
            await client.create_python_function_async(
                func=func, catalog="tools", schema="pricing"
            )
    finally:
        logger.setLevel(level)


async def drop_all(api) -> None:
    await CatalogsApi(api).delete_catalog(name="tools", force=True)
