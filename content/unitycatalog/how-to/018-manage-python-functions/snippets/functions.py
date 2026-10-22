# /// script
# requires-python = "==3.12.*"
# dependencies = ["unitycatalog-ai==0.4.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The sandbox caps its child's address space at EXECUTOR_MAX_MEMORY_LIMIT MB
# # (default 100), which Linux enforces; see T05's first_function.py.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# claims."unitycatalog-ai" = [
#   { journey = "function.create", region = "register", api = "create_python_function_async" },
#   { journey = "function.create-wrapped", region = "wrap-helpers", api = "create_wrapped_function_async" },
#   { journey = "function.describe", region = "view", api = "get_function_async" },
#   { journey = "function.list", region = "list", api = "list_functions_async" },
#   { journey = "function.get-source", region = "get-source", api = "get_function_source" },
#   { journey = "function.replace", region = "replace", api = "create_python_function_async(replace=True)" },
#   { journey = "function.delete", region = "delete", api = "delete_function_async" },
# ]
# ///
"""Register, view, replace, and delete Python functions in Unity Catalog.

The regions are what a reader types into `python -m asyncio`, in a folder
holding pricing.py. The script copies pricing.py into a scratch folder so the
replace step can edit it the way the reader does.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run functions.py
"""

import asyncio
import os
import shutil
import sys
import tempfile
from pathlib import Path

from unitycatalog.client import CatalogsApi, CreateCatalog, CreateSchema, SchemasApi
from unitycatalog.client.exceptions import NotFoundException

HERE = Path(__file__).resolve().parent
NAME = "tools.pricing.shipping_cost"

# The reader's folder: pricing.py, which the replace step edits in place.
WORKDIR = Path(tempfile.mkdtemp(prefix="h11-"))
shutil.copy(HERE / "pricing.py", WORKDIR / "pricing.py")
sys.path.insert(0, str(WORKDIR))
sys.dont_write_bytecode = True


async def main() -> None:
    # --8<-- [start:connect]
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)
    # --8<-- [end:connect]
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    try:
        await _seed(api)

        # --8<-- [start:import-module]
        import pricing
        # --8<-- [end:import-module]

        # --8<-- [start:register]
        info = await client.create_python_function_async(
            func=pricing.shipping_cost,
            catalog="tools",
            schema="pricing",
        )
        print(info.full_name)  # tools.pricing.shipping_cost
        # --8<-- [end:register]
        assert info.full_name == NAME
        first_id = info.function_id
        # Only the body is stored, so the import inside it travels with it.
        assert info.routine_definition == (
            "import math\n\nrate = 9.0 if express else 4.5\n"
            "return rate * math.ceil(weight_kg)"
        ), info.routine_definition
        assert info.comment == "Calculate the shipping cost of a parcel."
        params = info.input_params.parameters
        assert [(p.name, p.type_text, p.parameter_default) for p in params] == [
            ("weight_kg", "DOUBLE", None),
            ("express", "BOOLEAN", "False"),
        ], params
        assert params[0].comment == (
            "Parcel weight in kilograms, billed per started kilogram."
        )
        result = await client.execute_function_async(
            NAME, parameters={"weight_kg": 2.5}
        )
        assert result.value == 13.5, result

        # A helper the body calls isn't stored with a plain registration.
        plain = await client.create_python_function_async(
            func=pricing.order_total, catalog="tools", schema="pricing"
        )
        assert "def apply_discount" not in plain.routine_definition
        call = {"quantity": 3, "unit_price": 20.0, "discount_pct": 10.0}
        broken = await client.execute_function_async(
            "tools.pricing.order_total", parameters=call
        )
        # The sandbox returns the NameError's traceback as the error (on 3.12;
        # on 3.13 it's the no-output notice, H13's error_py313.py).
        assert broken.value is None and broken.error.endswith(
            "NameError: name 'apply_discount' is not defined\n"
        ), broken
        local = UnitycatalogFunctionClient(api_client=api, execution_mode="local")
        broken = await local.execute_function_async(
            "tools.pricing.order_total", parameters=call
        )
        assert broken.error == "name 'apply_discount' is not defined", broken
        await client.delete_function_async("tools.pricing.order_total")
        client.clear_function_cache()

        # --8<-- [start:wrap-helpers]
        info = await client.create_wrapped_function_async(
            primary_func=pricing.order_total,
            functions=[pricing.apply_discount],
            catalog="tools",
            schema="pricing",
        )
        print(info.routine_definition)
        # --8<-- [end:wrap-helpers]
        assert info.full_name == "tools.pricing.order_total"
        assert info.routine_definition == (
            "def apply_discount(amount, discount_pct):\n"
            "    return amount * (1 - discount_pct / 100)\n"
            "\n"
            "return round(apply_discount(quantity * unit_price, discount_pct), 2)"
        ), info.routine_definition
        # The wrapped function's own docstring and signature are what's stored.
        assert info.comment == "Calculate an order's total after a percentage discount."
        wrapped = [
            (p.name, p.type_text, p.parameter_default, p.comment)
            for p in info.input_params.parameters
        ]
        assert wrapped == [
            ("quantity", "LONG", None, "Number of units ordered."),
            ("unit_price", "DOUBLE", None, "Price of one unit."),
            ("discount_pct", "DOUBLE", "0.0", "Discount in percent, from 0 to 100."),
        ], wrapped
        assert info.full_data_type == "DOUBLE", info.full_data_type
        result = await client.execute_function_async(
            "tools.pricing.order_total",
            parameters={"quantity": 3, "unit_price": 20.0, "discount_pct": 10.0},
        )
        assert result.error is None and result.value == 54.0, result

        # --8<-- [start:view]
        fn = await client.get_function_async("tools.pricing.shipping_cost")
        print(fn.comment)
        for param in fn.input_params.parameters:
            print(param.name, param.type_text, param.parameter_default, param.comment)
        print("returns:", fn.full_data_type)
        # --8<-- [end:view]
        assert fn.full_data_type == "DOUBLE" and fn.external_language == "PYTHON"
        assert fn.function_id == first_id

        # --8<-- [start:list]
        functions = await client.list_functions_async(catalog="tools", schema="pricing")
        print(sorted(f.name for f in functions))
        # --8<-- [end:list]
        assert sorted(f.name for f in functions) == ["order_total", "shipping_cost"]

        # --8<-- [start:get-source]
        print(client.get_function_source("tools.pricing.shipping_cost"))
        # --8<-- [end:get-source]
        source = client.get_function_source(NAME)
        # Rebuilt from the stored record: the docstring is regenerated with a
        # Returns: section, and the parameter defaults are left out.
        assert source == (
            "def shipping_cost(weight_kg: float, express: bool) -> float:\n"
            '    """\n'
            "    Calculate the shipping cost of a parcel.\n"
            "    \n"
            "    Args:\n"
            "        weight_kg: Parcel weight in kilograms, billed per started kilogram.\n"
            "        express: Ship with next-day delivery.\n"
            "    \n"
            "    Returns:\n"
            "        float\n"
            '    """\n'
            "    import math\n"
            "\n"
            "    rate = 9.0 if express else 4.5\n"
            "    return rate * math.ceil(weight_kg)\n"
        ), repr(source)

        # --8<-- [start:as-callable]
        shipping_cost = client.get_function_as_callable("tools.pricing.shipping_cost")
        print(shipping_cost(2.5, express=True))  # 27.0
        # --8<-- [end:as-callable]
        assert shipping_cost(2.5, express=True) == 27.0
        # The default isn't part of the rebuilt signature.
        try:
            shipping_cost(2.5)
        except TypeError as exc:
            assert "express" in str(exc), exc
        else:
            raise AssertionError("the rebuilt callable should have no default")

        # --8<-- [start:name-conflict]
        try:
            await client.create_python_function_async(
                func=pricing.shipping_cost, catalog="tools", schema="pricing"
            )
        except ValueError as exc:
            print(exc)  # Function tools.pricing.shipping_cost already exists. ...
            # --8<-- [end:name-conflict]
            assert str(exc) == (
                "Function tools.pricing.shipping_cost already exists. "
                "Set replace=True to overwrite it."
            ), exc
        else:
            raise AssertionError("registering an existing name should fail")

        # The reader edits pricing.py; pricing_edited.py is that edit.
        shutil.copy(HERE / "pricing_edited.py", WORKDIR / "pricing.py")

        # --8<-- [start:replace]
        import importlib

        importlib.reload(pricing)
        info = await client.create_python_function_async(
            func=pricing.shipping_cost,
            catalog="tools",
            schema="pricing",
            replace=True,
        )
        print(info.comment)
        # --8<-- [end:replace]
        assert info.comment == (
            "Calculate the shipping cost of a parcel, including a handling fee."
        ), info.comment
        # Delete, then create: the function is a new object with a new id.
        assert info.function_id != first_id, (info.function_id, first_id)
        # The replacing client cleared its own cache, so it runs the new body.
        result = await client.execute_function_async(
            NAME, parameters={"weight_kg": 2.5}
        )
        assert result.value == 15.5, result

        # A comment change has no update call of its own: the SDK has no
        # update_function, and the server has no update route (FunctionService
        # at the release tag maps POST, GET, GET /{name}, DELETE /{name}).
        from unitycatalog.client import FunctionsApi

        assert not hasattr(FunctionsApi, "update_function")
        assert not hasattr(client, "update_function_async")

        await _replace_is_not_atomic(client)

        # --8<-- [start:delete]
        await client.delete_function_async("tools.pricing.shipping_cost")
        # --8<-- [end:delete]

        # After the delete, a get returns None (and logs the 404), and a call
        # fails before it reaches the cache, in this client or any other.
        assert await client.get_function_async(NAME) is None
        try:
            await client.execute_function_async(NAME, parameters={"weight_kg": 1.0})
        except AttributeError as exc:
            assert str(exc) == "'NoneType' object has no attribute 'input_params'", exc
        else:
            raise AssertionError("calling a deleted function should fail")
        # Deleting it again is a 404 from the server.
        try:
            await client.delete_function_async(NAME)
        except NotFoundException as exc:
            assert exc.status == 404, exc
        else:
            raise AssertionError("deleting a missing function should 404")

        await CatalogsApi(api).delete_catalog(name="tools", force=True)
    finally:
        await api.close()
        shutil.rmtree(WORKDIR, ignore_errors=True)


async def _replace_is_not_atomic(client) -> None:
    """A replace deletes first; if the create then fails, nothing is left.

    The server stores a comment of at most 65535 characters (FunctionInfoDAO at
    the release tag), so an oversized docstring fails after the delete.
    """
    import pricing
    from unitycatalog.client.exceptions import ServiceException

    before = await client.get_function_async(NAME)
    original = pricing.shipping_cost.__doc__
    pricing.shipping_cost.__doc__ = "x" * 70_000
    try:
        await client.create_python_function_async(
            func=pricing.shipping_cost, catalog="tools", schema="pricing", replace=True
        )
    except ServiceException as exc:
        assert exc.status == 500, exc
    else:
        raise AssertionError("an oversized comment should be rejected")
    finally:
        pricing.shipping_cost.__doc__ = original
    assert before is not None
    assert await client.get_function_async(NAME) is None, "the failed replace kept it"
    # Put it back for the delete step.
    await client.create_python_function_async(
        func=pricing.shipping_cost, catalog="tools", schema="pricing"
    )


async def _seed(api) -> None:
    """The page assumes the catalog and schema exist (H01)."""
    catalogs = CatalogsApi(api)
    try:
        await catalogs.delete_catalog(name="tools", force=True)
    except NotFoundException:
        pass
    await catalogs.create_catalog(CreateCatalog(name="tools"))
    await SchemasApi(api).create_schema(
        CreateSchema(name="pricing", catalog_name="tools")
    )


if __name__ == "__main__":
    asyncio.run(main())
