# /// script
# # Evidence for a known issue, not for a page step. On 3.13.0 through 3.13.2,
# # `linecache.updatecache` imports `sys` inside the function, and the sandbox's
# # `__import__` hook (EXECUTOR_DISALLOWED_MODULES includes `sys`) rejects it.
# # `traceback.format_exc()` then raises in the forked child, nothing reaches
# # the queue, and the client falls back to its no-output notice. CPython
# # 3.13.3 (commit 0980e2e370, gh-117174) wraps that import in
# # `try/except ImportError`, so from 3.13.3 on the traceback survives, as it
# # does on 3.12, where linecache imports `sys` at module level. Platform-
# # independent: it's stdlib code, not the RLIMIT path.
# requires-python = ">=3.13,<3.13.3"
# dependencies = [
#   "unitycatalog-ai==0.4.0",
#   "unitycatalog-langchain==0.4.0",
#   "langgraph-prebuilt==1.0.8",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-mlflow/compose.yaml"
# services = ["unitycatalog", "mlflow"]
# base-url-env = "UC_BASE_URL"
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""On Python 3.13.0-3.13.2, an error a catalog function raises is lost through the tool.

No regions: the page states the known issue, it doesn't show this code.
"""

import asyncio
import json
import os
import sys

from unitycatalog.client.exceptions import NotFoundException

CATALOG, SCHEMA = "py313", "errors"
NO_OUTPUT = "The function execution has completed, but no output was produced."


def always_fails(x: int) -> int:
    """Raise for any input.

    Args:
        x: Any number.
    """
    raise ValueError(f"no good: {x}")


async def main() -> None:
    from unitycatalog.ai.core.client import (
        UnitycatalogClient,
        UnitycatalogFunctionClient,
    )
    from unitycatalog.ai.langchain.toolkit import UCFunctionToolkit
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration

    assert (3, 13) <= sys.version_info[:3] < (3, 13, 3), sys.version
    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    api = ApiClient(config)
    try:
        try:
            await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
        except NotFoundException:
            pass
        uc = UnitycatalogClient(api_client=api)
        await uc.create_catalog_async(name=CATALOG)
        await uc.create_schema_async(name=SCHEMA, catalog_name=CATALOG)
        client = UnitycatalogFunctionClient(api_client=api)
        await client.create_python_function_async(
            func=always_fails, catalog=CATALOG, schema=SCHEMA
        )
        name = f"{CATALOG}.{SCHEMA}.always_fails"
        tool = UCFunctionToolkit(function_names=[name], client=client).tools[0]

        output = json.loads(tool.invoke({"x": 1}))
        print(output)
        # On 3.12 and 3.13.3+ this is {"error": "Traceback ... ValueError: no
        # good: 1"}. On 3.13.0-3.13.2 the key is the same but the traceback is
        # gone: the sandboxed child raises formatting it, and the client falls
        # back to its notice.
        assert set(output) == {"error"}, output
        assert output["error"].startswith(NO_OUTPUT), output
        assert "ValueError" not in output["error"], output
        assert "no good" not in output["error"], output

        await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
