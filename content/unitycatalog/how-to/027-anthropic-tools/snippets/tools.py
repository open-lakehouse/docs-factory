# /// script
# # 3.12, matching the page's session command. On 3.13.0-3.13.2 the function
# # sandbox can't format a traceback, so every error a function raises comes
# # back as the generic no-output notice (see H13's error_py313.py).
# requires-python = "==3.12.*"
# dependencies = [
#   "unitycatalog-ai==0.4.0",
#   "unitycatalog-anthropic==0.2.0",
#   "anthropic==1.17.0",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# # The sandbox caps the child process's address space at
# # EXECUTOR_MAX_MEMORY_LIMIT MB (default 100); see T05's first_function.py.
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# claims."unitycatalog-anthropic" = [
#   { journey = "function.tool", region = "toolkit", api = "UCFunctionToolkit" },
#   { journey = "function.tool-call", region = "multi-round", api = "messages.create", note = "with your own tool loop; `generate_tool_call_messages` runs any function and drops errors" },
# ]
# ///
"""Turn Unity Catalog functions into Messages API tool definitions, send them
to Claude, run each `tool_use` block, and send the results back.

The regions are what a reader types into `python -m asyncio`, step by step.
A whole-script run never reaches Claude: it starts a stand-in Messages API on
a local port (outside the regions), points `ANTHROPIC_BASE_URL` at it with a
dummy `ANTHROPIC_API_KEY`, and scripts the model's turns. The stand-in also
checks what the regions send: the tools array is the toolkit's definitions,
and each follow-up request carries the assistant's `tool_use` blocks and a
`tool_result` for each, with the matching `tool_use_id`.

It imports the functions from `pricing.py`, which must sit beside it: the
same file the page asks you to save in the folder where the session runs.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run tools.py
"""

import asyncio
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from unitycatalog.client.exceptions import NotFoundException

MODEL = "claude-opus-5-5"
ORDER = "tools__pricing__order_total"
SHIPPING = "tools__pricing__shipping_cost"


# --- the stand-in Messages API -------------------------------------------


def _message(content, stop_reason):
    return {
        "id": "msg_stub",
        "type": "message",
        "role": "assistant",
        "model": MODEL,
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 1, "output_tokens": 1},
    }


def _tool_use(id, name, arguments):
    return {"type": "tool_use", "id": id, "name": name, "input": arguments}


def _text(text):
    return {"type": "text", "text": text}


class StubMessagesApi:
    """A local Messages API: each POST /v1/messages gets the next scripted turn.

    A turn is `(check, reply)`: `check(body)` asserts on the request the
    regions sent, `reply` is the message JSON to return.
    """

    def __init__(self):
        self.turns = []
        self.requests = []
        self.errors = []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                stub.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
                try:
                    check, reply = stub.turns.pop(0)
                    check(body)
                    status, data = 200, reply
                except Exception as exc:  # surfaced by stub.verify()
                    stub.errors.append(exc)
                    status = 400
                    data = {"type": "error", "error": {"type": "invalid_request_error", "message": repr(exc)}}
                raw = json.dumps(data).encode()
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def expect(self, check, reply):
        self.turns.append((check, reply))

    def verify(self):
        if self.errors:
            raise self.errors[0]
        assert not self.turns, f"{len(self.turns)} scripted turns never requested"


def _check_round_trip(expected_ids, history_length):
    """A follow-up request: the assistant's tool_use blocks, then one
    tool_result per block with its tool_use_id, all successful."""

    def check(body):
        messages = body["messages"]
        assert len(messages) == history_length, messages
        assistant, results = messages[-2], messages[-1]
        assert assistant["role"] == "assistant", assistant
        uses = [b for b in assistant["content"] if b["type"] == "tool_use"]
        assert [b["id"] for b in uses] == expected_ids, assistant
        assert results["role"] == "user", results
        assert [b["type"] for b in results["content"]] == ["tool_result"] * len(expected_ids)
        assert [b["tool_use_id"] for b in results["content"]] == expected_ids, results
        # A successful result carries no is_error key at all.
        assert not any("is_error" in b for b in results["content"]), results

    return check


# --- the page ------------------------------------------------------------


async def main() -> None:
    stub = StubMessagesApi()
    os.environ["ANTHROPIC_BASE_URL"] = stub.url
    os.environ["ANTHROPIC_API_KEY"] = "stub-key"

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

    # --8<-- [start:anthropic-client]
    from anthropic import AsyncAnthropic

    claude = AsyncAnthropic()
    # --8<-- [end:anthropic-client]
    try:
        await _reset(api)
        await _run(stub, api, client, claude, UnitycatalogClient, CatalogsApi)
    finally:
        await api.close()
        await claude.close()
        stub.server.shutdown()
    stub.verify()


async def _run(stub, api, client, claude, UnitycatalogClient, CatalogsApi) -> None:
    from unitycatalog.ai.anthropic.toolkit import UCFunctionToolkit

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

    # Registered in the schema but not listed in the toolkit: the model must
    # not be able to run it through the page's loop.
    from pricing import gift_wrap_fee

    await client.create_python_function_async(
        func=gift_wrap_fee, catalog="tools", schema="pricing"
    )

    # --8<-- [start:toolkit]
    from unitycatalog.ai.anthropic.toolkit import UCFunctionToolkit

    toolkit = UCFunctionToolkit(
        function_names=[
            "tools.pricing.order_total",
            "tools.pricing.shipping_cost",
        ],
        client=client,
    )
    tools = [tool.to_dict() for tool in toolkit.tools]
    # --8<-- [end:toolkit]
    assert [t["name"] for t in tools] == [ORDER, SHIPPING], tools
    assert list(toolkit.tools_dict) == [
        "tools.pricing.order_total",
        "tools.pricing.shipping_cost",
    ]

    # --8<-- [start:tool-definition]
    import json

    print(json.dumps(tools[0], indent=2))
    # {
    #   "name": "tools__pricing__order_total",
    #   "description": "Calculate the total price of an order line after a percentage discount.",
    #   "input_schema": {
    #     "type": "object",
    #     "properties": {
    #       "quantity": {"default": null, "description": "Number of units ordered.", "title": "Quantity", "type": "integer"},
    #       "unit_price": {"default": null, "description": "Price of one unit.", "title": "Unit Price", "type": "number"},
    #       "discount_pct": {"default": 0.0, "description": "Discount in percent, from 0 to 100. (Default: 0.0)", "title": "Discount Pct", "type": "number"}
    #     },
    #     "required": []
    #   }
    # }
    # --8<-- [end:tool-definition]
    _assert_definitions(tools)

    # --8<-- [start:wildcard]
    toolkit_all = UCFunctionToolkit(function_names=["tools.pricing.*"], client=client)
    # --8<-- [end:wildcard]
    assert sorted(t.name for t in toolkit_all.tools) == [
        "tools__pricing__gift_wrap_fee",
        ORDER,
        SHIPPING,
    ], toolkit_all.tools

    # The SDK also serializes the toolkit's pydantic objects as they are.
    stub.expect(
        lambda body: _assert_equal(body["tools"], tools), _message([_text("ok")], "end_turn")
    )
    await claude.messages.create(
        model=MODEL,
        max_tokens=16,
        tools=toolkit.tools,
        messages=[{"role": "user", "content": "hi"}],
    )

    # Round 1: two tool_use blocks in one turn.
    def check_first(body):
        assert body["model"] == MODEL, body["model"]
        assert body["tools"] == tools, body["tools"]
        assert body["messages"] == [{"role": "user", "content": QUESTION}], body["messages"]

    QUESTION = (
        "What do 3 units at 19.99 with 10% off cost, shipped express at 2 kg?"
    )
    stub.expect(
        check_first,
        _message(
            [
                _text("I'll price the order and the shipping."),
                _tool_use("toolu_01", ORDER, {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}),
                _tool_use("toolu_02", SHIPPING, {"weight_kg": 2.0, "express": True}),
            ],
            "tool_use",
        ),
    )

    # --8<-- [start:request]
    question = {
        "role": "user",
        "content": "What do 3 units at 19.99 with 10% off cost, shipped express at 2 kg?",
    }
    response = await claude.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        tools=tools,
        messages=[question],
    )
    print(response.stop_reason)  # tool_use
    for block in response.content:
        if block.type == "tool_use":
            print(block.id, block.name, block.input)
    # toolu_... tools__pricing__order_total {'quantity': 3, 'unit_price': 19.99, 'discount_pct': 10.0}
    # toolu_... tools__pricing__shipping_cost {'weight_kg': 2.0, 'express': True}
    # --8<-- [end:request]
    assert question["content"] == QUESTION
    assert response.stop_reason == "tool_use"
    assert [b.type for b in response.content] == ["text", "tool_use", "tool_use"]
    sent = stub.requests[-1]
    assert sent["path"] == "/v1/messages", sent["path"]
    assert sent["headers"].get("x-api-key") == "stub-key", "ANTHROPIC_API_KEY is read"

    # --8<-- [start:tool-results]
    functions = {tool.name: name for name, tool in toolkit.tools_dict.items()}

    async def run_tool_calls(response):
        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            name = functions.get(block.name)
            try:
                if name is None:
                    raise ValueError(f"Unknown tool: {block.name}")
                output = await client.execute_function_async(
                    name, parameters=block.input
                )
            except ValueError as exc:  # an unknown tool, or arguments that don't fit
                failed, content = True, str(exc)
            else:
                failed = output.error is not None
                content = output.error if failed else str(output.value)
            result = {"type": "tool_result", "tool_use_id": block.id, "content": content}
            if failed:
                result["is_error"] = True
            results.append(result)
        return results
    # --8<-- [end:tool-results]

    # --8<-- [start:run-tools]
    results = await run_tool_calls(response)
    print(results)
    # [{'type': 'tool_result', 'tool_use_id': 'toolu_...', 'content': '53.97'},
    #  {'type': 'tool_result', 'tool_use_id': 'toolu_...', 'content': '14.0'}]
    # --8<-- [end:run-tools]
    assert results == [
        {"type": "tool_result", "tool_use_id": "toolu_01", "content": "53.97"},
        {"type": "tool_result", "tool_use_id": "toolu_02", "content": "14.0"},
    ], results

    # Round 2: the assistant turn and the results go back; Claude answers.
    stub.expect(
        _check_round_trip(["toolu_01", "toolu_02"], history_length=3),
        _message([_text("The order costs 53.97 and express shipping 14.00.")], "end_turn"),
    )

    # --8<-- [start:send-results]
    messages = [
        question,
        {"role": "assistant", "content": response.content},
        {"role": "user", "content": results},
    ]
    response = await claude.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        tools=tools,
        messages=messages,
    )
    print(response.stop_reason)  # end_turn
    print(response.content[-1].text)
    # --8<-- [end:send-results]
    assert response.stop_reason == "end_turn"
    assert response.content[-1].text.startswith("The order costs 53.97")
    # The assistant turn goes back block for block, text included.
    assistant_sent = stub.requests[-1]["body"]["messages"][1]["content"]
    assert assistant_sent[0] == {"type": "text", "text": "I'll price the order and the shipping."}, assistant_sent

    await _assert_errors(run_tool_calls)

    # Three rounds: two tool_use blocks, then one more, then the answer.
    stub.expect(
        lambda body: _assert_equal(len(body["messages"]), 1),
        _message(
            [
                _tool_use("toolu_11", ORDER, {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0}),
                _tool_use("toolu_12", SHIPPING, {"weight_kg": 2.0, "express": True}),
            ],
            "tool_use",
        ),
    )
    stub.expect(
        _check_round_trip(["toolu_11", "toolu_12"], history_length=3),
        _message([_tool_use("toolu_13", SHIPPING, {"weight_kg": 2.0, "express": False})], "tool_use"),
    )
    stub.expect(
        _check_round_trip(["toolu_13"], history_length=5),
        _message([_text("Express costs 14.00, standard shipping 9.00.")], "end_turn"),
    )

    # --8<-- [start:multi-round]
    async def ask(claude, question, max_rounds=5):
        messages = [{"role": "user", "content": question}]
        for _ in range(max_rounds):
            response = await claude.messages.create(
                model="claude-opus-5-5",
                max_tokens=1024,
                tools=tools,
                messages=messages,
            )
            if response.stop_reason in ("end_turn", "stop_sequence"):
                return response
            if response.stop_reason != "tool_use":  # max_tokens, refusal, pause_turn
                raise RuntimeError(f"Claude stopped with {response.stop_reason!r}")
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": await run_tool_calls(response)})
        raise RuntimeError(f"No answer after {max_rounds} rounds")

    response = await ask(claude, "Price 3 units at 19.99 with 10% off. Compare express and standard shipping at 2 kg.")
    print(response.content[-1].text)
    # --8<-- [end:multi-round]
    assert response.content[-1].text == "Express costs 14.00, standard shipping 9.00."
    third = stub.requests[-1]["body"]["messages"]
    assert [m["role"] for m in third] == ["user", "assistant", "user", "assistant", "user"]
    assert third[4]["content"][0]["content"] == "9.0", third[4]

    # The bound: a model that keeps asking for tools stops the loop.
    for i in range(2):
        stub.expect(
            lambda body: None,
            _message([_tool_use(f"toolu_2{i}", SHIPPING, {"weight_kg": 1.0, "express": False})], "tool_use"),
        )
    try:
        await ask(claude, "Keep going.", max_rounds=2)
    except RuntimeError as exc:
        assert str(exc) == "No answer after 2 rounds", exc
    else:
        raise AssertionError("the loop should stop after max_rounds")

    # A response cut off at max_tokens, mid tool_use: the loop raises instead
    # of returning it as an answer or running the truncated call.
    before = len(stub.requests)
    stub.expect(
        lambda body: None,
        _message(
            [_text("Let me check."), _tool_use("toolu_30", SHIPPING, {"weight_kg": 2.0})],
            "max_tokens",
        ),
    )
    try:
        await ask(claude, "Ship 2 kg express.")
    except RuntimeError as exc:
        assert str(exc) == "Claude stopped with 'max_tokens'", exc
    else:
        raise AssertionError("a max_tokens response should raise")
    assert len(stub.requests) == before + 1, "no follow-up request after max_tokens"

    # stop_sequence counts as an answer.
    stub.expect(lambda body: None, _message([_text("Done.")], "stop_sequence"))
    assert (await ask(claude, "Say done.")).content[-1].text == "Done."

    await _test_without_claude(ask)
    await _assert_helper(client, toolkit, claude, stub, run_tool_calls)
    await _assert_long_names(client, run_tool_calls)

    # --8<-- [start:clean-up]
    await CatalogsApi(api).delete_catalog(name="tools", force=True)
    await claude.close()
    await api.close()
    # --8<-- [end:clean-up]


async def _test_without_claude(ask) -> None:
    """The reader-facing test pattern: a mock transport instead of a server."""
    # --8<-- [start:mock-transport]
    import json

    import httpx2
    from anthropic import AsyncAnthropic, DefaultAsyncHttpxClient

    def reply(content, stop_reason):
        return {
            "id": "msg_test", "type": "message", "role": "assistant",
            "model": "claude-opus-5-5", "content": content,
            "stop_reason": stop_reason, "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 1},
        }

    replies = iter([
        reply([{"type": "tool_use", "id": "toolu_t1", "name": "tools__pricing__shipping_cost",
                "input": {"weight_kg": 2.0, "express": True}}], "tool_use"),
        reply([{"type": "text", "text": "Shipping costs 14.00."}], "end_turn"),
    ])
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx2.Response(200, json=next(replies))

    test_claude = AsyncAnthropic(
        api_key="test",
        http_client=DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    response = await ask(test_claude, "Ship 2 kg express.")
    print(response.content[-1].text)  # Shipping costs 14.00.
    print(requests[1]["messages"][-1]["content"])
    # [{'type': 'tool_result', 'tool_use_id': 'toolu_t1', 'content': '14.0'}]
    # --8<-- [end:mock-transport]
    assert response.content[-1].text == "Shipping costs 14.00."
    assert len(requests) == 2
    assert requests[1]["messages"][-1]["content"] == [
        {"type": "tool_result", "tool_use_id": "toolu_t1", "content": "14.0"}
    ], requests[1]
    await test_claude.close()

    # The SDK runs on httpx2 and refuses transports from the httpx package. It
    # tells them apart by the class's module, so a stand-in class from module
    # `httpx` gets the same TypeError as `httpx.MockTransport` (httpx itself
    # isn't installed in this script's environment).
    HttpxTransport = type("MockTransport", (), {"__module__": "httpx._transports.mock"})
    try:
        DefaultAsyncHttpxClient(transport=HttpxTransport())
    except TypeError as exc:
        assert str(exc) == (
            "Invalid `transport` argument; `httpx.MockTransport` is from the `httpx` "
            "package, but this SDK uses `httpx2`. Use `httpx2.MockTransport` instead."
        ), exc
    else:
        raise AssertionError("an httpx transport should be rejected")


def _assert_equal(actual, expected):
    assert actual == expected, (actual, expected)


def _assert_definitions(tools) -> None:
    order, shipping = tools
    assert set(order) == {"name", "description", "input_schema"}, order
    assert order["description"] == (
        "Calculate the total price of an order line after a percentage discount."
    ), order
    schema = order["input_schema"]
    assert schema["type"] == "object"
    assert list(schema["properties"]) == ["quantity", "unit_price", "discount_pct"]
    assert schema["properties"]["quantity"] == {
        "default": None,
        "description": "Number of units ordered.",
        "title": "Quantity",
        "type": "integer",
    }, schema
    assert schema["properties"]["unit_price"]["type"] == "number"
    assert schema["properties"]["discount_pct"]["default"] == 0.0
    assert schema["properties"]["discount_pct"]["description"] == (
        "Discount in percent, from 0 to 100. (Default: 0.0)"
    )
    # No parameter is marked required, not even the ones without a default.
    assert schema["required"] == [], schema
    assert shipping["input_schema"]["required"] == [], shipping
    assert shipping["input_schema"]["properties"]["express"]["type"] == "boolean"


async def _assert_errors(run_tool_calls) -> None:
    """What the page's loop returns for each way a tool call goes wrong."""
    from anthropic.types import Message

    response = Message.model_validate(
        _message(
            [
                # The function raises.
                _tool_use("e1", SHIPPING, {"weight_kg": -1.0, "express": False}),
                # Registered in the schema, not in the toolkit.
                _tool_use("e2", "tools__pricing__gift_wrap_fee", {"items": 2}),
                # An integer for a DOUBLE parameter.
                _tool_use("e3", ORDER, {"quantity": 3, "unit_price": 20}),
                # A parameter without a default left out.
                _tool_use("e4", ORDER, {"unit_price": 19.99}),
                # An argument the function doesn't declare.
                _tool_use("e5", ORDER, {"quantity": 1, "unit_price": 1.0, "coupon": "X"}),
                # A falsy return value.
                _tool_use("e6", ORDER, {"quantity": 0, "unit_price": 19.99}),
            ],
            "tool_use",
        )
    )
    raised, unknown, int_double, missing, extra, falsy = await run_tool_calls(response)
    assert [r["tool_use_id"] for r in (raised, unknown, int_double, missing, extra, falsy)] == [
        "e1", "e2", "e3", "e4", "e5", "e6",
    ]
    assert raised["is_error"] is True, raised
    assert raised["content"].startswith("Traceback (most recent call last):"), raised
    assert raised["content"].rstrip().endswith(
        "ValueError: weight_kg must be greater than zero"
    ), raised
    assert unknown == {
        "type": "tool_result",
        "tool_use_id": "e2",
        "is_error": True,
        "content": "Unknown tool: tools__pricing__gift_wrap_fee",
    }, unknown
    assert int_double["is_error"] is True, int_double
    assert "Parameter unit_price should be of type ColumnTypeName.DOUBLE" in int_double["content"], int_double
    assert "but got <class 'int'>" in int_double["content"], int_double
    assert missing["is_error"] is True, missing
    assert missing["content"] == "Parameter quantity is required but not provided.", missing
    assert extra["is_error"] is True, extra
    assert extra["content"].startswith(
        "Extra parameters provided that are not defined in the function's input parameters"
    ), extra
    assert "is_error" not in falsy, falsy
    assert falsy["content"].startswith(
        "The function execution has completed, but no output was produced."
    ), falsy


async def _assert_helper(client, toolkit, claude, stub, run_tool_calls) -> None:
    """Why the page writes its own loop: what `generate_tool_call_messages` does."""
    from anthropic.types import Message
    from unitycatalog.ai.anthropic.utils import generate_tool_call_messages

    history = [{"role": "user", "content": "price"}]
    response = Message.model_validate(
        _message(
            [
                _tool_use("h1", "tools__pricing__gift_wrap_fee", {"items": 2}),
                _tool_use("h2", SHIPPING, {"weight_kg": -1.0, "express": False}),
            ],
            "tool_use",
        )
    )
    messages = generate_tool_call_messages(
        response=response, conversation_history=history, client=client
    )
    results = messages[-1]["content"]
    # It runs a function the toolkit doesn't list...
    assert results[0] == {"type": "tool_result", "tool_use_id": "h1", "content": "3.0"}, results
    # ...and turns a function's error into the text "None", without is_error.
    assert results[1] == {"type": "tool_result", "tool_use_id": "h2", "content": "None"}, results

    # Arguments that don't fit raise out of the helper: no result for any block.
    bad = Message.model_validate(
        _message(
            [
                _tool_use("h3", SHIPPING, {"weight_kg": 2.0, "express": True}),
                _tool_use("h4", ORDER, {"quantity": 3, "unit_price": 20}),
            ],
            "tool_use",
        )
    )
    try:
        generate_tool_call_messages(response=bad, conversation_history=history, client=client)
    except ValueError as exc:
        assert "Parameter unit_price should be of type ColumnTypeName.DOUBLE" in str(exc), exc
    else:
        raise AssertionError("an int for a DOUBLE should raise out of the helper")

    # Its output can't be passed back in on the next round: the tool_result
    # user message fails its own history validation.
    good = Message.model_validate(
        _message([_tool_use("h5", SHIPPING, {"weight_kg": 2.0, "express": True})], "tool_use")
    )
    round_one = generate_tool_call_messages(
        response=good, conversation_history=history, client=client
    )
    assert round_one[-1]["content"] == [
        {"type": "tool_result", "tool_use_id": "h5", "content": "14.0"}
    ], round_one
    try:
        generate_tool_call_messages(response=good, conversation_history=round_one, client=client)
    except ValueError as exc:
        assert str(exc) == "Invalid conversation history format", exc
    else:
        raise AssertionError("the helper's own history should fail on the next round")

    # Same response through the page's loop: no unlisted call, errors flagged.
    mine = await run_tool_calls(response)
    assert [r["is_error"] for r in mine] == [True, True], mine
    assert mine[0]["content"] == "Unknown tool: tools__pricing__gift_wrap_fee", mine


def apply_volume_discount_to_every_line_item_of_orders(quantity: int) -> float:
    """
    Apply the volume discount to an order's line items.

    Args:
        quantity: Number of units ordered.

    Returns:
        The discount in percent.
    """
    return 5.0 if quantity >= 10 else 1.0


async def _assert_long_names(client, run_tool_calls) -> None:
    """A tool name over 64 characters keeps its last 64. The helper splits it
    back into a wrong full name; the page's loop looks it up instead."""
    from anthropic.types import Message
    from unitycatalog.ai.anthropic.toolkit import UCFunctionToolkit
    from unitycatalog.ai.anthropic.utils import generate_tool_call_messages

    long_name = "tools.pricing.apply_volume_discount_to_every_line_item_of_orders"
    await client.create_python_function_async(
        func=apply_volume_discount_to_every_line_item_of_orders, catalog="tools", schema="pricing"
    )
    toolkit = UCFunctionToolkit(function_names=[long_name], client=client)
    (tool,) = toolkit.tools
    full = long_name.replace(".", "__")
    assert len(full) > 64, len(full)
    assert tool.name == full[-64:], tool.name
    assert tool.name.startswith("ols__pricing__"), tool.name

    response = Message.model_validate(
        _message([_tool_use("l1", tool.name, {"quantity": 12})], "tool_use")
    )
    try:
        generate_tool_call_messages(response=response, conversation_history=[], client=client)
    except AttributeError as exc:  # it looks up `ols.pricing.apply_...`, which doesn't exist
        assert str(exc) == "'NoneType' object has no attribute 'input_params'", exc
    else:
        raise AssertionError("the helper should fail to map a truncated name back")

    functions = {t.name: name for name, t in toolkit.tools_dict.items()}
    assert functions == {tool.name: long_name}, functions


async def _reset(api) -> None:
    from unitycatalog.client import CatalogsApi

    try:
        await CatalogsApi(api).delete_catalog(name="tools", force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())
