# /// script
# # 3.12, matching the page's session command: on 3.13.0-3.13.2 the sandbox
# # loses tracebacks (see H13's error_py313.py).
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
# claims."unitycatalog-ai" = [
#   { journey = "function.execute", region = "sync", api = "execute_function" },
# ]
# ///
"""Call a catalog function from a plain, synchronous Python script.

The `sync` region is the reader's whole script: it runs with no event loop of
its own. The asserts around it pin what happens without the region's
`asyncio.run(connect())`, how repeated calls behave, and what closing does.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run run_sync.py
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

HOST = "http://localhost:8080/api/2.1/unity-catalog"
URL = os.environ.get("UC_BASE_URL", HOST)
CALL = {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}


def main() -> None:
    _with_api("register_all")

    # The region connects to the documented host; the harness serves there.
    assert URL.rstrip("/") == HOST, URL
    _no_loop_fails()

    # --8<-- [start:sync]
    import asyncio

    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    async def connect():
        config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
        return UnitycatalogFunctionClient(api_client=ApiClient(config))

    client = asyncio.run(connect())
    result = client.execute_function(
        "tools.pricing.order_total",
        parameters={"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
    )
    print(result.value)  # 53.97
    # --8<-- [end:sync]
    assert result.error is None and result.value == 53.97, result

    # Repeated sync calls on one client keep working: importing the client
    # applies nest_asyncio, whose asyncio.run reuses the thread's loop, the
    # one the connection was opened on.

    assert asyncio.run.__module__ == "nest_asyncio", asyncio.run.__module__
    for _ in range(3):
        again = client.execute_function("tools.pricing.order_total", parameters=CALL)
        assert again.value == 53.97, again
    assert client.get_function("tools.pricing.order_total").full_name == (
        "tools.pricing.order_total"
    )

    session = client.uc.api_client.rest_client.pool_manager
    # --8<-- [start:close]
    asyncio.run(client.close_async())
    # --8<-- [end:close]
    assert session.closed

    # close(), the context manager, and the atexit hook the client registers
    # don't close the connection: close() sets the closed flag, then calls
    # close_async(), which returns early because the flag is set.
    other = asyncio.run(_connect_to(URL))
    other_session = other.uc.api_client.rest_client.pool_manager
    other.close()
    assert not other_session.closed, "close() unexpectedly closed the session"
    asyncio.run(other.close_async())
    assert not other_session.closed, "close_async() after close() closed it"
    asyncio.run(other.uc.api_client.close())
    assert other_session.closed
    with asyncio.run(_connect_to(URL)) as ctx_client:
        ctx_session = ctx_client.uc.api_client.rest_client.pool_manager
        assert (
            ctx_client.execute_function(
                "tools.pricing.order_total", parameters=CALL
            ).value
            == 53.97
        )
    assert not ctx_session.closed, "__exit__ unexpectedly closed the session"
    asyncio.run(ctx_client.uc.api_client.close())
    assert ctx_session.closed

    _with_api("drop_all")


def _with_api(step: str) -> None:
    """Run one of seed.py's steps on a connection of its own."""
    from unitycatalog.client import ApiClient, Configuration

    import seed

    async def go():
        api = ApiClient(Configuration(host=URL))
        try:
            await getattr(seed, step)(api)
        finally:
            await api.close()

    asyncio.run(go())


async def _connect_to(url: str):
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    return UnitycatalogFunctionClient(api_client=ApiClient(Configuration(host=url)))


def _no_loop_fails() -> None:
    """Without a running loop, building the ApiClient fails: aiohttp's
    connector needs one."""
    from unitycatalog.client import ApiClient, Configuration

    try:
        ApiClient(Configuration(host=URL))
    except RuntimeError as exc:
        assert str(exc) == "no running event loop", exc
    else:
        raise AssertionError("an ApiClient outside a loop should fail")


if __name__ == "__main__":
    main()
