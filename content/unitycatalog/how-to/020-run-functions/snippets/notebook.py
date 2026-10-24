# /// script
# requires-python = "==3.12.*"
# dependencies = ["unitycatalog-ai==0.4.0", "marimo==0.25.1"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The sandbox caps the child's address space at EXECUTOR_MAX_MEMORY_LIMIT MB
# # (default 100), which Linux enforces; see T05's first_function.py.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""Call a catalog function from notebook cells: a marimo notebook.

Each region is one cell's code. Open it with `marimo edit notebook.py`, or
run it as a script, as the tests do:

    uv run notebook.py

marimo's kernel runs every cell inside its running event loop; run as a
script, an app with an async cell runs its cells inside one loop too, so both
cells below see a running loop either way. The asserts at the bottom check
the cells' results.

Start the docs' local server from `uc-docs-env/unitycatalog` first:

    docker compose up -d --wait
"""

import marimo

app = marimo.App()


@app.cell
def _():
    # --8<-- [start:nb-connect]
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    client = UnitycatalogFunctionClient(api_client=ApiClient(config))
    # --8<-- [end:nb-connect]
    import asyncio as _asyncio
    import os as _os

    if _url := _os.environ.get("UC_BASE_URL"):
        config.host = _url
    # The client was built inside a running loop, which a plain script lacks.
    connect_loop = _asyncio.get_running_loop()
    return client, connect_loop


@app.cell
async def _(client):
    # --8<-- [start:nb-await]
    result = await client.execute_function_async(
        "tools.pricing.order_total",
        parameters={"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
    )
    print(result.value)  # 53.97
    # --8<-- [end:nb-await]
    return (result,)


@app.cell
def _(client):
    # --8<-- [start:nb-sync]
    sync_result = client.execute_function(
        "tools.pricing.order_total",
        parameters={"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
    )
    print(sync_result.value)  # 53.97
    # --8<-- [end:nb-sync]
    import asyncio as _asyncio

    sync_loop = _asyncio.get_running_loop()
    return sync_loop, sync_result


@app.cell
async def _(client, result, sync_result):
    # --8<-- [start:nb-close]
    await client.close_async()
    # --8<-- [end:nb-close]
    closed = client.uc.api_client.rest_client.pool_manager.closed
    return (closed,)


if __name__ == "__main__":
    import subprocess
    import sys
    from pathlib import Path

    here = Path(__file__).resolve().parent

    def _seed(step: str) -> None:
        # In a separate process, so the notebook's cells are the first to
        # import the client, as they are in a fresh notebook.
        code = (
            "import asyncio, os, sys\n"
            f"sys.path.insert(0, {str(here)!r})\n"
            "import seed\n"
            "from unitycatalog.client import ApiClient, Configuration\n"
            "async def go():\n"
            "    api = ApiClient(Configuration(host=os.environ.get('UC_BASE_URL',"
            " 'http://localhost:8080/api/2.1/unity-catalog')))\n"
            "    try:\n"
            f"        await seed.{step}(api)\n"
            "    finally:\n"
            "        await api.close()\n"
            "asyncio.run(go())\n"
        )
        subprocess.run([sys.executable, "-c", code], check=True, timeout=300)

    _seed("register_all")
    assert "unitycatalog.ai.core.client" not in sys.modules
    _, defs = app.run()
    # Top-level await works, and so does the sync call, because the client's
    # sync wrapper re-enters the cell's running loop (nest_asyncio).
    assert defs["result"].error is None and defs["result"].value == 53.97, defs[
        "result"
    ]
    assert defs["sync_result"].value == 53.97, defs["sync_result"]
    assert defs["connect_loop"] is defs["sync_loop"], "cells ran on different loops"
    assert defs["closed"] is True

    # The same cells in marimo's own runtime, the one `marimo edit` uses:
    # `marimo export html` runs every cell in a kernel session, headless.
    import os
    import shutil
    import tempfile

    cache = here / "__marimo__"
    with tempfile.TemporaryDirectory() as out:
        # The export saves a session cache in __marimo__/ beside the notebook,
        # unless sys.pycache_prefix is set: then marimo mirrors the path under
        # the prefix. Point it at the temp dir so the snippets stay clean.
        exported = subprocess.run(
            [
                sys.executable,
                "-m",
                "marimo",
                "export",
                "html",
                str(Path(__file__).resolve()),
                "-o",
                str(Path(out) / "notebook.html"),
            ],
            capture_output=True,
            text=True,
            timeout=300,
            env={**os.environ, "PYTHONPYCACHEPREFIX": out},
        )
    leaked = cache.exists()
    shutil.rmtree(cache, ignore_errors=True)  # fallback, so a failure doesn't linger
    assert not leaked, f"marimo wrote {cache}"
    assert exported.returncode == 0, exported
    # Both the await cell and the sync cell print the total; the export
    # forwards cell output to its stderr.
    printed = (exported.stdout + exported.stderr).split()
    assert printed.count("53.97") == 2, exported
    assert "Traceback" not in exported.stdout + exported.stderr, exported
    _seed("drop_all")
