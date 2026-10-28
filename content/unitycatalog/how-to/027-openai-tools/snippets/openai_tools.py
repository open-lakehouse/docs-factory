# /// script
# # 3.12, matching the page's session command. On 3.13.0-3.13.2 the function
# # sandbox can't format a traceback, so every error a function raises comes
# # back as the generic no-output notice (H13's error_py313.py).
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
# # The sandbox caps the child process's address space at
# # EXECUTOR_MAX_MEMORY_LIMIT MB (default 100); see T05's first_function.py.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# claims."unitycatalog-openai" = [
#   { journey = "function.tool", region = "toolkit", api = "UCFunctionToolkit" },
#   { journey = "function.tool-call", region = "loop", api = "chat.completions.create", note = "no agent framework; the caller runs each tool call" },
# ]
# ///
"""Turn Unity Catalog functions into Chat Completions tool definitions, run the
tool calls a model returns, and bound the tool-calling loop.

The regions are what a reader types into `python -m asyncio`, step by step. The
model is scripted: an `httpx.MockTransport` behind an `httpx.AsyncClient` given
to `AsyncOpenAI`, defined outside the regions, so no API key or network is
needed. The page tells the
reader to use their own server and model.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run openai_tools.py
"""

import asyncio
import datetime
import json
import os

from unitycatalog.client.exceptions import NotFoundException

PROMPT = "Price 3 units at 19.99 with 10% off, shipped express at 2 kg."


def ship_date(days: int) -> datetime.date:
    """
    Calculate the day an order ships.

    Args:
        days: Business days until shipping.
    """
    import datetime

    return datetime.date(2026, 10, 28) + datetime.timedelta(days=days)


class ScriptedModel:
    """A Chat Completions endpoint that answers from a script.

    Each request pops the next scripted reply: a list of tool calls, or a
    string for a final answer. With `tool_choice="none"` it always answers with
    text. Every request body is kept for the asserts.
    """

    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    def handler(self, request):
        import httpx

        body = json.loads(request.content)
        self.requests.append(body)
        reply = "Stopped after the round limit."
        if body.get("tool_choice") != "none":
            reply = self.replies.pop(0)
        if isinstance(reply, str):
            message = {"role": "assistant", "content": reply}
            finish = "stop"
        else:
            message = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": f"call-{len(self.requests)}-{i}",
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(args)},
                    }
                    for i, (name, args) in enumerate(reply)
                ],
            }
            finish = "tool_calls"
        return httpx.Response(
            200,
            json={
                "id": f"chatcmpl-{len(self.requests)}",
                "object": "chat.completion",
                "created": 0,
                "model": body["model"],
                "choices": [{"index": 0, "finish_reason": finish, "message": message}],
            },
        )

    def client(self):
        import httpx
        from openai import AsyncOpenAI

        return AsyncOpenAI(
            base_url="http://scripted.invalid/v1",
            api_key="scripted",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(self.handler)),
        )


ORDER = ("tools__pricing__order_total", {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0})
SHIPPING = ("tools__pricing__shipping_cost", {"weight_kg": 2.0, "express": True})


async def main() -> None:
    # --8<-- [start:connect]
    import os

    from openai import AsyncOpenAI
    from unitycatalog.ai.core.client import (
        UnitycatalogClient,
        UnitycatalogFunctionClient,
    )
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)

    llm = AsyncOpenAI(
        base_url="https://api.openai.com/v1", api_key=os.environ["OPENAI_API_KEY"]
    )
    model = os.environ["OPENAI_MODEL"]
    # --8<-- [end:connect]
    assert isinstance(llm, AsyncOpenAI), llm
    assert str(llm.base_url) == "https://api.openai.com/v1/", llm.base_url
    await llm.close()
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    try:
        await _reset(api)
        await _run(api, client, model, UnitycatalogClient, CatalogsApi)
    finally:
        await api.close()


async def _run(api, client, model, UnitycatalogClient, CatalogsApi) -> None:
    from unitycatalog.ai.openai.toolkit import UCFunctionToolkit

    # Without `client=`, the toolkit has no Unity Catalog client to fall back to
    # unless the Databricks SDK is installed (R01, as for LangChain).
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
    # Registered but never put in the toolkit: the allowlist cases call it.
    from pricing import gift_wrap_fee

    await client.create_python_function_async(
        func=gift_wrap_fee, catalog="tools", schema="pricing"
    )

    # --8<-- [start:toolkit]
    from unitycatalog.ai.openai.toolkit import UCFunctionToolkit

    toolkit = UCFunctionToolkit(
        function_names=[
            "tools.pricing.order_total",
            "tools.pricing.shipping_cost",
        ],
        client=client,
    )
    tools = toolkit.tools  # pass as tools= to chat.completions.create
    # --8<-- [end:toolkit]
    assert len(tools) == 2
    assert list(toolkit.tools_dict) == [
        "tools.pricing.order_total",
        "tools.pricing.shipping_cost",
    ], list(toolkit.tools_dict)

    # --8<-- [start:inspect]
    import json

    print(json.dumps(tools[0], indent=2))
    # {
    #   "type": "function",
    #   "function": {
    #     "name": "tools__pricing__order_total",
    #     "strict": true,
    #     "parameters": {
    #       "additionalProperties": false,
    #       "properties": {
    #         "quantity": {"description": "Number of units ordered.", "title": "Quantity", "type": "integer"},
    #         "unit_price": {"description": "Price of one unit.", "title": "Unit Price", "type": "number"},
    #         "discount_pct": {"default": 0.0, "description": "Discount in percent, from 0 to 100. (Default: 0.0)", ...}
    #       },
    #       "title": "tools__pricing__order_total__params",
    #       "type": "object",
    #       "required": ["quantity", "unit_price", "discount_pct"]
    #     },
    #     "description": "Calculate the total price of an order line after a percentage discount."
    #   }
    # }
    # --8<-- [end:inspect]
    order_def = tools[0]
    assert order_def["type"] == "function", order_def
    fn = order_def["function"]
    assert fn["name"] == "tools__pricing__order_total", fn
    assert fn["description"] == (
        "Calculate the total price of an order line after a percentage discount."
    ), fn
    assert fn["strict"] is True, fn
    params = fn["parameters"]
    assert params["type"] == "object" and params["additionalProperties"] is False, params
    assert list(params["properties"]) == ["quantity", "unit_price", "discount_pct"], params
    assert params["properties"]["quantity"]["type"] == "integer"
    assert params["properties"]["unit_price"]["type"] == "number"
    # Under strict, a parameter with a default is still required: the model
    # must always send it. The default stays as a hint in the schema.
    assert params["required"] == ["quantity", "unit_price", "discount_pct"], params
    assert params["properties"]["discount_pct"]["default"] == 0.0
    assert params["properties"]["discount_pct"]["description"] == (
        "Discount in percent, from 0 to 100. (Default: 0.0)"
    )
    shipping_def = tools[1]["function"]
    assert shipping_def["name"] == "tools__pricing__shipping_cost"
    assert shipping_def["parameters"]["properties"]["express"]["type"] == "boolean"
    assert shipping_def["strict"] is True
    # A definition is Chat Completions' nested {"type", "function": {...}}
    # shape, not the Responses API's flat one.
    assert set(order_def) == {"type", "function"}, order_def

    # --8<-- [start:wildcard]
    toolkit_all = UCFunctionToolkit(function_names=["tools.pricing.*"], client=client)
    # --8<-- [end:wildcard]
    assert sorted(t["function"]["name"] for t in toolkit_all.tools) == [
        "tools__pricing__gift_wrap_fee",
        "tools__pricing__order_total",
        "tools__pricing__shipping_cost",
    ], toolkit_all.tools
    # A wildcard expands when the toolkit is built: a function registered
    # afterwards isn't in the existing toolkit, only in a rebuilt one.
    before = [t["function"]["name"] for t in toolkit_all.tools]
    await client.create_python_function_async(
        func=ship_date, catalog="tools", schema="pricing"
    )
    assert [t["function"]["name"] for t in toolkit_all.tools] == before, toolkit_all.tools
    assert "tools.pricing.ship_date" not in toolkit_all.tools_dict
    rebuilt = UCFunctionToolkit(function_names=["tools.pricing.*"], client=client)
    assert "tools__pricing__ship_date" in [t["function"]["name"] for t in rebuilt.tools]

    from openai.types.chat import ChatCompletion

    def scripted_response(calls, choices=1):
        message = {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": f"call-{i}",
                    "type": "function",
                    "function": {"name": name, "arguments": json.dumps(args)},
                }
                for i, (name, args) in enumerate(calls)
            ],
        }
        return ChatCompletion.model_validate(
            {
                "id": "chatcmpl-scripted",
                "object": "chat.completion",
                "created": 0,
                "model": model,
                "choices": [
                    {"index": k, "finish_reason": "tool_calls", "message": message}
                    for k in range(choices)
                ],
            }
        )

    # The model answers the helper's request with two tool calls.
    helper_model = ScriptedModel([[ORDER, SHIPPING]])
    llm = helper_model.client()

    # The helper is sync and has no async variant. It is called directly, not
    # awaited and not through asyncio.to_thread: the client re-enters the
    # running loop (nest_asyncio), so other tasks keep running while the
    # functions run, and a worker thread fails (tool_schemas.py _event_loop).
    # --8<-- [start:helper]
    from unitycatalog.ai.openai.utils import generate_tool_call_messages

    prompt = "Price 3 units at 19.99 with 10% off, shipped express at 2 kg."
    response = await llm.chat.completions.create(
        model=model, messages=[{"role": "user", "content": prompt}], tools=tools
    )
    tool_messages = generate_tool_call_messages(response=response, client=client)
    for message in tool_messages:
        print(message["role"], message.get("content"))
    # assistant None
    # tool {"content": 53.97}
    # tool {"content": 14.0}
    # --8<-- [end:helper]
    assert prompt == PROMPT
    assert isinstance(response, ChatCompletion), type(response)
    assert len(helper_model.requests) == 1 and helper_model.requests[0]["tools"] == tools
    assert tool_messages[0]["role"] == "assistant"
    assert [m["role"] for m in tool_messages[1:]] == ["tool", "tool"], tool_messages
    assert [json.loads(m["content"]) for m in tool_messages[1:]] == [
        {"content": 53.97},
        {"content": 14.0},
    ], tool_messages
    assert [m["tool_call_id"] for m in tool_messages[1:]] == [
        c["id"] for c in tool_messages[0]["tool_calls"]
    ], tool_messages

    # The helper keeps only `result.value`: a function that raises comes back
    # as {"content": null}, and the traceback is lost.
    bad = ("tools__pricing__shipping_cost", {"weight_kg": -1.0, "express": False})
    dropped = generate_tool_call_messages(response=scripted_response([bad]), client=client)
    assert json.loads(dropped[1]["content"]) == {"content": None}, dropped
    direct = await client.execute_function_async(
        "tools.pricing.shipping_cost", parameters={"weight_kg": -1.0, "express": False}
    )
    assert direct.value is None and direct.error, direct
    assert direct.error.rstrip().endswith(
        "ValueError: weight_kg must be greater than zero"
    ), direct.error
    # The traceback is from the sandbox the client forks on this machine.
    assert "_sandboxed_wrapper" in direct.error, direct.error

    # The helper runs any catalog__schema__function name the model returns,
    # including a function that is not in the toolkit.
    outside = ("tools__pricing__gift_wrap_fee", {"items": 2})
    ran = generate_tool_call_messages(response=scripted_response([outside]), client=client)
    assert json.loads(ran[1]["content"]) == {"content": 3.0}, ran

    # The helper reads one choice (choice_index, default 0).
    two = generate_tool_call_messages(response=scripted_response([ORDER], choices=2), client=client)
    assert len(two) == 2, two

    # A name that doesn't split into three parts raises, as does a function the
    # catalog doesn't have (AttributeError from the client, R01).
    try:
        generate_tool_call_messages(
            response=scripted_response([("order_total", {})]), client=client
        )
    except ValueError as exc:
        assert "Invalid tool name: order_total" in str(exc), exc
    else:
        raise AssertionError("a two-part tool name should be rejected")

    # A JSON integer for a DOUBLE parameter fails the client's type check; the
    # schema's "number" allows it, so a model may send one. The helper raises.
    int_price = ("tools__pricing__order_total", {"quantity": 3, "unit_price": 20, "discount_pct": 0.0})
    try:
        generate_tool_call_messages(response=scripted_response([int_price]), client=client)
    except ValueError as exc:
        assert "Parameter unit_price should be of type ColumnTypeName.DOUBLE" in str(exc), exc
    else:
        raise AssertionError("an int for a DOUBLE parameter should be rejected")

    # The dispatcher awaits execute_function_async: it waits for the sandbox
    # process in an executor, so the loop keeps running while a function runs.
    # asyncio.to_thread around the sync execute_function fails instead
    # (tool_schemas.py _event_loop).
    # --8<-- [start:dispatch]
    allowed = {
        tool["function"]["name"]: function_name
        for function_name, tool in toolkit.tools_dict.items()
    }

    async def run_tool_calls(message):
        replies = []
        for call in message.tool_calls or []:
            function_name = allowed.get(call.function.name)
            if function_name is None:
                content = json.dumps({"error": f"Unknown tool: {call.function.name}"})
            else:
                try:
                    arguments = json.loads(call.function.arguments)
                    result = await client.execute_function_async(
                        function_name, parameters=arguments
                    )
                    content = result.to_json()
                except (ValueError, TypeError) as exc:
                    content = json.dumps({"error": str(exc)})
            replies.append({"role": "tool", "tool_call_id": call.id, "content": content})
        return replies
    # --8<-- [end:dispatch]
    assert allowed == {
        "tools__pricing__order_total": "tools.pricing.order_total",
        "tools__pricing__shipping_cost": "tools.pricing.shipping_cost",
    }, allowed

    # A model that asks for one tool round, then answers.
    await llm.close()
    scripted = ScriptedModel(
        [[ORDER, SHIPPING], "The order total is 53.97 and shipping is 14.0."]
    )
    llm = scripted.client()

    # --8<-- [start:loop]
    MAX_ROUNDS = 5

    prompt = "Price 3 units at 19.99 with 10% off, shipped express at 2 kg."
    messages = [{"role": "user", "content": prompt}]
    for _ in range(MAX_ROUNDS):
        response = await llm.chat.completions.create(
            model=model, messages=messages, tools=toolkit.tools
        )
        message = response.choices[0].message
        messages.append(message.to_dict())
        if not message.tool_calls:
            break
        messages += await run_tool_calls(message)
    else:
        response = await llm.chat.completions.create(
            model=model, messages=messages, tools=toolkit.tools, tool_choice="none"
        )
        messages.append(response.choices[0].message.to_dict())

    for message in messages:
        print(message["role"], message.get("content"))
    # user Price 3 units at 19.99 with 10% off, shipped express at 2 kg.
    # assistant None
    # tool {"format": "SCALAR", "value": 53.97}
    # tool {"format": "SCALAR", "value": 14.0}
    # assistant The order total is 53.97 and shipping is 14.0.
    # --8<-- [end:loop]
    assert [m["role"] for m in messages] == ["user", "assistant", "tool", "tool", "assistant"], messages
    assert [json.loads(m["content"]) for m in messages[2:4]] == [
        {"format": "SCALAR", "value": 53.97},
        {"format": "SCALAR", "value": 14.0},
    ], messages
    assert messages[-1]["content"] == "The order total is 53.97 and shipping is 14.0."
    assert len(scripted.requests) == 2, scripted.requests
    first = scripted.requests[0]
    # The model gets the definitions, never the function's source code.
    assert first["tools"] == tools, first["tools"]
    request_text = json.dumps(scripted.requests)
    assert "round(quantity" not in request_text and "def order_total" not in request_text
    # The second request carries the assistant turn and both tool results.
    second = scripted.requests[1]["messages"]
    assert [m["role"] for m in second] == ["user", "assistant", "tool", "tool"], second
    assert [m["tool_call_id"] for m in second[2:]] == [c["id"] for c in second[1]["tool_calls"]]

    # A model that never stops asking for tools: MAX_ROUNDS tool rounds, then
    # one call with tool_choice="none", which ends with text.
    endless = ScriptedModel([[ORDER]] * 5)
    await llm.close()
    llm = endless.client()
    messages = [{"role": "user", "content": PROMPT}]
    for _ in range(MAX_ROUNDS):
        response = await llm.chat.completions.create(
            model=model, messages=messages, tools=toolkit.tools
        )
        message = response.choices[0].message
        messages.append(message.to_dict())
        if not message.tool_calls:
            break
        messages += await run_tool_calls(message)
    else:
        response = await llm.chat.completions.create(
            model=model, messages=messages, tools=toolkit.tools, tool_choice="none"
        )
        messages.append(response.choices[0].message.to_dict())
    assert len(endless.requests) == MAX_ROUNDS + 1, len(endless.requests)
    assert [r.get("tool_choice") for r in endless.requests] == [None] * MAX_ROUNDS + ["none"]
    assert messages[-1] == {"role": "assistant", "content": "Stopped after the round limit."}, messages[-1]
    assert sum(m["role"] == "tool" for m in messages) == MAX_ROUNDS

    # --8<-- [start:test]
    from openai.types.chat import ChatCompletion

    response = ChatCompletion.model_validate(
        {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 0,
            "model": "test",
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call-ok",
                                "type": "function",
                                "function": {
                                    "name": "tools__pricing__order_total",
                                    "arguments": '{"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}',
                                },
                            },
                            {
                                "id": "call-error",
                                "type": "function",
                                "function": {
                                    "name": "tools__pricing__shipping_cost",
                                    "arguments": '{"weight_kg": -1.0, "express": false}',
                                },
                            },
                            {
                                "id": "call-unknown",
                                "type": "function",
                                "function": {
                                    "name": "tools__pricing__gift_wrap_fee",
                                    "arguments": '{"items": 2}',
                                },
                            },
                        ],
                    },
                }
            ],
        }
    )
    replies = await run_tool_calls(response.choices[0].message)
    for reply in replies:
        print(reply["tool_call_id"], json.loads(reply["content"]))
    # call-ok {'format': 'SCALAR', 'value': 53.97}
    # call-error {'error': 'Traceback (most recent call last): ... ValueError: weight_kg must be greater than zero\n'}
    # call-unknown {'error': 'Unknown tool: tools__pricing__gift_wrap_fee'}
    # --8<-- [end:test]
    by_id = {r["tool_call_id"]: json.loads(r["content"]) for r in replies}
    assert all(r["role"] == "tool" for r in replies), replies
    assert by_id["call-ok"] == {"format": "SCALAR", "value": 53.97}, by_id
    assert set(by_id["call-error"]) == {"error"}, by_id
    assert by_id["call-error"]["error"].startswith("Traceback (most recent call last):")
    assert by_id["call-error"]["error"].rstrip().endswith(
        "ValueError: weight_kg must be greater than zero"
    ), by_id
    assert by_id["call-unknown"] == {"error": "Unknown tool: tools__pricing__gift_wrap_fee"}, by_id

    # The dispatcher turns a type-check failure into a tool error the model
    # can read, where the helper raised.
    retry = await run_tool_calls(scripted_response([int_price]).choices[0].message)
    error = json.loads(retry[0]["content"])["error"]
    assert error.startswith("Invalid parameters provided:"), error
    assert "should be of type ColumnTypeName.DOUBLE" in error, error

    # A DATE return can't be serialized: result.to_json() raises TypeError
    # (R01, as in H13's tool_types.py RETURNS), and the dispatcher returns it
    # as a tool error instead of ending the loop.
    allowed["tools__pricing__ship_date"] = "tools.pricing.ship_date"
    dated = await client.execute_function_async("tools.pricing.ship_date", parameters={"days": 2})
    assert dated.value == datetime.date(2026, 10, 30), dated
    try:
        dated.to_json()
    except TypeError as exc:
        assert str(exc) == "Object of type date is not JSON serializable", exc
    else:
        raise AssertionError("a date result should not serialize")
    ship = await run_tool_calls(
        scripted_response([("tools__pricing__ship_date", {"days": 2})]).choices[0].message
    )
    assert json.loads(ship[0]["content"]) == {
        "error": "Object of type date is not JSON serializable"
    }, ship
    del allowed["tools__pricing__ship_date"]

    # A falsy return (0.0 at a 100% discount) comes back as the no-output
    # notice, not the value (R01).
    free = await run_tool_calls(
        scripted_response(
            [("tools__pricing__order_total", {"quantity": 3, "unit_price": 19.99, "discount_pct": 100.0})]
        ).choices[0].message
    )
    falsy = json.loads(free[0]["content"])
    assert set(falsy) == {"format", "value"}, falsy
    assert falsy["value"].startswith(
        "The function execution has completed, but no output was produced."
    ), falsy

    # --8<-- [start:clean-up]
    await CatalogsApi(api).delete_catalog(name="tools", force=True)
    await api.close()
    await llm.close()
    # --8<-- [end:clean-up]
    assert llm.is_closed(), llm


async def _reset(api) -> None:
    from unitycatalog.client import CatalogsApi

    try:
        await CatalogsApi(api).delete_catalog(name="tools", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    # The connect region reads these; the scripted model ignores them.
    os.environ.setdefault("OPENAI_API_KEY", "scripted")
    os.environ.setdefault("OPENAI_MODEL", "scripted-model")
    asyncio.run(main())
