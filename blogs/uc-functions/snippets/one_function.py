# /// script
# requires-python = "==3.12.*"
# dependencies = ["unitycatalog-ai==0.4.0", "unitycatalog-langchain==0.4.0"]
# ///
# one_function.py — register order_total once, run it from app code, then hand it
# to an agent as a LangChain tool.
# Run:      EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run one_function.py   (beside pricing.py)
# Needs:    a local Unity Catalog server on http://localhost:8080
#           (the docs' envs/unitycatalog: `just env-up unitycatalog`).
#           The script works in its own catalog, uc_functions_demo. It stops if that
#           catalog already exists, and it deletes only the catalog it created.
# Verified: unitycatalog v0.7.0 server, unitycatalog-ai 0.4.0,
#           unitycatalog-langchain 0.4.0, Python 3.12.
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

CATALOG = "uc_functions_demo"


async def main() -> None:
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration
    from unitycatalog.client.exceptions import NotFoundException

    probe = ApiClient(Configuration(host="http://localhost:8080/api/2.1/unity-catalog"))
    try:
        try:
            await CatalogsApi(probe).get_catalog(name=CATALOG)
        except NotFoundException:
            pass
        else:
            sys.exit(f"catalog {CATALOG} already exists; drop it or rename CATALOG")
    finally:
        await probe.close()

    # The run checked above that the catalog didn't exist, so whatever is under
    # that name at cleanup is what this run created.
    try:
        # --8<-- [start:register]
        from pricing import order_total
        from unitycatalog.ai.core.client import (
            UnitycatalogClient,
            UnitycatalogFunctionClient,
        )
        from unitycatalog.client import ApiClient, Configuration

        api = ApiClient(
            Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
        )
        client = UnitycatalogFunctionClient(api_client=api)

        uc = UnitycatalogClient(api_client=api)
        await uc.create_catalog_async(name="uc_functions_demo")
        await uc.create_schema_async(name="pricing", catalog_name="uc_functions_demo")
        await client.create_python_function_async(
            func=order_total, catalog="uc_functions_demo", schema="pricing"
        )
        # --8<-- [end:register]
        info = await client.get_function_async("uc_functions_demo.pricing.order_total")
        assert info.full_data_type == "DOUBLE", info.full_data_type
        assert "round(quantity" in info.routine_definition

        # --8<-- [start:run]
        result = await client.execute_function_async(
            "uc_functions_demo.pricing.order_total",
            parameters={"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
        )
        print(result.value)  # 53.97
        # --8<-- [end:run]
        assert result.error is None, result.error
        assert float(result.value) == 53.97, result.value

        # --8<-- [start:toolkit]
        from unitycatalog.ai.langchain.toolkit import UCFunctionToolkit

        toolkit = UCFunctionToolkit(
            function_names=["uc_functions_demo.pricing.order_total"], client=client
        )
        tool = toolkit.tools[0]
        print(tool.name)  # uc_functions_demo__pricing__order_total
        print(tool.description)  # the docstring's summary
        print(tool.invoke({"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}))
        # {"format": "SCALAR", "value": 53.97}
        # --8<-- [end:toolkit]
        assert tool.name == "uc_functions_demo__pricing__order_total", tool.name
        assert tool.description.startswith("Calculate the total price"), (
            tool.description
        )
        output = json.loads(
            tool.invoke({"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0})
        )
        assert output == {"format": "SCALAR", "value": 53.97}, output
    finally:
        await _drop_own_catalog()
        if "api" in locals():
            await api.close()


async def _drop_own_catalog() -> None:
    """Delete the catalog this run created, and nothing else."""
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration
    from unitycatalog.client.exceptions import NotFoundException

    api = ApiClient(Configuration(host="http://localhost:8080/api/2.1/unity-catalog"))
    try:
        await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
    except NotFoundException:
        pass  # the run failed before it created the catalog
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
