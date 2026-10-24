# /// script
# requires-python = "==3.12.*"
# dependencies = [
#   "unitycatalog-ai==0.4.0",
#   # Only for the asserts on what importing the client does to an app that
#   # runs on uvloop (as uvicorn does when uvloop is installed).
#   "uvloop==0.23.0",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The sandbox caps the child's address space at EXECUTOR_MAX_MEMORY_LIMIT MB
# # (default 100), which Linux enforces; see T05's first_function.py.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""Call catalog functions from async code: one call, concurrent calls, and
what fails across threads and event loops.

The regions are what a reader types into `python -m asyncio`.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run run_async.py
"""

import asyncio
import concurrent.futures
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
CALL = {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}


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
    import seed

    try:
        await seed.register_all(api)

        # --8<-- [start:async]
        result = await client.execute_function_async(
            "tools.pricing.order_total",
            parameters={"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
        )
        print(result.value)  # 53.97
        # --8<-- [end:async]
        assert result.error is None and result.value == 53.97, result

        # Sequential awaits on one client are fine.
        for _ in range(3):
            again = await client.execute_function_async(
                "tools.pricing.order_total", parameters=CALL
            )
            assert again.value == 53.97, again

        _one_client_gather_deadlocks(config.host)

        # --8<-- [start:concurrent]
        quotes = [UnitycatalogFunctionClient(api_client=api) for _ in range(3)]
        results = await asyncio.gather(
            *(
                quote.execute_function_async(
                    "tools.pricing.slow_quote", parameters={"seconds": 2.0}
                )
                for quote in quotes
            )
        )
        print([r.value for r in results])  # [20.0, 20.0, 20.0]
        # --8<-- [end:concurrent]
        assert [r.value for r in results] == [20.0, 20.0, 20.0], results
        # The calls overlap: three 2-second calls finish in well under 6 s.
        start = time.monotonic()
        await asyncio.gather(
            *(
                q.execute_function_async(
                    "tools.pricing.slow_quote", parameters={"seconds": 2.0}
                )
                for q in quotes
            )
        )
        elapsed = time.monotonic() - start
        assert elapsed < 4.5, f"concurrent calls took {elapsed:.1f}s"

        await _other_threads(client, config.host)
        await _patches_asyncio()

        await seed.drop_all(api)
    finally:
        await api.close()
    _uvloop_import_fails()


def _one_client_gather_deadlocks(host: str) -> None:
    """Two concurrent calls on one client never finish.

    execute_function_async holds the client's threading.Lock around the sync
    get_function, which re-enters the running loop (nest_asyncio); the loop
    then starts the second call, which blocks the thread on the same lock.
    The deadlocked loop runs in a daemon thread so this script can go on.
    The thread signals on every exit, so an early exception can't pass for
    a deadlock.
    """
    started = threading.Event()
    exited = threading.Event()
    outcome: dict = {}

    def run() -> None:
        async def go():
            from unitycatalog.ai.core.client import UnitycatalogFunctionClient
            from unitycatalog.client import ApiClient, Configuration

            client = UnitycatalogFunctionClient(
                api_client=ApiClient(Configuration(host=host))
            )
            started.set()
            return await asyncio.gather(
                client.execute_function_async(
                    "tools.pricing.order_total", parameters=CALL
                ),
                client.execute_function_async(
                    "tools.pricing.order_total", parameters=CALL
                ),
            )

        try:
            outcome["results"] = asyncio.new_event_loop().run_until_complete(go())
        except BaseException as exc:  # noqa: BLE001 - recorded for the assert
            outcome["error"] = exc
        finally:
            exited.set()

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    assert not exited.wait(20), f"gather on one client should deadlock: {outcome}"
    assert started.is_set(), "the worker never reached the two calls"
    assert worker.is_alive() and outcome == {}, outcome


async def _other_threads(client, host: str) -> None:
    """The client belongs to the loop that opened its connection.

    Calls from worker threads (a ThreadPoolExecutor here, as LangGraph's tool
    threads in H13) fail, async or sync. A client created in the worker's
    own loop works.
    """

    def async_in_worker():
        return asyncio.run(
            client.execute_function_async("tools.pricing.order_total", parameters=CALL)
        )

    def sync_in_worker():
        return client.execute_function("tools.pricing.order_total", parameters=CALL)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        try:
            pool.submit(async_in_worker).result(timeout=60)
        except RuntimeError as exc:
            assert "attached to a different loop" in str(exc), exc
        else:
            raise AssertionError("a worker thread's loop should fail")
        try:
            pool.submit(sync_in_worker).result(timeout=60)
        except RuntimeError as exc:
            # Which of the two depends on whether the worker already has a
            # loop of its own (nest_asyncio's asyncio.run leaves it open).
            assert "attached to a different loop" in str(exc) or str(exc) == (
                "Timeout context manager should be used inside a task"
            ), exc
        else:
            raise AssertionError("a sync call from a worker thread should fail")

    # The region's literal host is the one the harness serves on.
    assert host.rstrip("/") == "http://localhost:8080/api/2.1/unity-catalog", host
    results = _worker_clients()
    assert [r.value for r in results] == [53.97, 53.97], results
    assert all(r.error is None for r in results), results

    # The loop's own client still works afterwards.
    result = await client.execute_function_async(
        "tools.pricing.order_total", parameters=CALL
    )
    assert result.value == 53.97, result


def _worker_clients():
    """One client per worker thread, each on the worker's own loop."""
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    # isort: split
    # --8<-- [start:worker-client]
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    def call_in_worker(parameters):
        async def call():
            config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
            api = ApiClient(config)
            try:
                worker_client = UnitycatalogFunctionClient(api_client=api)
                return await worker_client.execute_function_async(
                    "tools.pricing.order_total", parameters=parameters
                )
            finally:
                await api.close()

        return asyncio.run(call())

    orders = [
        {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
        {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(call_in_worker, orders))
    print([r.value for r in results])  # [53.97, 53.97]
    # --8<-- [end:worker-client]
    return results


async def _patches_asyncio() -> None:
    """Importing the client applies nest_asyncio to the whole process."""

    async def inner():
        return 2

    # A nested run_until_complete on the running loop is allowed...
    assert asyncio.get_running_loop().run_until_complete(inner()) == 2
    # ...and asyncio.run is replaced by one without loop_factory.
    assert asyncio.run.__module__ == "nest_asyncio", asyncio.run.__module__

    def with_loop_factory():
        coro = inner()
        try:
            return asyncio.run(coro, loop_factory=asyncio.new_event_loop)
        finally:
            coro.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        try:
            pool.submit(with_loop_factory).result(timeout=30)
        except TypeError as exc:
            assert "unexpected keyword argument 'loop_factory'" in str(exc), exc
        else:
            raise AssertionError("asyncio.run(loop_factory=...) should fail")


def _uvloop_import_fails() -> None:
    """In a fresh process: importing the client inside a running uvloop loop
    raises, and after importing it, uvloop.run fails."""
    inside = (
        "import uvloop\n"
        "async def main():\n"
        "    import unitycatalog.ai.core.client\n"
        "uvloop.run(main())\n"
    )
    proc = subprocess.run(
        [sys.executable, "-c", inside], capture_output=True, text=True, timeout=120
    )
    assert proc.returncode != 0, proc
    last = proc.stderr.strip().splitlines()[-1]
    assert last == "ValueError: Can't patch loop of type <class 'uvloop.Loop'>", last

    after = (
        "import unitycatalog.ai.core.client\n"
        "import uvloop\n"
        "async def main():\n"
        "    return 1\n"
        "uvloop.run(main())\n"
    )
    proc = subprocess.run(
        [sys.executable, "-c", after], capture_output=True, text=True, timeout=120
    )
    assert proc.returncode != 0, proc
    # The never-awaited coroutine's warning follows the traceback.
    assert (
        "TypeError: _patch_asyncio.<locals>.run() got an unexpected keyword "
        "argument 'loop_factory'" in proc.stderr
    ), proc.stderr


if __name__ == "__main__":
    asyncio.run(main())
