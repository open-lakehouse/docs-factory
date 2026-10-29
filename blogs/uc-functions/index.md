---
title: "Unity Catalog Functions for agents, apps, and engines"
slug: uc-functions
status: draft
tags: [unity-catalog, lakehouse, agents]
author: Robert Pack
target: unitycatalog
post_type: essay
audience: Data and AI engineers who know Unity Catalog tables and Python, and want one governed function for queries, apps, and agent tools.
summary: Register a Python function in Unity Catalog once, then run it by name from Spark, an app, or an agent's tool loop. The catalog governs it; the caller runs it.
---

A Unity Catalog function is one governed definition. You register a Python
function once as `uc_functions_demo.pricing.order_total`, then fetch and run
it by name from a Spark session, an app, a notebook, or an agent's tool loop.
The catalog decides who may call it, through `EXECUTE`. The caller runs it,
never the server.

:::tldr
- Unity Catalog stores a Python function's signature, docstring, and body as
  text. The server never runs it: every caller fetches the definition and runs
  it on its own machine.
- Per the server's source, `EXECUTE` on the function, plus `USE SCHEMA` and
  `USE CATALOG` on its parents, decides who can fetch it, and so who can run
  it. The docs haven't run these rules with authorization enabled.
- Spark can't call a Unity Catalog function by name. Fetch it with
  `unitycatalog-ai` and register it as a session UDF, and SQL and DataFrames
  can call it.
- `UCFunctionToolkit` turns the same function into a LangChain tool, an OpenAI
  Chat Completions tool, or an Anthropic Messages tool for Claude. The model
  asks for a call, and your code runs it.
- To try it, register one function, then give it to an agent:
  [Build an agent tool from a catalog function](../../content/unitycatalog/tutorials/010-agent-tool/index.md).
:::

Tool logic belongs in the catalog, under `EXECUTE`. It shouldn't be copied
into every agent's repository. We stopped copying table definitions between
pipelines a long time ago, because once there were two copies, they drifted,
and nobody could say who was allowed to read which one. Agent tools are
heading into the same mess: a pricing rule lives in one agent's repository, a
slightly different version lives in a second agent's repository, and an app
has a third. The toolkits that build agent tools from the catalog record are
what make the alternative practical. The rest of this post walks one function
through every place open source Unity Catalog can run it.

## What a Unity Catalog function is

A Unity Catalog function is metadata plus source text. The catalog stores the
function's three-part name, its typed parameters, its return type, comments
taken from its docstring, and its body. The server never executes any of it
([Manage Python functions](../../content/unitycatalog/how-to/018-manage-python-functions/index.md)).

Here is the function this post registers once and then runs from everywhere
else:

```python file=./snippets/pricing.py
```

The type hints and the docstring aren't decoration. The client turns `int`
into `LONG` and `float` into `DOUBLE`, and it stores the docstring's first
paragraph as the function's comment and each `Args:` entry as that
parameter's comment
([Working with Python functions](../../content/unitycatalog/tutorials/005-first-python-function/index.md)).
Later, an agent reads exactly those comments to decide when to call the
function. Registering it with `unitycatalog-ai` takes a few lines. The post's
scripts work in a catalog of their own, `uc_functions_demo`: they stop if it
already exists, and they delete only that catalog when they finish.

```python file=./snippets/one_function.py start=start:register end=end:register
```

Fetch the record back, and the body comes back as text:
`return round(quantity * unit_price * (1 - discount_pct / 100), 2)`. Anyone
who calls `uc_functions_demo.pricing.order_total` fetches that text, rebuilds
the function, and runs it with their own Python and their own permissions.

Who may fetch it is the catalog's job. A function is a securable like a table,
and its privilege is `EXECUTE`. Like everything else in the namespace, it also
takes `USE CATALOG` and `USE SCHEMA` on the levels above it
([Core concepts](../../content/unitycatalog/explanation/003-uc-basics/index.md)).
So one grant governs the function, whichever caller turns up. The diagram
follows one function through the three kinds of caller in this post.

```likec4 ucFunctions_oneFunctionManyCallers
unitycatalog-ai registers order_total's signature, docstring, and body in the
Unity Catalog server. An app's execute_function call fetches the function by
name. Per the server's source, the server returns it only with EXECUTE, USE
SCHEMA, and USE CATALOG. The client rebuilds the function, caches it, and runs
it in a sandboxed child process on the caller's machine; after a replace
elsewhere, it keeps running the cached body until its cache is cleared. For
Spark, unitycatalog-ai fetches the function as a Python callable and registers
it as a session UDF. For an agent, UCFunctionToolkit fetches each listed
function and sends the model tool definitions with a name, a description, and
a JSON Schema. The model returns a tool call, and the toolkit runs it through
unitycatalog-ai, which fetches the function's metadata again and runs it
locally.
```

Even the catalog's own CLI runs functions on the caller's side. Its
`function call` command fetches the function and hands the body to a local
`python3` process
([`FunctionCli.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/examples/cli/src/main/java/io/unitycatalog/cli/FunctionCli.java#L120-L132),
[`PythonInvoker.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/examples/cli/src/main/java/io/unitycatalog/cli/utils/PythonInvoker.java#L21-L22)).

## Calling a function from a query engine

Spark can't call a Unity Catalog function by name, but it can run one you
fetch with `unitycatalog-ai` and register as a session UDF. The Unity Catalog
Spark connector resolves tables, namespaces, and views. It doesn't resolve
functions: in the connector's source, `UCSingleCatalog` extends `StagingTableCatalog`,
`SupportsNamespaces`, and view support, but not Spark's `FunctionCatalog`
([`UCSingleCatalog.scala`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/connectors/spark/src/main/scala/io/unitycatalog/spark/UCSingleCatalog.scala#L43-L47)).
Calling the function by its catalog name in Spark SQL therefore fails with
`[MISSING_CATALOG_ABILITY.FUNCTIONS] Catalog unity does not support functions.`
([Use catalog functions in Spark](../../content/unitycatalog/how-to/028-spark-functions/index.md)).

`unitycatalog-ai` returns the stored function as a Python callable, the
catalog record supplies its return type, and `spark.udf.register` makes it a
session UDF:

```python file=./snippets/spark_udf.py start=start:udf end=end:udf
```

Inside the session, SQL calls it by the short name you registered, and
DataFrames reach it through `expr` or `call_function`. The query returns
`53.97`, the same answer the app and the agent get below. Spark's Python
workers run it, and with `register_function=False` they don't need
`unitycatalog-ai` installed.

The workaround works for Python functions only: a function with a SQL body
can't be fetched as a callable. The session runs its own copy, which doesn't
follow a replace in the catalog. That part isn't Spark's alone. Every
`unitycatalog-ai` client keeps the body it first ran, as the next section
shows. Spark adds one more cost: the session copy keeps running even after
someone deletes the function. Arguments need care too. A plain `19.99`
reaches the function as a `Decimal`, and the call quietly returns `NULL`, so
write `19.99D`. The how-to covers the rest, including return types, missing
defaults, and refreshing the session copy.

I still think this is the right shape, even with the caveats. The definition
and the grant stay in one place, and Spark is one more caller of it.

## Running a function from an app or a notebook

From Python code, `unitycatalog-ai`'s `UnitycatalogFunctionClient` runs a
function by name. It fetches the stored definition, rebuilds it, and runs it
in a sandboxed child process by default, or in your own process with
`execution_mode="local"`
([Run catalog functions in applications and notebooks](../../content/unitycatalog/how-to/020-run-functions/index.md)):

```python file=./snippets/one_function.py start=start:run end=end:run
```

Synchronous code calls `execute_function`, and async code awaits
`execute_function_async`. In a marimo notebook, both a top-level `await` and
the synchronous call work in a cell. The client checks every argument against
the stored parameter types before it runs anything, so `20` for a `DOUBLE`
parameter raises a `ValueError` instead of running the function. Anything that
goes wrong inside the function comes back in `result.error`, with the full
traceback in sandbox mode.

Fetching the definition again doesn't mean running the newest code. The client
caches each function the first time it runs it, and a replace from another
client doesn't clear that cache. An app or an agent that already ran the old
body keeps running it until it calls `clear_function_cache()` or creates a new
client
([Manage Python functions](../../content/unitycatalog/how-to/018-manage-python-functions/index.md#replace-a-function)).
If you replace functions while callers are live, plan for that the same way
you would for a Spark session.

The sandbox blocks imports of `sys`, `subprocess`, `ctypes`, `socket`,
`importlib`, `pickle`, `marshal`, and `shutil`
([`common.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/executor/common.py#L1-L10)).
It refuses `open`, and by default it stops a call after 20 seconds of
wall-clock time or 10 seconds of CPU time. Local mode runs the body in your
process with nothing blocked and no time limits. Use it only for functions you
trust. Either way, the app runs the code and the catalog only supplies it.
That's the same split as in Spark.

## Turning a function into an agent tool

`UCFunctionToolkit` turns the same registered function into an agent tool,
built from the catalog record. You list the functions by full name and pass
the `UnitycatalogFunctionClient`:

```python file=./snippets/one_function.py start=start:toolkit end=end:toolkit
```

The tool's name is the function's full name with `__` in place of the dots,
its description is the docstring's summary, and each argument carries its
`Args:` description and a JSON Schema type. Nobody wrote a tool schema by
hand. The docstring you wrote for humans in the catalog is the same text the
model reads.

The model only ever asks: it returns a tool call, a name with JSON arguments.
Your code decides whether to run it, and the run goes through the same client
as the app above, which fetches the function from the catalog again and runs
it on the agent's machine. The model gets the tool definitions and the
results, never the source code.

The same function works with LangChain, OpenAI, and Claude. Three integration
packages ship the toolkit, and they differ in how arguments arrive and how you
run the calls:

| Package | Builds | Arguments | How to run calls |
| --- | --- | --- | --- |
| [`unitycatalog-langchain`](../../content/unitycatalog/how-to/017-langchain-tools/index.md) | LangChain tools | The tool's schema validates them first. | Hand the tools to an agent, through a small async adapter in an async session. |
| [`unitycatalog-openai`](../../content/unitycatalog/how-to/027-openai-tools/index.md) | Chat Completions tool definitions with `strict: true` | Every argument is required, defaults included. | Your own dispatcher over `toolkit.tools_dict`. |
| [`unitycatalog-anthropic`](../../content/unitycatalog/how-to/027-anthropic-tools/index.md) | Messages API tool definitions | No argument is marked required, so your loop returns a missing one as an error. | Your own loop that answers each `tool_use` block with a `tool_result`. |

The [agent tool tutorial](../../content/unitycatalog/tutorials/010-agent-tool/index.md)
walks through the LangChain path step by step.

Choose the functions explicitly. A toolkit also accepts `catalog.schema.*`. A
wildcard expands when you build the toolkit, and the server lists only the
functions the caller could view
([Manage Python functions](../../content/unitycatalog/how-to/018-manage-python-functions/index.md#view-a-function-and-get-its-source-back)).
So the next toolkit you build from it also picks up every function registered
in the schema since, or newly granted to you, while a toolkit you already
built doesn't change
([Use catalog functions as LangChain tools](../../content/unitycatalog/how-to/017-langchain-tools/index.md#choose-which-functions-become-tools)).
A list of full names is an
allowlist you can review. With a wildcard, anyone who can register functions
in that schema can add tools to your agent, and registering one takes
`CREATE FUNCTION` on the schema plus `USE CATALOG` and `USE SCHEMA`.

## Where the guardrails live

The guardrails sit in three places: the catalog's grants, the sandbox on the
caller's machine, and your own tool loop. None of the three is enough on its
own.

### The grants decide who can fetch a function

With authorization enabled, the server returns a function only to a caller
with `USE CATALOG` on its catalog, `USE SCHEMA` on its schema, and `EXECUTE`
on the function. Ownership can stand in for each of these. The toolkit
fetches each function when it builds a tool, and the client fetches it again
on every call, so the check applies to every call, not only when the agent
starts
([Use catalog functions as LangChain tools](../../content/unitycatalog/how-to/017-langchain-tools/index.md#control-who-can-call-a-function),
[`FunctionService.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/FunctionService.java)).
What the check gates is access, not freshness: a client still runs the body it
cached on its first call until it calls `clear_function_cache()` or creates a
new client. These rules come from the server's source, and the docs haven't
run them against a server with authorization enabled.
Registering a function takes `CREATE FUNCTION` on the schema plus
`USE CATALOG` and `USE SCHEMA`, so whoever holds those decides what a wildcard
toolkit offers. Grant them carefully.

### The sandbox guards against accidents

The sandbox limits imports and resources, but I wouldn't treat it as a strong
isolation boundary. It blocks modules by name, and a package your own code
imported before the call is available to the function. The memory limit
applies only on Linux. The function runs as the calling user, with the
caller's environment
([Run catalog functions in applications and notebooks](../../content/unitycatalog/how-to/020-run-functions/index.md),
[Working with Python functions](../../content/unitycatalog/tutorials/005-first-python-function/index.md)).
It guards against accidents, and it isn't a jail. If a function shouldn't be
able to touch your agent's machine, `EXECUTE` is the control that keeps it off
that machine.

### Your tool loop decides what runs

This is the guardrail that's easiest to give away. The OpenAI and Anthropic
packages each ship a `generate_tool_call_messages` helper that runs whatever
`catalog__schema__function` name the model returns, including functions that
aren't in your toolkit. So a model, or a prompt injected into one, can reach
any function the caller has `EXECUTE` on. Check each name against the
toolkit's `tools_dict` before you run anything, and send anything else back
as an error. Both provider how-tos build that dispatcher, and the Anthropic
one shows how it
[keeps calls within the toolkit](../../content/unitycatalog/how-to/027-anthropic-tools/index.md#keep-calls-within-the-toolkit).
On the OpenAI side, don't rely on `filter_accessible_functions=True` to drop
functions the caller can't use, either. It skips a function only on a
`PermissionError`, and the Unity Catalog client raises `ForbiddenException`
instead
([Use catalog functions with OpenAI-compatible tool calling](../../content/unitycatalog/how-to/027-openai-tools/index.md#build-the-tool-definitions)).

Put together, the catalog decides who can run what, the toolkit decides what
this agent is offered, and your dispatcher makes sure the model can't step
outside that offer.

## Where to go next in the docs

Each step in this post has a page in the Unity Catalog docs, with scripts
that run in CI:

| If you want to… | Read |
| --- | --- |
| Register, inspect, and run a first function | [Working with Python functions](../../content/unitycatalog/tutorials/005-first-python-function/index.md) |
| Register, view, replace, and delete functions | [Manage Python functions](../../content/unitycatalog/how-to/018-manage-python-functions/index.md) |
| Run functions from apps and notebooks, set limits, read errors | [Run catalog functions in applications and notebooks](../../content/unitycatalog/how-to/020-run-functions/index.md) |
| Call a function from Spark SQL and DataFrames | [Use catalog functions in Spark](../../content/unitycatalog/how-to/028-spark-functions/index.md) |
| Give functions to a LangChain agent | [Use catalog functions as LangChain tools](../../content/unitycatalog/how-to/017-langchain-tools/index.md) |
| Run tool calls from OpenAI or a compatible server | [Use catalog functions with OpenAI-compatible tool calling](../../content/unitycatalog/how-to/027-openai-tools/index.md) |
| Run tool calls from Claude | [Use catalog functions with Anthropic tools](../../content/unitycatalog/how-to/027-anthropic-tools/index.md) |
| Build an agent tool end to end | [Build an agent tool from a catalog function](../../content/unitycatalog/tutorials/010-agent-tool/index.md) |

Start small: register one function you'd otherwise paste into an agent's
repository, then give it to an agent with the agent tool tutorial above. Once
the definition lives in the catalog, every next caller, whether a Spark job,
an app, or a second agent, is a grant away rather than a copy away.
