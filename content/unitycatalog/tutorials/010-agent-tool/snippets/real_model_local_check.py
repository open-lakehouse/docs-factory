"""Local evidence for the real-model step. Not collected or served (no script
block); CI never runs it, because a real provider needs a key.

Runs real_model.py unchanged against a fake OpenAI-compatible server in this
process: OPENAI_BASE_URL points ChatOpenAI at it and OPENAI_API_KEY is a dummy.
The fake scripts two tool calls, then an answer, and records each request.

With Unity Catalog up (`docker compose up -d --wait` in the environment
folder), run from this folder:

    EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 \
      --with unitycatalog-langchain==0.4.0 --with langgraph-prebuilt==1.0.8 \
      --with langchain-openai==1.7.2 python real_model_local_check.py
"""

import asyncio
import json
import os
import pathlib
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
PORT = 5057
SEEN: list[dict] = []
CALLS = [
    (
        "tools__pricing__order_total",
        {"quantity": 3, "unit_price": 19.99, "discount_pct": 10.0},
    ),
    ("tools__pricing__shipping_cost", {"weight_kg": 2.0, "express": True}),
]
ANSWER = "The order total is 53.97 and shipping is 14.0."


class FakeOpenAI(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN.append(
            {
                "path": self.path,
                "auth": self.headers.get("Authorization"),
                "model": body.get("model"),
                "tools": [t["function"]["name"] for t in body.get("tools") or []],
                "roles": [m["role"] for m in body["messages"]],
            }
        )
        turn = sum(m["role"] == "tool" for m in body["messages"])
        if turn < len(CALLS):
            name, args = CALLS[turn]
            message = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": f"call-{turn + 1}",
                        "type": "function",
                        "function": {"name": name, "arguments": json.dumps(args)},
                    }
                ],
            }
        else:
            message = {"role": "assistant", "content": ANSWER}
        data = json.dumps(
            {
                "id": "fake",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": body.get("model"),
                "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), FakeOpenAI)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    os.environ["OPENAI_BASE_URL"] = f"http://127.0.0.1:{PORT}/v1"
    os.environ["OPENAI_API_KEY"] = "not-a-real-key"
    try:
        sys.path.insert(0, str(HERE))
        import real_model

        messages = asyncio.run(real_model.main())
    finally:
        server.shutdown()

    tool_messages = [m for m in messages if m.type == "tool"]
    assert [m.name for m in tool_messages] == [name for name, _ in CALLS], messages
    assert [json.loads(m.content) for m in tool_messages] == [
        {"format": "SCALAR", "value": 53.97},
        {"format": "SCALAR", "value": 14.0},
    ], messages
    assert messages[-1].type == "ai" and messages[-1].content == ANSWER, messages
    # Every turn went to the chat completions endpoint with both tool schemas,
    # the model named in the region, and the key from OPENAI_API_KEY.
    assert len(SEEN) == 3, SEEN
    for request in SEEN:
        assert request["path"] == "/v1/chat/completions", request
        assert request["auth"] == "Bearer not-a-real-key", request
        assert request["model"] == "gpt-4o-mini", request
        assert sorted(request["tools"]) == sorted(name for name, _ in CALLS), request
    print("real-model check OK:", len(SEEN), "requests")


if __name__ == "__main__":
    main()
