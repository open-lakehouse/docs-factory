# /// script
# requires-python = "==3.12.*"
# dependencies = ["unitycatalog-ai==0.4.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The sandbox caps the child's address space at EXECUTOR_MAX_MEMORY_LIMIT MB
# # (default 100), which Linux enforces; see T05's first_function.py.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""The two ways a call fails: an exception raised before the function runs,
and an error string returned in the result.

The regions are what a reader types into `python -m asyncio`, after the
`connect` region of run_async.py.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run errors.py
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
HOST = "http://localhost:8080/api/2.1/unity-catalog"


async def main() -> None:
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.ai.core.executor.common import NO_OUTPUT_MESSAGE
    from unitycatalog.client import ApiClient, Configuration

    api = ApiClient(Configuration(host=os.environ.get("UC_BASE_URL", HOST)))
    client = UnitycatalogFunctionClient(api_client=api)
    import seed

    try:
        await seed.register_all(api)

        # Raised before the function runs: the client checks arguments
        # against the registered parameters.
        raised = None
        # --8<-- [start:raised]
        try:
            await client.execute_function_async(
                "tools.pricing.order_total",
                parameters={"quantity": "3", "unit_price": 19.99},
            )
        except ValueError as exc:
            print(
                exc
            )  # Invalid parameters provided: {'quantity': "Parameter quantity should be of type ..."}
            # --8<-- [end:raised]
            raised = exc
        assert raised is not None, "a wrong type should raise"
        assert str(raised) == (
            "Invalid parameters provided: {'quantity': \"Parameter quantity should be "
            "of type ColumnTypeName.LONG (corresponding python type <class 'int'>), "
            "but got <class 'str'>\"}."
        ), raised
        await _raises(
            client,
            {"unit_price": 19.99},
            ValueError,
            "Parameter quantity is required but not provided.",
        )
        await _raises(
            client,
            {"quantity": 3, "unit_price": 19.99, "coupon": "X"},
            ValueError,
            "Extra parameters provided that are not defined in the function's "
            "input parameters: {'coupon'}.",
        )
        # A function that doesn't exist (never registered or deleted) raises
        # AttributeError, after the client logs the server's 404.
        logger = logging.getLogger("unitycatalog.ai.core.client")
        logger.setLevel(logging.CRITICAL)
        try:
            await client.execute_function_async(
                "tools.pricing.no_such_fn", parameters={}
            )
        except AttributeError as exc:
            assert str(exc) == "'NoneType' object has no attribute 'input_params'", exc
        else:
            raise AssertionError("a missing function should raise")
        finally:
            logger.setLevel(logging.NOTSET)

        # Returned in the result: anything that goes wrong while it runs.
        # --8<-- [start:check-error]
        result = await client.execute_function_async(
            "tools.pricing.checked_total",
            parameters={"quantity": 0, "unit_price": 19.99},
        )
        if result.error:
            print(
                result.error.splitlines()[-1]
            )  # ValueError: quantity must be at least 1
        else:
            print(result.value)
        # --8<-- [end:check-error]
        assert result.value is None, result
        assert result.error.startswith("Traceback (most recent call last):"), result
        assert (
            result.error.splitlines()[-1] == "ValueError: quantity must be at least 1"
        )
        ok = await client.execute_function_async(
            "tools.pricing.checked_total",
            parameters={"quantity": 2, "unit_price": 19.99},
        )
        assert ok.error is None and ok.value == 39.98, ok

        # A falsy return value comes back as a notice in value, not an error.
        zero = await client.execute_function_async(
            "tools.pricing.order_total", parameters={"quantity": 0, "unit_price": 19.99}
        )
        assert zero.error is None and zero.value == NO_OUTPUT_MESSAGE, zero

        # A list argument works once per client, then hits the lru_cache.
        params = {"items": ["a", "b"]}
        first = await client.execute_function_async(
            "tools.pricing.count_items", parameters=params
        )
        assert first.error is None and first.value == 2, first
        second = await client.execute_function_async(
            "tools.pricing.count_items", parameters=params
        )
        assert second.value is None, second
        assert second.error.splitlines()[-1] == "TypeError: unhashable type: 'list'", (
            second
        )
        await _list_argument_remedies(client, api, params)

        # The result has exactly these fields.
        import dataclasses

        from unitycatalog.ai.core.base import FunctionExecutionResult

        assert [f.name for f in dataclasses.fields(FunctionExecutionResult)] == [
            "error",
            "format",
            "value",
            "truncated",
        ]
        assert ok.format == "SCALAR" and ok.truncated is None, ok

        await seed.drop_all(api)
    finally:
        await api.close()


async def _list_argument_remedies(client, api, params) -> None:
    """Both remedies fix only the next call: the first call after a rebuild
    runs the plain function, and the client wraps it in lru_cache after."""
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient

    unhashable = "TypeError: unhashable type: 'list'"

    def call(c):
        return c.execute_function_async("tools.pricing.count_items", parameters=params)

    # clear_function_cache() before the call: works, the next one fails again.
    client.clear_function_cache()
    r = await call(client)
    assert r.error is None and r.value == 2, r
    r = await call(client)
    assert r.error.splitlines()[-1] == unhashable, r
    # Clearing before every call keeps it working.
    for _ in range(3):
        client.clear_function_cache()
        r = await call(client)
        assert r.error is None and r.value == 2, r

    # A new client: its first call works, its second fails.
    fresh = UnitycatalogFunctionClient(api_client=api)
    r = await call(fresh)
    assert r.error is None and r.value == 2, r
    r = await call(fresh)
    assert r.error.splitlines()[-1] == unhashable, r

    # Local mode too, with only the message as the error.
    local = UnitycatalogFunctionClient(api_client=api, execution_mode="local")
    assert (await call(local)).value == 2
    r = await call(local)
    assert r.error == "unhashable type: 'list'", r


async def _raises(client, parameters, kind, message) -> None:
    try:
        await client.execute_function_async(
            "tools.pricing.order_total", parameters=parameters
        )
    except kind as exc:
        assert str(exc) == message, exc
    else:
        raise AssertionError(f"{parameters} should raise {kind.__name__}")


if __name__ == "__main__":
    asyncio.run(main())
