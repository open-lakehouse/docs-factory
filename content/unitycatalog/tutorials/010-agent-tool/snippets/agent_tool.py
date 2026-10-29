# /// script
# # 3.12, matching the page's session command. On 3.13.0-3.13.2 the function
# # sandbox can't format a traceback, and on 3.14 the session exits 1 after
# # asyncio.run (see T05's asyncio_py314.py and H13's error_py313.py).
# requires-python = "==3.12.*"
# dependencies = [
#   "unitycatalog-ai==0.4.0",
#   "unitycatalog-langchain==0.4.0",
#   # unitycatalog-langchain caps langchain, which holds langgraph at 1.0.10;
#   # langgraph-prebuilt 1.0.9 and later need a newer langgraph, and
#   # `import langchain.agents` fails with their ImportError.
#   "langgraph-prebuilt==1.0.8",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The sandbox caps the child process's address space at
# # EXECUTOR_MAX_MEMORY_LIMIT MB (default 100); see T05's first_function.py.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# claims."unitycatalog-langchain" = [
#   { journey = "function.tool", region = "toolkit", api = "UCFunctionToolkit" },
#   { journey = "function.tool-call", region = "agent", api = "create_agent", note = "through an async adapter" },
# ]
# ///
"""Register two catalog functions, turn them into LangChain tools, call one,
and let an agent call both.

The regions are what a reader types into `python -m asyncio`, step by step.
The chat model is a scripted stand-in (region `model`), so no API key is
needed; real_model.py swaps in a provider model and is not run in CI.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run agent_tool.py
"""

import asyncio
import contextlib
import io
import json
import os

from unitycatalog.client.exceptions import NotFoundException

ANSWER = "The order total is 53.97 and shipping is 14.0."


def _one_call_model():
    """A scripted model that asks for one tool call, for the failure checks."""
    from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
    from langchain_core.messages import AIMessage

    class OneCall(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    call = {
        "name": "tools__pricing__order_total",
        "args": {"quantity": 1, "unit_price": 1.0},
        "id": "c0",
    }
    return OneCall(
        messages=iter([AIMessage(content="", tool_calls=[call]), AIMessage("done")])
    )


async def main() -> None:
    # --8<-- [start:connect]
    from unitycatalog.ai.core.client import (
        UnitycatalogClient,
        UnitycatalogFunctionClient,
    )
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)
    # --8<-- [end:connect]
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    try:
        await _reset(api)
        await _run(api, client, UnitycatalogClient, CatalogsApi)
    finally:
        await api.close()


async def _run(api, client, UnitycatalogClient, CatalogsApi) -> None:
    from unitycatalog.ai.langchain.toolkit import UCFunctionToolkit

    # Without `client=` (and no default client set), the toolkit is rejected.
    try:
        UCFunctionToolkit(function_names=["tools.pricing.order_total"])
    except ValueError as exc:
        assert "No client provided" in str(exc), exc
    else:
        raise AssertionError("a toolkit without a client should be rejected")

    # --8<-- [start:namespace]
    uc = UnitycatalogClient(api_client=api)
    await uc.create_catalog_async(name="tools", comment="Functions for apps and agents")
    await uc.create_schema_async(name="pricing", catalog_name="tools")
    # --8<-- [end:namespace]

    # --8<-- [start:register]
    from pricing import order_total, shipping_cost

    for func in (order_total, shipping_cost):
        await client.create_python_function_async(
            func=func, catalog="tools", schema="pricing"
        )
    # --8<-- [end:register]
    listed = await client.list_functions_async(catalog="tools", schema="pricing")
    assert sorted(f.name for f in listed) == ["order_total", "shipping_cost"], listed

    # --8<-- [start:toolkit]
    from unitycatalog.ai.langchain.toolkit import UCFunctionToolkit

    toolkit = UCFunctionToolkit(
        function_names=[
            "tools.pricing.order_total",
            "tools.pricing.shipping_cost",
        ],
        client=client,
    )
    tools = toolkit.tools
    # --8<-- [end:toolkit]
    assert len(tools) == 2

    # --8<-- [start:tool-names]
    print([tool.name for tool in tools])
    # ['tools__pricing__order_total', 'tools__pricing__shipping_cost']
    # --8<-- [end:tool-names]
    assert [t.name for t in tools] == [
        "tools__pricing__order_total",
        "tools__pricing__shipping_cost",
    ]
    assert [t.uc_function_name for t in tools] == [
        "tools.pricing.order_total",
        "tools.pricing.shipping_cost",
    ]

    # --8<-- [start:inspect]
    order_tool = tools[0]
    print(order_tool.description)
    print(order_tool.args)
    # --8<-- [end:inspect]
    assert order_tool.description == (
        "Calculate the total price of an order line after a percentage discount."
    ), order_tool.description
    args = order_tool.args
    assert list(args) == ["quantity", "unit_price", "discount_pct"], args
    assert args["quantity"]["type"] == "integer"
    assert args["quantity"]["description"] == "Number of units ordered."
    assert args["unit_price"]["type"] == "number"
    assert args["discount_pct"]["default"] == 0.0
    assert args["discount_pct"]["description"] == (
        "Discount in percent, from 0 to 100. (Default: 0.0)"
    ), args["discount_pct"]
    assert list(tools[1].args) == ["weight_kg", "express"], tools[1].args
    assert tools[1].args["express"]["type"] == "boolean"

    # --8<-- [start:call-tool]
    output = order_tool.invoke(
        {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}
    )
    print(output)  # {"format": "SCALAR", "value": 53.97}
    # --8<-- [end:call-tool]
    assert json.loads(output) == {"format": "SCALAR", "value": 53.97}, output

    # `toolkit.tools` as built fail inside an agent: LangGraph runs sync tools in
    # worker threads, and the client's aiohttp session belongs to this loop.
    from langchain.agents import create_agent

    go = {"messages": [{"role": "user", "content": "go"}]}
    try:
        create_agent(_one_call_model(), tools=tools).invoke(go)
    except RuntimeError as exc:
        assert "attached to a different loop" in str(exc), exc
    else:
        raise AssertionError("toolkit.tools should fail in an agent's tool thread")
    try:
        await create_agent(_one_call_model(), tools=tools).ainvoke(go)
    except RuntimeError as exc:
        assert "Timeout context manager should be used inside a task" in str(exc), exc
    else:
        raise AssertionError("toolkit.tools should fail in an agent's tool thread")

    # --8<-- [start:async-tools]
    def run_on_this_loop(tool):
        async def run(**arguments):
            result = await client.execute_function_async(
                tool.uc_function_name, parameters=arguments
            )
            return result.to_json()

        tool.coroutine = run
        return tool

    agent_tools = [run_on_this_loop(tool) for tool in tools]
    # --8<-- [end:async-tools]
    assert [t.name for t in agent_tools] == [t.name for t in tools]

    # --8<-- [start:model]
    from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
    from langchain_core.messages import AIMessage

    class ScriptedChatModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    order_call = {
        "name": "tools__pricing__order_total",
        "args": {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
        "id": "call-1",
    }
    shipping_call = {
        "name": "tools__pricing__shipping_cost",
        "args": {"weight_kg": 2.0, "express": True},
        "id": "call-2",
    }
    model = ScriptedChatModel(
        messages=iter(
            [
                AIMessage(content="", tool_calls=[order_call]),
                AIMessage(content="", tool_calls=[shipping_call]),
                AIMessage(content="The order total is 53.97 and shipping is 14.0."),
            ]
        )
    )
    # --8<-- [end:model]

    # Capture what the region prints, to check it against the output comment.
    printed = io.StringIO()
    capture = contextlib.redirect_stdout(printed)
    capture.__enter__()
    # --8<-- [start:agent]
    from langchain.agents import create_agent

    agent = create_agent(model, tools=agent_tools)
    result = await agent.ainvoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Price 3 units at 19.99 with 10% off, shipped express at 2 kg.",
                }
            ]
        }
    )
    for message in result["messages"]:
        if message.type == "ai" and message.tool_calls:
            for call in message.tool_calls:
                print("ai ->", call["name"], call["args"])
        else:
            print(message.type, message.content)
    # human Price 3 units at 19.99 with 10% off, shipped express at 2 kg.
    # ai -> tools__pricing__order_total {'quantity': 3, 'unit_price': 19.99, 'discount_pct': 10.0}
    # tool {"format": "SCALAR", "value": 53.97}
    # ai -> tools__pricing__shipping_cost {'weight_kg': 2.0, 'express': True}
    # tool {"format": "SCALAR", "value": 14.0}
    # ai The order total is 53.97 and shipping is 14.0.
    # --8<-- [end:agent]
    capture.__exit__(None, None, None)
    print(printed.getvalue(), end="")
    _assert_agent_output(printed.getvalue())
    messages = result["messages"]
    assert [m.type for m in messages] == ["human", "ai", "tool", "ai", "tool", "ai"], [
        (m.type, m.content) for m in messages
    ]
    tool_messages = [m for m in messages if m.type == "tool"]
    assert [m.name for m in tool_messages] == [
        "tools__pricing__order_total",
        "tools__pricing__shipping_cost",
    ]
    assert [m.tool_call_id for m in tool_messages] == ["call-1", "call-2"]
    assert [json.loads(m.content) for m in tool_messages] == [
        {"format": "SCALAR", "value": 53.97},
        {"format": "SCALAR", "value": 14.0},
    ], tool_messages
    assert all(m.status == "success" for m in tool_messages), tool_messages
    assert messages[-1].content == ANSWER, messages[-1]

    # --8<-- [start:clean-up]
    await CatalogsApi(api).delete_catalog(name="tools", force=True)
    await api.close()
    # --8<-- [end:clean-up]
    from unitycatalog.client import ApiClient

    check = ApiClient(api.configuration)
    try:
        await CatalogsApi(check).get_catalog("tools")
    except NotFoundException:
        pass
    else:
        raise AssertionError("the tools catalog should be gone")
    finally:
        await check.close()


AGENT_OUTPUT = [
    "human Price 3 units at 19.99 with 10% off, shipped express at 2 kg.",
    "ai -> tools__pricing__order_total"
    " {'quantity': 3, 'unit_price': 19.99, 'discount_pct': 10.0}",
    'tool {"format": "SCALAR", "value": 53.97}',
    "ai -> tools__pricing__shipping_cost {'weight_kg': 2.0, 'express': True}",
    'tool {"format": "SCALAR", "value": 14.0}',
    "ai The order total is 53.97 and shipping is 14.0.",
]


def _assert_agent_output(printed: str) -> None:
    """The `agent` region prints each tool call (name and args), each tool
    result, and the answer, and its output comment shows exactly that."""
    assert printed.splitlines() == AGENT_OUTPUT, printed
    source = open(__file__).read()
    # Built from parts so the region markers stay unique in this file.
    start, end = "[start" + ":agent]", "[end" + ":agent]"
    region = source.split(start)[1].split(end)[0]
    shown = [
        line.strip()[2:]
        for line in region.splitlines()
        if line.strip().startswith("# ") and "--8<--" not in line
    ]
    assert shown == AGENT_OUTPUT, shown


async def _reset(api) -> None:
    from unitycatalog.client import CatalogsApi

    try:
        await CatalogsApi(api).delete_catalog(name="tools", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())
