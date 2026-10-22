# /// script
# # 3.12, matching the page's session command. On 3.13.0-3.13.2 the function
# # sandbox can't format a traceback (it blocks the `import sys` linecache does
# # lazily), so every error a function raises comes back as the generic
# # no-output notice; see error_py313.py. 3.13.3 and later keep the traceback.
# requires-python = "==3.12.*"
# dependencies = [
#   "unitycatalog-ai==0.4.0",
#   "unitycatalog-langchain==0.4.0",
#   # unitycatalog-langchain caps langchain, which holds langgraph at 1.0.10;
#   # langgraph-prebuilt 1.0.9 and later need a newer langgraph, and
#   # `import langchain.agents` fails with their ImportError.
#   "langgraph-prebuilt==1.0.8",
#   "mlflow==3.10.0",
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
#   { journey = "function.tool-call", region = "agent", api = "create_agent", note = "through an async adapter; `toolkit.tools` as-is fails in LangGraph's tool threads" },
# ]
# ///
"""Turn Unity Catalog functions into LangChain tools, inspect them, call them,
and hand them to an agent.

The regions are what a reader types into `python -m asyncio`, step by step. The
stand-in chat model is defined outside the regions, so no API key is needed;
the page tells the reader to pass their own model.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run tools.py
"""

import asyncio
import json
import os
import tempfile

from unitycatalog.client.exceptions import NotFoundException


def _stand_in_model(tool_calls):
    """A scripted chat model: each turn returns the next scripted message.

    It stands in for a real provider model in CI. `create_agent` binds tools to
    the model; the stand-in ignores them because its replies are fixed.
    """
    from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
    from langchain_core.messages import AIMessage

    class ScriptedChatModel(GenericFakeChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    messages = [AIMessage(content="", tool_calls=[call]) for call in tool_calls] + [
        AIMessage(content="The order total is 53.97 and shipping is 14.0.")
    ]
    return ScriptedChatModel(messages=iter(messages))


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

    # Without `client=`, the toolkit has no Unity Catalog client to fall back to
    # unless the Databricks SDK is installed.
    try:
        UCFunctionToolkit(function_names=["tools.pricing.order_total"])
    except ValueError as exc:
        assert "No client provided" in str(exc), exc
        assert "set_uc_function_client" in str(exc), exc
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

    # --8<-- [start:wildcard]
    toolkit = UCFunctionToolkit(function_names=["tools.pricing.*"], client=client)
    # --8<-- [end:wildcard]
    assert sorted(t.name for t in toolkit.tools) == [
        "tools__pricing__order_total",
        "tools__pricing__shipping_cost",
    ]
    # A wildcard toolkit picks up any function registered in the schema later.
    from pricing import gift_wrap_fee

    await client.create_python_function_async(
        func=gift_wrap_fee, catalog="tools", schema="pricing"
    )
    later = UCFunctionToolkit(function_names=["tools.pricing.*"], client=client)
    assert "tools__pricing__gift_wrap_fee" in [t.name for t in later.tools]
    explicit = UCFunctionToolkit(
        function_names=["tools.pricing.order_total", "tools.pricing.shipping_cost"],
        client=client,
    )
    assert "tools__pricing__gift_wrap_fee" not in [t.name for t in explicit.tools]
    await client.delete_function_async("tools.pricing.gift_wrap_fee")

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
    assert tools[1].args["express"]["type"] == "boolean"

    # --8<-- [start:call-tool]
    output = order_tool.invoke(
        {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}
    )
    print(output)  # {"format": "SCALAR", "value": 53.97}
    print(json.loads(output)["value"])  # 53.97
    # --8<-- [end:call-tool]
    assert json.loads(output) == {"format": "SCALAR", "value": 53.97}, output

    # The tool's schema converts an int to the declared DOUBLE before the
    # client's type check, which rejects an int when called directly (T05).
    converted = json.loads(order_tool.invoke({"quantity": 3, "unit_price": 20}))
    assert converted == {"format": "SCALAR", "value": 60.0}, converted

    # --8<-- [start:call-error]
    shipping_tool = tools[1]
    output = shipping_tool.invoke({"weight_kg": -1.0, "express": False})
    print(json.loads(output)["error"])
    # Traceback (most recent call last): ... ValueError: weight_kg must be greater than zero
    # --8<-- [end:call-error]
    error = json.loads(output)
    assert set(error) == {"error"}, error
    assert error["error"].startswith("Traceback (most recent call last):"), error
    assert (
        error["error"]
        .rstrip()
        .endswith("ValueError: weight_kg must be greater than zero")
    ), error

    # --8<-- [start:invalid-args]
    from pydantic import ValidationError

    try:
        order_tool.invoke({"quantity": "three", "unit_price": 19.99})
    except ValidationError as exc:
        print(exc)  # quantity: Input should be a valid integer ...
    # --8<-- [end:invalid-args]
    else:
        raise AssertionError("a string for an INT parameter should be rejected")
    try:
        order_tool.invoke({"quantity": 3, "unit_price": 1.0, "coupon": "X"})
    except ValidationError as exc:
        assert "Extra inputs are not permitted" in str(exc), exc
    else:
        raise AssertionError("an undeclared argument should be rejected")

    # --8<-- [start:falsy]
    output = order_tool.invoke({"quantity": 0, "unit_price": 19.99})
    print(json.loads(output)["value"])
    # The function execution has completed, but no output was produced. ...
    # --8<-- [end:falsy]
    falsy = json.loads(output)["value"]
    assert isinstance(falsy, str) and falsy.startswith(
        "The function execution has completed, but no output was produced."
    ), falsy

    # `toolkit.tools` as-is fail inside an agent: LangGraph runs sync tools in
    # worker threads, and the client's aiohttp session belongs to this loop.
    from langchain.agents import create_agent

    plain = create_agent(
        _stand_in_model(
            [
                {
                    "name": "tools__pricing__order_total",
                    "args": {"quantity": 1, "unit_price": 1.0},
                    "id": "c0",
                }
            ]
        ),
        tools=tools,
    )
    try:
        plain.invoke({"messages": [{"role": "user", "content": "go"}]})
    except RuntimeError as exc:
        assert "attached to a different loop" in str(exc), exc
    else:
        raise AssertionError("toolkit.tools should fail in an agent's tool thread")
    try:
        await create_agent(
            _stand_in_model(
                [
                    {
                        "name": "tools__pricing__order_total",
                        "args": {"quantity": 1, "unit_price": 1.0},
                        "id": "c0",
                    }
                ]
            ),
            tools=tools,
        ).ainvoke({"messages": [{"role": "user", "content": "go"}]})
    except RuntimeError as exc:
        assert "Timeout context manager should be used inside a task" in str(exc), exc
    else:
        raise AssertionError("toolkit.tools should fail in an agent's tool thread")

    model = _stand_in_model(
        [
            {
                "name": "tools__pricing__order_total",
                "args": {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
                "id": "call-1",
            },
            {
                "name": "tools__pricing__shipping_cost",
                "args": {"weight_kg": 2.0, "express": True},
                "id": "call-2",
            },
        ]
    )

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

    # The tracking store below is a file in the working directory; keep the
    # run's copy out of the script's folder.
    os.chdir(tempfile.mkdtemp())

    # --8<-- [start:autolog]
    import mlflow

    mlflow.set_tracking_uri("sqlite:///mlflow.db")
    mlflow.langchain.autolog()
    # --8<-- [end:autolog]

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
        print(message.type, message.content)
    # --8<-- [end:agent]
    by_type = [(m.type, m.content) for m in result["messages"]]
    tool_messages = [m for m in result["messages"] if m.type == "tool"]
    assert [m.name for m in tool_messages] == [
        "tools__pricing__order_total",
        "tools__pricing__shipping_cost",
    ], by_type
    assert [json.loads(m.content) for m in tool_messages] == [
        {"format": "SCALAR", "value": 53.97},
        {"format": "SCALAR", "value": 14.0},
    ], by_type
    assert all(m.status == "success" for m in tool_messages), by_type
    assert by_type[-1][0] == "ai"

    # --8<-- [start:traces]
    trace = mlflow.search_traces(max_results=1, return_type="list")[0]
    for span in trace.data.spans:
        print(span.span_type, span.name)
    # CHAIN LangGraph
    # CHAIN model
    # CHAT_MODEL ...
    # CHAIN tools
    # TOOL tools__pricing__order_total
    # ...
    # --8<-- [end:traces]
    _assert_trace(mlflow, trace)

    # --8<-- [start:clean-up]
    await CatalogsApi(api).delete_catalog(name="tools", force=True)
    await api.close()
    # --8<-- [end:clean-up]


def _assert_trace(mlflow, trace) -> None:
    """One trace per agent run: the graph, each model turn, each tool call."""
    assert len(mlflow.search_traces(return_type="list")) == 1
    assert trace.info.state == "OK", trace.info
    spans = trace.data.spans
    by_id = {s.span_id: s for s in spans}
    roots = [s for s in spans if s.parent_id is None]
    assert [(r.span_type, r.name) for r in roots] == [("CHAIN", "LangGraph")], roots
    shape = [(s.span_type, s.name) for s in spans]
    assert shape.count(("CHAT_MODEL", "ScriptedChatModel")) == 3, shape
    tool_spans = [s for s in spans if s.span_type == "TOOL"]
    assert [s.name for s in tool_spans] == [
        "tools__pricing__order_total",
        "tools__pricing__shipping_cost",
    ], shape
    for s in tool_spans:
        parent = by_id[s.parent_id]
        assert (parent.span_type, parent.name) == ("CHAIN", "tools"), shape
        assert by_id[parent.parent_id].name == "LangGraph", shape
    order = tool_spans[0]
    # The tool span records the arguments the model sent and the tool message.
    assert order.inputs == {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}
    assert order.outputs["tool_call_id"] == "call-1", order.outputs
    assert json.loads(order.outputs["content"]) == {"format": "SCALAR", "value": 53.97}


async def _reset(api) -> None:
    from unitycatalog.client import CatalogsApi

    try:
        await CatalogsApi(api).delete_catalog(name="tools", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())
