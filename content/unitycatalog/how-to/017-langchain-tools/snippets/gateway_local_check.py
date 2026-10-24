"""Local evidence for the gateway section. Not collected or served (no script
block); CI never runs it, because a real provider needs a key.

Runs the page's gateway pieces unchanged except for one line: a copy of
gateway.yaml with `openai_api_base` pointed at a fake OpenAI-compatible server
in this process, and a dummy OPENAI_API_KEY. The fake scripts two tool calls,
then an answer, and records what the gateway forwards.

With the Unity Catalog server up (`docker compose up -d --wait` in the
environment folder), run from this folder:

    EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 \
      --with unitycatalog-langchain==0.4.0 --with langgraph-prebuilt==1.0.8 \
      --with langchain-community==0.4.1 --with mlflow==3.17.0 \
      python gateway_local_check.py
"""

import asyncio
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
UPSTREAM = 5056
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
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", UPSTREAM), FakeOpenAI)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    workdir = pathlib.Path(tempfile.mkdtemp())
    shown = (HERE / "gateway.yaml").read_text()
    real_base = "openai_api_base: https://api.openai.com/v1"
    assert shown.count(real_base) == 1, shown
    (workdir / "gateway.yaml").write_text(
        shown.replace(real_base, f"openai_api_base: http://127.0.0.1:{UPSTREAM}/v1")
    )
    shutil.copy(HERE / "start_gateway.sh", workdir)
    env = {**os.environ, "OPENAI_API_KEY": "not-a-real-key"}
    gateway = subprocess.Popen(
        ["bash", "start_gateway.sh"],
        cwd=workdir,
        env=env,
        start_new_session=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    try:
        for _ in range(180):
            try:
                urllib.request.urlopen("http://localhost:5050/health", timeout=2)
                break
            except OSError:
                if gateway.poll() is not None:
                    raise SystemExit(gateway.stdout.read().decode()) from None
                time.sleep(1)
        else:
            raise SystemExit("the gateway didn't come up")

        sys.path.insert(0, str(HERE))
        import gateway_agent

        messages = asyncio.run(gateway_agent.main())
    finally:
        os.killpg(gateway.pid, 15)
        server.shutdown()

    tool_messages = [m for m in messages if m.type == "tool"]
    assert [m.name for m in tool_messages] == [name for name, _ in CALLS], messages
    assert [json.loads(m.content) for m in tool_messages] == [
        {"format": "SCALAR", "value": 53.97},
        {"format": "SCALAR", "value": 14.0},
    ], messages
    assert messages[-1].type == "ai" and messages[-1].content == ANSWER, messages
    # The gateway forwarded every turn with the tool schemas, the configured
    # model name, and the key from OPENAI_API_KEY.
    assert len(SEEN) == 3, SEEN
    for request in SEEN:
        assert request["path"] == "/v1/chat/completions", request
        assert request["auth"] == "Bearer not-a-real-key", request
        assert request["model"] == "gpt-4o-mini", request
        assert sorted(request["tools"]) == sorted(name for name, _ in CALLS), request
    assert [r["roles"] for r in SEEN] == [
        ["user"],
        ["user", "assistant", "tool"],
        ["user", "assistant", "tool", "assistant", "tool"],
    ], SEEN
    print("gateway check OK:", len(SEEN), "upstream requests")


if __name__ == "__main__":
    main()
