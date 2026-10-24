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
"""The sandbox's wall-clock, CPU-time, and memory limits, read from
environment variables on every call.

The regions are what a reader types into `python -m asyncio`, after the
`connect` region of run_async.py.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run limits.py
"""

import asyncio
import os
import signal
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
HOST = "http://localhost:8080/api/2.1/unity-catalog"


async def main() -> None:
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.ai.core.executor.common import (
        TERMINATED_MESSAGE_TEMPLATE,
        TIMEOUT_ERROR_MESSAGE,
    )
    from unitycatalog.client import ApiClient, Configuration

    api = ApiClient(Configuration(host=os.environ.get("UC_BASE_URL", HOST)))
    client = UnitycatalogFunctionClient(api_client=api)
    import seed

    try:
        await seed.register_all(api)
        for var in ("EXECUTOR_TIMEOUT", "EXECUTOR_MAX_CPU_TIME_LIMIT"):
            assert var not in os.environ, var

        # Defaults: a 12-second wait fits the 20-second wall clock.
        r = await client.execute_function_async(
            "tools.pricing.slow_quote", parameters={"seconds": 12.0}
        )
        assert r.error is None and r.value == 120.0, r

        start = time.monotonic()
        result = await _wall_clock(client)
        elapsed = time.monotonic() - start
        assert result.value is None and result.error == TIMEOUT_ERROR_MESSAGE, result
        assert 3.0 <= elapsed < 6.0, elapsed
        # Read on every call: raising it again lets the same wait finish.
        os.environ["EXECUTOR_TIMEOUT"] = "30"
        r = await client.execute_function_async(
            "tools.pricing.slow_quote", parameters={"seconds": 8.0}
        )
        assert r.error is None and r.value == 80.0, r

        # The CPU limit counts CPU seconds, so sleeping doesn't use it up...
        os.environ["EXECUTOR_MAX_CPU_TIME_LIMIT"] = "1"
        r = await client.execute_function_async(
            "tools.pricing.slow_quote", parameters={"seconds": 3.0}
        )
        assert r.error is None and r.value == 30.0, r
        # ...and a busy loop is killed when it does.
        start = time.monotonic()
        # --8<-- [start:cpu-time]
        os.environ["EXECUTOR_MAX_CPU_TIME_LIMIT"] = "1"  # CPU seconds
        result = await client.execute_function_async(
            "tools.pricing.busy_total", parameters={"iterations": 100_000_000}
        )
        print(
            result.error
        )  # The function execution has been terminated with a signal ...
        # --8<-- [end:cpu-time]
        elapsed = time.monotonic() - start
        assert result.value is None, result
        # The executor sets RLIMIT_CPU's soft and hard limits to the same
        # value. Linux then kills the child with SIGKILL (9) at the limit;
        # macOS sends SIGXCPU (24).
        expected = signal.SIGKILL if sys.platform == "linux" else signal.SIGXCPU
        assert result.error == TERMINATED_MESSAGE_TEMPLATE.format(
            signal_num=int(expected)
        ), result
        assert result.error.startswith(
            "The function execution has been terminated with a signal "
        ), result
        assert elapsed < 10.0, elapsed
        del os.environ["EXECUTOR_MAX_CPU_TIME_LIMIT"]

        # timeout= is the HTTP timeout of the function lookup, not a limit on
        # the run: a 2-second call with timeout=0.5 completes.
        # --8<-- [start:request-timeout]
        result = await client.execute_function_async(
            "tools.pricing.slow_quote", parameters={"seconds": 2.0}, timeout=0.5
        )
        # --8<-- [end:request-timeout]
        assert result.error is None and result.value == 20.0, result

        await _memory(client)
        await _local_has_no_limits(api)

        await seed.drop_all(api)
    finally:
        for var in ("EXECUTOR_TIMEOUT", "EXECUTOR_MAX_CPU_TIME_LIMIT"):
            os.environ.pop(var, None)
        await api.close()


async def _wall_clock(client):
    # --8<-- [start:wall-clock]
    import os

    os.environ["EXECUTOR_TIMEOUT"] = "3"  # seconds of wall-clock time
    result = await client.execute_function_async(
        "tools.pricing.slow_quote", parameters={"seconds": 8.0}
    )
    print(
        result.error
    )  # The function execution has timed out and has been canceled ...
    # --8<-- [end:wall-clock]
    return result


async def _memory(client) -> None:
    """EXECUTOR_MAX_MEMORY_LIMIT caps the child's address space; only Linux
    enforces it (macOS ignores RLIMIT_AS)."""
    assert os.environ["EXECUTOR_MAX_MEMORY_LIMIT"] == "4096"
    try:
        os.environ["EXECUTOR_MAX_MEMORY_LIMIT"] = "256"
        os.environ["EXECUTOR_TIMEOUT"] = "10"
        r = await client.execute_function_async(
            "tools.pricing.allocate", parameters={"megabytes": 512}
        )
        if sys.platform == "linux":
            assert r.value is None and r.error, r
        else:
            assert r.error is None and r.value == 512 * 1024 * 1024, r
        # At the 100 MB default, Linux refuses even a small call: the forked
        # child already holds more address space than that.
        os.environ["EXECUTOR_MAX_MEMORY_LIMIT"] = "100"
        r = await client.execute_function_async(
            "tools.pricing.order_total",
            parameters={"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
        )
        if sys.platform == "linux":
            assert r.value is None and r.error, r
        else:
            assert r.error is None and r.value == 53.97, r
    finally:
        os.environ["EXECUTOR_MAX_MEMORY_LIMIT"] = "4096"
        os.environ.pop("EXECUTOR_TIMEOUT", None)


async def _local_has_no_limits(api) -> None:
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient

    local = UnitycatalogFunctionClient(api_client=api, execution_mode="local")
    try:
        os.environ["EXECUTOR_TIMEOUT"] = "1"
        os.environ["EXECUTOR_MAX_CPU_TIME_LIMIT"] = "1"
        r = await local.execute_function_async(
            "tools.pricing.slow_quote", parameters={"seconds": 3.0}
        )
        assert r.error is None and r.value == 30.0, r
        r = await local.execute_function_async(
            "tools.pricing.busy_total", parameters={"iterations": 20_000_000}
        )
        assert r.error is None and isinstance(r.value, int), r
    finally:
        os.environ.pop("EXECUTOR_TIMEOUT", None)
        os.environ.pop("EXECUTOR_MAX_CPU_TIME_LIMIT", None)


if __name__ == "__main__":
    asyncio.run(main())
