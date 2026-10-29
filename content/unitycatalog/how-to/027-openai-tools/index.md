---
title: Use catalog functions with OpenAI-compatible tool calling
summary: UCFunctionToolkit turns Unity Catalog functions into OpenAI Chat Completions tool definitions. Your code runs each tool call the model returns, on your machine.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - unityCatalogAi
  - unityCatalogOpenAi
  - lakehouse.function
status: draft
---

[Unity Catalog](model:unityCatalogServer) stores each
[function's](model:lakehouse.function) signature, descriptions, and source
code. Your process turns them into tool definitions with
[`unitycatalog-openai`](model:unityCatalogOpenAi) and runs each call. Neither
the model nor the server runs function code. For where functions sit among the
other catalog objects, see
[Core concepts](../../explanation/uc-basics/index.md).

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- With authorization enabled, the privileges to register and call functions:
  [Control who can call a function](../langchain-tools/index.md#control-who-can-call-a-function).
:::

## Set up the clients

Start Python with the OpenAI integration and the OpenAI SDK:

```bash
EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-openai==0.4.0 --with openai==2.24.0 python -m asyncio
```

The integration needs `openai` 2.24.0 or earlier. If your app needs a newer
SDK, install the integration in its own environment.

:::note
Use Python 3.12, or 3.13.3 or later. On 3.13.0 to 3.13.2, a function that
raises loses its traceback, and the call returns a generic "no output was
produced" notice instead.
:::

:::note
`EXECUTOR_MAX_MEMORY_LIMIT` raises the function sandbox's memory cap, which
applies only on Linux, from 100 MB by default to 4096 MB.
:::

Create the function client and an `AsyncOpenAI` client. The OpenAI client reads your
key from `OPENAI_API_KEY`, and the model name comes from `OPENAI_MODEL`, so set
both to your own values first:

```python file=./snippets/openai_tools.py start=start:connect end=end:connect
```

Pass this function client to every toolkit as `client=`. Without it, the
toolkit raises `ValueError: No client provided` unless you've set a default
client with `set_uc_function_client`.

## Register the functions the model may call

The model decides when to call a function from its description. The
docstring's summary becomes the tool's description, and each `Args:` line
becomes that argument's description. For more on writing and registering
functions, see
[Manage Python functions](../manage-python-functions/index.md).

Create a catalog and a schema for the functions:

```python file=./snippets/openai_tools.py start=start:namespace end=end:namespace
```

Save two functions as `pricing.py`, in the folder where the session runs:

```python file=./snippets/pricing.py start=start:order-total end=end:order-total title="pricing.py"
```

```python file=./snippets/pricing.py start=start:shipping-cost end=end:shipping-cost
```

Then register them:

```python file=./snippets/openai_tools.py start=start:register end=end:register
```

With authorization enabled, registering a function needs `USE CATALOG` on the
catalog (or its ownership), plus `USE SCHEMA` and `CREATE FUNCTION` on the
schema (or its ownership). For creating the catalog and schema, see
[Control who can call a function](../langchain-tools/index.md#control-who-can-call-a-function).

## Build the tool definitions

List the functions by full name to build the toolkit. Pass `toolkit.tools` as
`tools=` to `chat.completions.create`:

```python file=./snippets/openai_tools.py start=start:toolkit end=end:toolkit
```

Print a definition to check what the model sees:

```python file=./snippets/openai_tools.py start=start:inspect end=end:inspect
```

These are Chat Completions definitions, not the Responses API's tool shape.
They set `strict: true`, so the model sends every parameter, `discount_pct`
included; its default appears in the description. If your server rejects the
schema, set `strict` to `False` in the definition's `function`.

:::tip
A tool's name is the function's full name with `__` in place of the dots, cut
to its last 64 characters. A cut name, or one with `__` inside a part, can't
be mapped back to the function, so keep catalog, schema, and function names
short and free of `__`.
:::

To include every function in a schema, use `catalog.schema.*`:

```python file=./snippets/openai_tools.py start=start:wildcard end=end:wildcard
```

:::warning
A wildcard includes every function in the schema when you build the toolkit,
including ones not meant as tools. Rebuilding the toolkit picks up functions
registered since. List the functions by name to keep an explicit allowlist of
what the model may call.
:::

Don't rely on `filter_accessible_functions=True` to drop functions the caller
can't use. It skips a function only when fetching it raises `PermissionError`,
and the Unity Catalog client raises `ForbiddenException` instead. A function
the catalog doesn't have fails with `TypeError: Unsupported function info type`.

## Run the tool calls the model returns

The model returns tool calls, and your code runs them. Each call fetches the
function from the catalog and runs it in a sandbox the client forks on your
machine, not on the server. With authorization enabled, building a tool and
running a call need `USE CATALOG` on the catalog, `USE SCHEMA` on the schema,
and `EXECUTE` on the function (or its ownership). For the other ways to hold
access, see
[Control who can call a function](../langchain-tools/index.md#control-who-can-call-a-function).

### With `generate_tool_call_messages`

Ask the model a question with the tools, then pass its response to the
integration's helper. The helper runs every tool call in the response and
returns the assistant message followed by one `tool` message per call:

```python file=./snippets/openai_tools.py start=start:helper end=end:helper
```

The helper is synchronous and has no async variant, so call it directly after
the awaited request. Other tasks on the event loop keep running while the
functions run, but not another call on the same function client (see
[Run calls concurrently](../run-functions/index.md#run-calls-concurrently)).
Don't wrap it in `asyncio.to_thread`: that fails with
`RuntimeError: Timeout context manager should be used inside a task`. Check
what else it does before you use it:

- It runs any `catalog__schema__function` name the model returns, including a
  function that isn't in the toolkit.
- A function that raises comes back as `{"content": null}`, without the
  traceback, so the model can't see what went wrong.
- It reads one choice, `choice_index` (0 by default).
- A name that doesn't split into three parts raises `ValueError: Invalid tool
  name`, and an argument that fails the type check raises `ValueError`. Either
  ends your loop rather than reaching the model.

### With your own dispatcher

A dispatcher of your own keeps the toolkit as the allowlist and gives the model
the error. It maps each name back through `toolkit.tools_dict`, rejects names
that aren't there, returns the result's JSON, and turns a `ValueError` or
`TypeError` into an `error` the model can read:

```python file=./snippets/openai_tools.py start=start:dispatch end=end:dispatch
```

It awaits `execute_function_async`, so the event loop keeps running while a
function runs. It runs the calls one at a time, because two concurrent calls on
one function client deadlock. To run calls concurrently, see
[Run functions in apps and notebooks](../run-functions/index.md#run-calls-concurrently).

Prefer this dispatcher to the helper. The errors it returns cover the cases
this page's functions can hit:

- A JSON integer for a `DOUBLE` parameter, such as `20` for `unit_price`, fails
  the client's type check, though the schema's `number` type allows it. The
  dispatcher returns the `ValueError` to the model, which can retry with a
  float.
- A `DATE`, `TIMESTAMP`, `DECIMAL`, or `BINARY` return value makes
  `result.to_json()` raise `TypeError`, such as `Object of type date is not
  JSON serializable`. The dispatcher returns it to the model as an error, and
  the loop goes on. Return a string instead when the model needs the value.

A function that returns a falsy value, such as `order_total` at a 100%
discount, returns a notice that starts "The function execution has completed,
but no output was produced." instead of `0.0`. When the model needs to see a
zero, return a value that isn't falsy, such as a string.

## Bound the tool-calling loop

The loop sends the messages and tools, runs the tool calls in the reply, and
repeats. It stops when a reply has no tool calls. After `MAX_ROUNDS` rounds it
makes one last call with `tool_choice="none"`, so the model answers with text:

```python file=./snippets/openai_tools.py start=start:loop end=end:loop
```

The model gets the tool definitions and the results, never the functions'
source code.

## Test tool calls without a model

Build a `ChatCompletion` by hand and pass its message to the dispatcher. That
tests a working call, a function that raises, and a name outside the toolkit
without an API key:

```python file=./snippets/openai_tools.py start=start:test end=end:test
```

When you're done, delete the catalog and close the clients:

```python file=./snippets/openai_tools.py start=start:clean-up end=end:clean-up
```

## Use another OpenAI-compatible server

To use another server, change `base_url` and `api_key` on the `AsyncOpenAI` client,
and set `OPENAI_MODEL` to a model that server serves. The server must implement
Chat Completions tool calling. If it rejects the tool schema, set `strict` to
`False` in each definition's `function`.

:::note
This page's examples run against scripted Chat Completions responses, not a
real model or server.
:::

## Next steps

- Give the same functions to a LangChain agent in
  [Use catalog functions as LangChain tools](../langchain-tools/index.md).
- Call functions from apps and notebooks in
  [Run functions in apps and notebooks](../run-functions/index.md).
- Register, inspect, and run functions step by step in
  [Working with Python functions](../../tutorials/first-python-function/index.md).
