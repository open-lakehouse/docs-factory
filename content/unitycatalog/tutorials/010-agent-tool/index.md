---
title: Build an agent tool from a catalog function
summary: UCFunctionToolkit turns Unity Catalog functions into LangChain tools. An agent calls the ones you list by name, and each call runs on your machine.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogServer
  - unityCatalogAi
  - unityCatalogLangChain
  - lakehouse.function
status: draft
---

In this tutorial you turn two
[Unity Catalog functions](model:lakehouse.function) into LangChain tools, check them yourself, and give them to an agent. The
catalog stores the functions. Your machine runs them whenever the agent calls
one. To learn how registering a function works, start with
[Working with Python functions](../first-python-function/index.md).

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
:::

::::journey

### Open a Python session

Create an empty folder. In it, open a Python session with
`unitycatalog-langchain`, the LangChain integration for catalog functions, and
LangGraph's prebuilt agent:

```bash
mkdir agent-tool && cd agent-tool
EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-langchain==0.4.0 --with langgraph-prebuilt==1.0.8 python -m asyncio
```

Use Python 3.12, the version this page's scripts run on. Enter each of the
following snippets in the session, in order.

:::note
`python -m asyncio` is a Python shell that accepts `await` at the top level,
which the asynchronous client needs.
:::

:::note
The function sandbox caps each call's virtual memory at
`EXECUTOR_MAX_MEMORY_LIMIT` megabytes (100 by default), a limit that applies
only on Linux. The command above sets it to 4096, the value this tutorial's
script runs with.
:::

### Connect to the server

Create a function client for the local server:

```python file=./snippets/agent_tool.py start=start:connect end=end:connect
```

### Register the functions

Save the two functions the agent may call as `pricing.py`, in the folder where
the session runs:

```python file=./snippets/pricing.py start=start:order-total end=end:order-total title="pricing.py"
```

Below it, in the same file, add the shipping function:

```python file=./snippets/pricing.py start=start:shipping-cost end=end:shipping-cost title="pricing.py"
```

The docstrings are what the model reads to decide when to call each function
and with which arguments.

Create a catalog and a schema for the functions:

```python file=./snippets/agent_tool.py start=start:namespace end=end:namespace
```

Then register both functions:

```python file=./snippets/agent_tool.py start=start:register end=end:register
```

Both functions are now in the catalog, as `tools.pricing.order_total` and
`tools.pricing.shipping_cost`.

:::note
Before it creates a function, the client checks whether the name is taken, so
a `Failed to retrieve function ... (404)` log line appears for each one. You
can ignore it.
:::

### Turn the functions into tools

Build a toolkit from the functions' full names:

```python file=./snippets/agent_tool.py start=start:toolkit end=end:toolkit
```

The list is an allowlist: the agent gets these two functions and no others.

:::tip
Always pass `client=`, so the toolkit uses the client for this server rather
than a global default. With neither, it raises
`ValueError: No client provided…`.
:::

Each tool is named after its function's full name, with `__` in place of the
dots:

```python file=./snippets/agent_tool.py start=start:tool-names end=end:tool-names
```

:::tip
A name like `tools.pricing.*` turns every function in the schema into a tool.
A wildcard also picks up functions that someone registers in the schema later:
the next toolkit you build from it gives the agent those functions too. List
the functions by name to keep an explicit allowlist of what the agent may call.
See
[Choose which functions become tools](../../how-to/langchain-tools/index.md#choose-which-functions-become-tools).
:::

### See what the model sees

Print the first tool's description and its arguments:

```python file=./snippets/agent_tool.py start=start:inspect end=end:inspect
```

The description is the docstring's summary, `Calculate the total price of an
order line after a percentage discount.` Each argument has a JSON Schema type,
`integer` for `quantity` and `number` for `unit_price`, and the description
from its `Args:` line. The default shows up in the description of
`discount_pct`: `Discount in percent, from 0 to 100. (Default: 0.0)`.
Together with the tool name, this is all the model sees.

### Call a tool yourself

Before an agent uses a tool, call it yourself to check the function and its
arguments:

```python file=./snippets/agent_tool.py start=start:call-tool end=end:call-tool
```

A tool returns a JSON string, here `{"format": "SCALAR", "value": 53.97}`.
That string is what the agent receives.

### Connect the tools to this session

Before an agent can use the tools in this session, give each one an
asynchronous function that calls the client on the session's event loop:

```python file=./snippets/agent_tool.py start=start:async-tools end=end:async-tools
```

:::note
LangGraph runs a tool's synchronous function in a worker thread, but the
client's connection belongs to this session's event loop. Without this step,
the agent's run stops with
`RuntimeError: Timeout context manager should be used inside a task`. See
[Workaround: run the tools on the session's event loop](../../how-to/langchain-tools/index.md#workaround-run-the-tools-on-the-sessions-event-loop).
:::

### Script a stand-in model

An agent needs a chat model. This one is a scripted stand-in. It asks for one
call to each tool, then answers. It's deterministic and needs no API key:

```python file=./snippets/agent_tool.py start=start:model end=end:model
```

:::note
A later, optional step replaces the stand-in with a real model. Nothing else
about the agent changes.
:::

### Run the agent

Create the agent with the adapted tools and ask it a question:

```python file=./snippets/agent_tool.py start=start:agent end=end:agent
```

The output lists the messages in order:

```text
human Price 3 units at 19.99 with 10% off, shipped express at 2 kg.
ai -> tools__pricing__order_total {'quantity': 3, 'unit_price': 19.99, 'discount_pct': 10.0}
tool {"format": "SCALAR", "value": 53.97}
ai -> tools__pricing__shipping_cost {'weight_kg': 2.0, 'express': True}
tool {"format": "SCALAR", "value": 14.0}
ai The order total is 53.97 and shipping is 14.0.
```

Each `ai ->` line is a tool call the model made, with the tool's name and the
arguments it chose. Each `tool` line is the JSON result of that call, which
your machine computed by running the catalog function. The last line is the
model's answer.

### (Optional) Use a real model

:::warning
This step needs an OpenAI API key, and each run sends billed requests to
OpenAI.
:::

The new session registers the functions again, so first enter the snippet from
"Clean up" to delete the `tools` catalog. Leave the session with `Ctrl+D`. Set
your key with
`export OPENAI_API_KEY=<your key>`, then open a new session with
`langchain-openai` added:

```bash
EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-langchain==0.4.0 --with langgraph-prebuilt==1.0.8 --with langchain-openai==1.7.2 python -m asyncio
```

Repeat every step from "Connect to the server" through "Connect the tools to
this session". Instead of the stand-in model, create a real one:

```python file=./snippets/real_model.py start=start:real-model end=end:real-model
```

Then repeat "Run the agent". The model gets the same two tool schemas and
decides which tools to call and with what arguments. With the same arguments,
the tools return the same results.

### Clean up

Delete the `tools` catalog and everything in it, and close the connection.
Other pages use the same catalog name, so this also removes anything they left
there:

```python file=./snippets/agent_tool.py start=start:clean-up end=end:clean-up
```

Leave the session with `Ctrl+D`.

::::

## What you did

You registered two functions in Unity Catalog and built LangChain tools from
an explicit list of them. You checked what the model sees and called a tool
yourself. Then an agent called both tools by name. The catalog holds each
function's definition, and every call ran on your machine.

## Next steps

- Choose functions with wildcards, check argument types, trace tool calls, and
  route the model through a gateway in
  [Use catalog functions as LangChain tools](../../how-to/langchain-tools/index.md).
  Its [privileges section](../../how-to/langchain-tools/index.md#control-who-can-call-a-function)
  covers who can call a function.
- Give the same functions to other agent frameworks with
  [Use catalog functions with OpenAI-compatible tool calling](../../how-to/openai-tools/index.md)
  or [Use catalog functions with Anthropic tools](../../how-to/anthropic-tools/index.md).
- Call catalog functions from your own code in
  [Run catalog functions in applications and notebooks](../../how-to/run-functions/index.md),
  or from Spark in [Use catalog functions in Spark](../../how-to/spark-functions/index.md).
- Learn how functions and the `EXECUTE` privilege fit among the other catalog
  objects in [Core concepts](../../explanation/uc-basics/index.md).
