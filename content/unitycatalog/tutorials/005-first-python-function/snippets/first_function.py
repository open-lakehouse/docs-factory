# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-ai==0.4.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The sandbox forks this process, then caps the child's address space at
# # EXECUTOR_MAX_MEMORY_LIMIT MB (default 100). Linux enforces it (macOS doesn't),
# # and the inherited address space already exceeds 100 MB, so the child can't
# # allocate and the call times out. 1024 still failed in an arm64 repro.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""Register a Python function in Unity Catalog, inspect it, run it, and remove it.

The regions are what a reader types into `python -m asyncio`, step by step.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run first_function.py
"""

import asyncio
import os

from unitycatalog.client.exceptions import NotFoundException


async def main() -> None:
    # --8<-- [start:connect]
    from unitycatalog.ai.core.client import (
        UnitycatalogClient,
        UnitycatalogFunctionClient,
    )
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)
    # --8<-- [end:connect]
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    try:
        await _reset(api)

        # --8<-- [start:namespace]
        uc = UnitycatalogClient(api_client=api)
        await uc.create_catalog_async(
            name="tools", comment="Functions for apps and agents"
        )
        await uc.create_schema_async(name="pricing", catalog_name="tools")
        # --8<-- [end:namespace]

        # --8<-- [start:import-function]
        from pricing import order_total
        # --8<-- [end:import-function]

        # --8<-- [start:register]
        info = await client.create_python_function_async(
            func=order_total,
            catalog="tools",
            schema="pricing",
        )
        print(info.full_name)  # tools.pricing.order_total
        # --8<-- [end:register]
        assert info.full_name == "tools.pricing.order_total"

        # --8<-- [start:inspect]
        fn = await client.get_function_async("tools.pricing.order_total")
        print(fn.comment)
        for param in fn.input_params.parameters:
            print(f"{param.name}: {param.type_text} - {param.comment}")
        print("returns:", fn.full_data_type)
        print(fn.routine_definition)
        # --8<-- [end:inspect]
        params = fn.input_params.parameters
        assert [(p.name, p.type_text) for p in params] == [
            ("quantity", "LONG"),
            ("unit_price", "DOUBLE"),
            ("discount_pct", "DOUBLE"),
        ], params
        assert params[2].parameter_default == "0.0"
        assert fn.full_data_type == "DOUBLE"
        assert fn.external_language == "PYTHON"
        assert fn.routine_definition == (
            "return round(quantity * unit_price * (1 - discount_pct / 100), 2)"
        )

        # --8<-- [start:execute]
        result = await client.execute_function_async(
            "tools.pricing.order_total",
            parameters={"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
        )
        print(result.value)  # 53.97
        # --8<-- [end:execute]
        assert result.error is None and result.value == 53.97, result

        # --8<-- [start:default]
        result = await client.execute_function_async(
            "tools.pricing.order_total",
            parameters={"quantity": 3, "unit_price": 19.99},
        )
        print(result.value)  # 59.97
        # --8<-- [end:default]
        assert result.value == 59.97, result

        # --8<-- [start:wrong-type]
        try:
            await client.execute_function_async(
                "tools.pricing.order_total",
                parameters={"quantity": 3, "unit_price": 20},
            )
        except ValueError as exc:
            print(exc)  # ... unit_price should be of type ... DOUBLE ...
        # --8<-- [end:wrong-type]
        else:
            raise AssertionError("an int for a DOUBLE parameter should be rejected")

        # unitycatalog-ai 0.4.0 replaces any falsy return value with a notice
        # string; the page's note depends on it.
        zero = await client.execute_function_async(
            "tools.pricing.order_total", parameters={"quantity": 0, "unit_price": 1.0}
        )
        assert isinstance(zero.value, str) and "no output was produced" in zero.value

        # --8<-- [start:list]
        functions = await client.list_functions_async(catalog="tools", schema="pricing")
        print([f.full_name for f in functions])
        # --8<-- [end:list]
        assert [f.full_name for f in functions] == ["tools.pricing.order_total"]

        # --8<-- [start:clean-up]
        await client.delete_function_async("tools.pricing.order_total")
        await CatalogsApi(api).delete_catalog(name="tools", force=True)
        await api.close()
        # --8<-- [end:clean-up]
    finally:
        await api.close()


async def _reset(api) -> None:
    from unitycatalog.client import CatalogsApi

    try:
        await CatalogsApi(api).delete_catalog(name="tools", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())
