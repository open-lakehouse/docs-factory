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
"""Sandbox and local execution modes: where a call runs, what each refuses,
how errors read, and which imports a sandboxed function can make.

The regions are what a reader types into `python -m asyncio`, after the
`connect` region of run_async.py.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run modes.py
"""

import asyncio
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
HOST = "http://localhost:8080/api/2.1/unity-catalog"

RESTRICTED = (
    "You may not use this module within the local sandbox executor for safety reasons."
)
OPEN_REFUSED = (
    "The use of the 'open' function is restricted within the local sandbox "
    "executor for safety reasons."
)


async def main() -> None:
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    api = ApiClient(Configuration(host=os.environ.get("UC_BASE_URL", HOST)))
    import seed

    try:
        await seed.register_all(api)

        # --8<-- [start:modes]
        sandboxed = UnitycatalogFunctionClient(
            api_client=api
        )  # execution_mode="sandbox"
        local = UnitycatalogFunctionClient(api_client=api, execution_mode="local")
        # --8<-- [end:modes]
        assert sandboxed.execution_mode.value == "sandbox", sandboxed.execution_mode
        assert local.execution_mode.value == "local", local.execution_mode
        try:
            UnitycatalogFunctionClient(api_client=api, execution_mode="subprocess")
        except ValueError:
            pass
        else:
            raise AssertionError("only sandbox and local are modes")

        await _where_calls_run(sandboxed, local)
        await _error_text(sandboxed, local)
        await _refusals(sandboxed, local)
        await _transitive_imports(api)
        _disallowed_modules_env(sandboxed)
        await _local_results_are_cached(local)
        await _async_functions(api)

        await seed.drop_all(api)
    finally:
        await api.close()


def _call(client, name: str, **parameters):
    return client.execute_function_async(f"tools.pricing.{name}", parameters=parameters)


async def _where_calls_run(sandboxed, local) -> None:
    # Sandbox: a forked child process.
    r = await _call(sandboxed, "process_id", tag="sandbox")
    assert r.error is None and r.value != os.getpid(), r
    # Local, sync call: the caller's own thread.
    r = local.execute_function("tools.pricing.thread_id", parameters={"tag": "sync"})
    assert r.value == threading.get_ident(), r
    # Local, async call of a sync function: the caller's process, a thread of
    # the loop's default executor.
    r = await _call(local, "process_id", tag="async")
    assert r.value == os.getpid(), r
    r = await _call(local, "thread_id", tag="async")
    assert r.error is None and r.value != threading.get_ident(), r


async def _error_text(sandboxed, local) -> None:
    # --8<-- [start:error-text]
    params = {"quantity": 0, "unit_price": 19.99}
    in_sandbox = await sandboxed.execute_function_async(
        "tools.pricing.checked_total", parameters=params
    )
    in_process = await local.execute_function_async(
        "tools.pricing.checked_total", parameters=params
    )
    print(in_sandbox.error)  # Traceback (most recent call last): ... ValueError: ...
    print(in_process.error)  # quantity must be at least 1
    # --8<-- [end:error-text]
    assert in_sandbox.value is None, in_sandbox
    assert in_sandbox.error.startswith("Traceback (most recent call last):"), in_sandbox
    assert in_sandbox.error.rstrip().endswith(
        "ValueError: quantity must be at least 1"
    ), in_sandbox
    assert in_process.value is None and in_process.error == (
        "quantity must be at least 1"
    ), in_process


async def _refusals(sandboxed, local) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write("rate=1.0")
    try:
        # open() is refused in the sandbox, allowed locally.
        r = await _call(sandboxed, "read_rates", path=f.name)
        assert r.value is None and OPEN_REFUSED in r.error, r
        assert "ImportError" in r.error, r
        r = await _call(local, "read_rates", path=f.name)
        assert r.error is None and r.value == "rate=1.0", r
    finally:
        os.unlink(f.name)

    # A blocked module is refused in the sandbox, allowed locally.
    r = await _call(sandboxed, "python_version")
    assert r.value is None, r
    assert f"The import of module 'sys' is restricted. {RESTRICTED}" in r.error, r
    r = await _call(local, "python_version")
    assert r.error is None and r.value == sys.version.split()[0], r


async def _transitive_imports(api) -> None:
    """A package the caller hasn't imported yet runs its own imports in the
    sandbox, where the blocked list applies to them too. Importing it in the
    caller first puts it in the forked child's sys.modules."""
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient

    client = UnitycatalogFunctionClient(api_client=api)
    assert "statistics" not in sys.modules and "cloudpickle" not in sys.modules
    # statistics imports sys; cloudpickle imports pickle.
    r = await _call(client, "mean_price", first=1.0, second=2.0, third=3.0)
    assert r.value is None and "The import of module 'sys' is restricted." in r.error, r
    r = await _call(client, "payload_size", quantity=3)
    assert (
        r.value is None and "The import of module 'pickle' is restricted." in r.error
    ), r

    # --8<-- [start:preload]
    import cloudpickle  # noqa: F401  # loaded here, the sandboxed call can use it

    result = await client.execute_function_async(
        "tools.pricing.payload_size", parameters={"quantity": 3}
    )
    print(result.value)
    # --8<-- [end:preload]
    assert result.error is None and isinstance(result.value, int), result
    import statistics  # noqa: F401

    r = await _call(client, "mean_price", first=1.0, second=2.0, third=3.0)
    assert r.error is None and r.value == 2.0, r
    # The function's own direct import of a blocked module still fails.
    r = await _call(client, "python_version")
    assert "The import of module 'sys' is restricted." in r.error, r


def _disallowed_modules_env(sandboxed) -> None:
    """EXECUTOR_DISALLOWED_MODULES is meant to replace the blocked list, but
    any value parses as a list of single characters (the variable is typed
    list[str], and only `list` gets the JSON / comma parsing). So setting it
    unblocks every module, whatever it says."""
    from unitycatalog.ai.core.envs.executor_env_vars import EXECUTOR_DISALLOWED_MODULES

    try:
        for value in ("sys,socket", '["sys", "socket"]'):
            os.environ["EXECUTOR_DISALLOWED_MODULES"] = value
            assert EXECUTOR_DISALLOWED_MODULES.get() == list(value)
            r = sandboxed.execute_function(
                "tools.pricing.python_version", parameters={}
            )
            assert r.error is None and r.value == sys.version.split()[0], (value, r)
    finally:
        del os.environ["EXECUTOR_DISALLOWED_MODULES"]
    r = sandboxed.execute_function("tools.pricing.python_version", parameters={})
    assert "The import of module 'sys' is restricted." in r.error, r


async def _local_results_are_cached(local) -> None:
    """Local mode keeps the rebuilt function behind an lru_cache, so a repeat
    call with the same arguments returns the stored result without running
    the body. (The first call runs the uncached function; the cache starts
    with the second.)"""
    timings = []
    for _ in range(3):
        start = time.monotonic()
        r = await _call(local, "slow_quote", seconds=1.0)
        timings.append(time.monotonic() - start)
        assert r.value == 10.0, r
    assert timings[0] >= 1.0 and timings[1] >= 1.0, timings
    assert timings[2] < 0.5, timings
    # Clearing the function cache makes the next call run the body again.
    local.clear_function_cache()
    start = time.monotonic()
    r = await _call(local, "slow_quote", seconds=1.0)
    assert r.value == 10.0 and time.monotonic() - start >= 1.0, r
    # So does a new client: its calls run the body.
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient

    fresh = UnitycatalogFunctionClient(
        api_client=local.uc.api_client, execution_mode="local"
    )
    start = time.monotonic()
    r = await _call(fresh, "slow_quote", seconds=1.0)
    assert r.value == 10.0 and time.monotonic() - start >= 1.0, r


async def _async_functions(api) -> None:
    """create_python_function on an `async def` stores a `def` with no body,
    so every call fails before either mode runs it."""
    import pricing
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient

    client = UnitycatalogFunctionClient(api_client=api)
    info = await client.create_python_function_async(
        func=pricing.quote_async, catalog="tools", schema="pricing"
    )
    assert info.routine_definition == "", info.routine_definition
    source = client.get_function_source("tools.pricing.quote_async")
    assert source.startswith("def quote_async(seconds: float) -> float:"), source
    assert "await" not in source, source
    for mode in ("sandbox", "local"):
        c = UnitycatalogFunctionClient(api_client=api, execution_mode=mode)
        try:
            await _call(c, "quote_async", seconds=0.1)
        except IndentationError as exc:
            assert "expected an indented block" in str(exc), exc
        else:
            raise AssertionError(f"an async function ran in {mode} mode")


if __name__ == "__main__":
    asyncio.run(main())
