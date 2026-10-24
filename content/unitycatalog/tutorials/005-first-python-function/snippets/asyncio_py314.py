# /// script
# # Evidence for a known issue, not for a page step. Importing
# # `unitycatalog.ai.core.client` calls `nest_asyncio.apply()`, which replaces
# # the running loop's `run_until_complete` with one that doesn't run its
# # coroutine as a task. On 3.14, `asyncio.run` closes by awaiting
# # `shutdown_default_executor` under `asyncio.timeout`, which needs a current
# # task, so a program that used the default executor (as executing a catalog
# # function does) exits 1 after its work is done. 3.12 and 3.13 don't.
# requires-python = ">=3.14,<3.15"
# dependencies = ["unitycatalog-ai==0.4.0"]
# ///
"""On Python 3.14, asyncio.run fails at exit once unitycatalog-ai's client is imported.

No regions: the page states the known issue, it doesn't show this code.
"""

import asyncio


async def main() -> None:
    # Imported inside the running loop, as a session's `from ... import` is.
    import unitycatalog.ai.core.client  # noqa: F401

    await asyncio.get_running_loop().run_in_executor(None, lambda: None)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except RuntimeError as e:
        assert "Timeout should be used inside a task" in str(e), e
    else:
        raise AssertionError("asyncio.run exited cleanly; the known issue is gone")
