"""Register the functions the page's scripts assume in tools.pricing.

The page's scripts import this; it isn't run on its own. Registering Python
functions is covered by Manage Python functions (H11).
"""

import logging

from unitycatalog.ai.core.client import UnitycatalogFunctionClient
from unitycatalog.client import (
    CatalogsApi,
    ColumnTypeName,
    CreateCatalog,
    CreateFunction,
    CreateFunctionRequest,
    CreateSchema,
    FunctionParameterInfo,
    FunctionParameterInfos,
    FunctionsApi,
    SchemasApi,
)
from unitycatalog.client.exceptions import NotFoundException


def order_total(quantity: int, unit_price: float, discount_pct: float = 0.0) -> float:
    """Calculate an order's total after a percentage discount.

    Args:
        quantity: Number of units ordered.
        unit_price: Price of one unit.
        discount_pct: Discount in percent, from 0 to 100.
    """
    return round(quantity * unit_price * (1 - discount_pct / 100), 2)


def process_id(tag: str) -> int:
    """Return the ID of the process the function runs in.

    Args:
        tag: Any text; the function ignores it.
    """
    import os

    return os.getpid()


def has_unitycatalog(tag: str) -> bool:
    """Report whether the unitycatalog package is importable where this runs.

    Args:
        tag: Any text; the function ignores it.
    """
    import importlib.util

    return importlib.util.find_spec("unitycatalog") is not None


async def register_all(api) -> None:
    """Recreate catalog `tools`, schema `pricing`, and the functions in it.

    `double_it` is a SQL-body function (routine_body SQL), the other kind the
    API stores.
    """
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
        for func in (order_total, process_id, has_unitycatalog):
            await client.create_python_function_async(
                func=func, catalog="tools", schema="pricing"
            )
    finally:
        logger.setLevel(level)
    await FunctionsApi(api).create_function(
        CreateFunctionRequest(
            function_info=CreateFunction(
                name="double_it",
                catalog_name="tools",
                schema_name="pricing",
                input_params=FunctionParameterInfos(
                    parameters=[
                        FunctionParameterInfo(
                            name="x",
                            type_text="int",
                            type_json='{"name":"x","type":"integer","nullable":true,"metadata":{}}',
                            type_name=ColumnTypeName.INT,
                            position=0,
                        )
                    ]
                ),
                data_type=ColumnTypeName.INT,
                full_data_type="int",
                routine_body="SQL",
                routine_definition="x * 2",
                parameter_style="S",
                is_deterministic=True,
                sql_data_access="NO_SQL",
                is_null_call=False,
                security_type="DEFINER",
                specific_name="double_it",
            )
        )
    )


async def replace_order_total(api) -> None:
    """Replace order_total's body from another client, as a colleague would."""
    client = UnitycatalogFunctionClient(api_client=api)

    def order_total(
        quantity: int, unit_price: float, discount_pct: float = 0.0
    ) -> float:
        """Calculate an order's total after a percentage discount, plus a fee of 1.

        Args:
            quantity: Number of units ordered.
            unit_price: Price of one unit.
            discount_pct: Discount in percent, from 0 to 100.
        """
        return round(quantity * unit_price * (1 - discount_pct / 100), 2) + 1

    await client.create_python_function_async(
        func=order_total, catalog="tools", schema="pricing", replace=True
    )


async def replace_order_total_as_text(api) -> None:
    """Replace order_total with a version that returns its total as text."""
    client = UnitycatalogFunctionClient(api_client=api)

    def order_total(quantity: int, unit_price: float, discount_pct: float = 0.0) -> str:
        """Format an order's total after a percentage discount.

        Args:
            quantity: Number of units ordered.
            unit_price: Price of one unit.
            discount_pct: Discount in percent, from 0 to 100.
        """
        return f"{quantity * unit_price * (1 - discount_pct / 100):.2f}"

    await client.create_python_function_async(
        func=order_total, catalog="tools", schema="pricing", replace=True
    )


async def delete_order_total(api) -> None:
    await UnitycatalogFunctionClient(api_client=api).delete_function_async(
        "tools.pricing.order_total"
    )


async def drop_all(api) -> None:
    await CatalogsApi(api).delete_catalog(name="tools", force=True)
