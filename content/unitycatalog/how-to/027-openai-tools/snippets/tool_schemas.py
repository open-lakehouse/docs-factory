# /// script
# requires-python = "==3.12.*"
# dependencies = [
#   "unitycatalog-ai==0.4.0",
#   "unitycatalog-openai==0.4.0",
#   # unitycatalog-openai 0.4.0 requires openai<=2.24.0; see release.yml.
#   "openai==2.24.0",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""What the OpenAI toolkit does to a function's schema and name, beyond the
page's walkthrough: the `strict` flag, how UC types reach the function, how
tool names map back, and what `filter_accessible_functions` sees.

No regions: this script is evidence for the page's notes and R01 rows.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run tool_schemas.py
"""

import asyncio
import datetime
import json
import os

from unitycatalog.client.exceptions import NotFoundException

CATALOG = "tool_schemas"


def tag_day(day: datetime.date, label: str) -> str:
    """
    Label a calendar day.

    Args:
        day: The day to label.
        label: The label to attach.
    """
    return f"{label}: {day.isoformat()}"


def label_day(label: str, day: datetime.date) -> str:
    """
    Label a calendar day.

    Args:
        label: The label to attach.
        day: The day to label.
    """
    return f"{label}: {day.isoformat()}"


def answer() -> int:
    """Return the answer."""
    return 42


async def main() -> None:
    from unitycatalog.ai.core.client import UnitycatalogClient, UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)
    try:
        try:
            await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
        except NotFoundException:
            pass
        uc = UnitycatalogClient(api_client=api)
        await uc.create_catalog_async(name=CATALOG)
        await uc.create_schema_async(name="days", catalog_name=CATALOG)
        for func in (tag_day, label_day, answer):
            await client.create_python_function_async(func=func, catalog=CATALOG, schema="days")
        await _strict(client)
        await _types(client)
        _names()
        await _permissions(client)
        await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
    finally:
        await api.close()


def _definition(client, name):
    from unitycatalog.ai.openai.toolkit import UCFunctionToolkit

    return UCFunctionToolkit(function_names=[f"{CATALOG}.days.{name}"], client=client).tools[0]


async def _strict(client) -> None:
    """`strict` comes from the last parameter only.

    DATE isn't a JSON Schema type, so a function with a DATE parameter should
    not be strict. The flag is read from the last parameter alone, so the
    parameter order decides it (ai-v0.4.0 function_processing_utils.py
    generate_function_input_params_schema; fixed upstream by #2012).
    """
    first = _definition(client, "tag_day")["function"]
    last = _definition(client, "label_day")["function"]
    assert first["strict"] is True, first
    assert last["strict"] is False, last
    # Same parameters, same schema for the DATE parameter either way.
    assert first["parameters"]["properties"]["day"] == last["parameters"]["properties"]["day"]
    assert first["parameters"]["properties"]["day"]["anyOf"] == [
        {"format": "date", "type": "string"},
        {"type": "string"},
    ], first["parameters"]["properties"]["day"]
    # Under strict every property is required, whatever its order.
    assert first["parameters"]["required"] == ["day", "label"], first
    assert last["parameters"]["required"] == ["label", "day"], last
    # A function with no parameters is strict, with an empty object schema.
    none = _definition(client, "answer")["function"]
    assert none["strict"] is True, none
    assert none["parameters"]["properties"] == {} and none["parameters"]["required"] == [], none


async def _types(client) -> None:
    """Tool-call arguments are JSON; the client checks Python types.

    A DATE argument arrives as an ISO string and fails the type check, so a
    DATE parameter can't be called from a tool call. A direct call with a
    `datetime.date` works.
    """
    name = f"{CATALOG}.days.tag_day"
    try:
        await client.execute_function_async(name, parameters={"day": "2026-10-28", "label": "x"})
    except ValueError as exc:
        assert "Parameter day should be of type ColumnTypeName.DATE" in str(exc), exc
        assert "but got <class 'str'>" in str(exc), exc
    else:
        raise AssertionError("an ISO date string should fail the DATE type check")
    ok = await client.execute_function_async(
        name, parameters={"day": datetime.date(2026, 10, 28), "label": "x"}
    )
    assert ok.value == "x: 2026-10-28", ok
    # The tool messages a dispatcher sends back are JSON too.
    assert json.loads(ok.to_json()) == {"format": "SCALAR", "value": "x: 2026-10-28"}


def _names() -> None:
    """Tool names are `catalog__schema__function`, cut to the last 64 chars.

    Mapping a name back needs exactly three `__`-separated parts, so a name
    with `__` in it, or one that was cut, can't be mapped back
    (function_processing_utils.py get_tool_name, construct_original_function_name).
    """
    from unitycatalog.ai.core.utils.function_processing_utils import (
        construct_original_function_name,
        get_tool_name,
    )

    assert get_tool_name("tools.pricing.order_total") == "tools__pricing__order_total"
    assert construct_original_function_name("tools__pricing__order_total") == (
        "tools.pricing.order_total"
    )
    dunder = get_tool_name("tools.pricing.order__total")
    assert dunder == "tools__pricing__order__total", dunder
    long = get_tool_name("tools.pricing." + "f" * 60)
    assert len(long) == 64 and not long.startswith("tools__"), long
    for name in (dunder, long):
        try:
            construct_original_function_name(name)
        except ValueError as exc:
            assert str(exc) == f"Invalid tool name: {name}", exc
        else:
            raise AssertionError(f"{name} should not map back")


async def _permissions(client) -> None:
    """`filter_accessible_functions` only skips a function on PermissionError.

    The OSS client raises the generated `ForbiddenException`, which isn't a
    PermissionError, so the flag can't skip a function the server refuses.
    The docs' servers run without authorization, so this pins the exception
    type, not a 403.
    """
    from unitycatalog.client.exceptions import ForbiddenException

    assert not issubclass(ForbiddenException, PermissionError), ForbiddenException.__mro__
    # A function the catalog doesn't have isn't skipped either: the client's
    # get_function returns None for a 404, and building the schema raises.
    from unitycatalog.ai.openai.toolkit import UCFunctionToolkit

    try:
        UCFunctionToolkit(
            function_names=[f"{CATALOG}.days.no_such_function"],
            client=client,
            filter_accessible_functions=True,
        )
    except TypeError as exc:
        assert str(exc) == "Unsupported function info type: <class 'NoneType'>", exc
    else:
        raise AssertionError("a missing function should not build a tool")


if __name__ == "__main__":
    asyncio.run(main())
