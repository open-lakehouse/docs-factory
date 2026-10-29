---
title: Use catalog functions with Anthropic tools
summary: UCFunctionToolkit turns Unity Catalog functions into Messages API tool definitions. Your own loop runs each tool_use block and sends Claude the result.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - unityCatalogAi
  - unityCatalogAnthropic
  - lakehouse.function
status: draft
---

This page builds a bounded tool loop around the Anthropic SDK: Claude gets the
Python functions you registered in [Unity Catalog](model:unityCatalogServer) as
tools, your code runs the calls Claude asks for, and errors go back to Claude
flagged as errors. The `unitycatalog-anthropic` package supplies the tool
definitions. The catalog stores each [function's](model:lakehouse.function)
signature, descriptions, and source code. Claude only asks for a call.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- An Anthropic API key in the `ANTHROPIC_API_KEY` environment variable.
- With authorization enabled, the privileges to register and call functions:
  [Control who can call a function](#control-who-can-call-a-function).
:::

## Set up the clients

Start Python with the Anthropic integration and the Anthropic SDK:

```bash
EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-ai==0.4.0 --with unitycatalog-anthropic==0.2.0 --with anthropic==1.17.0 python -m asyncio
```

:::note
Use Python 3.12, or 3.13.3 or later. On 3.13.0 to 3.13.2, a function that
raises loses its traceback, and the call returns the generic "no output was
produced" notice instead.
:::

:::note
`EXECUTOR_MAX_MEMORY_LIMIT` raises the function sandbox's memory cap, which
applies only on Linux, from 100 MB by default to 4096 MB.
:::

Create the function client:

```python file=./snippets/tools.py start=start:connect end=end:connect
```

Create the Anthropic client. `AsyncAnthropic()` reads your key from
`ANTHROPIC_API_KEY`, and an endpoint other than Anthropic's from
`ANTHROPIC_BASE_URL` when you set it:

```python file=./snippets/tools.py start=start:anthropic-client end=end:anthropic-client
```

## Register the functions the model may call

Claude decides when to call a function from its description. The docstring's
summary becomes the tool's description, and each `Args:` line becomes that
argument's description.

Create a catalog and a schema for the functions:

```python file=./snippets/tools.py start=start:namespace end=end:namespace
```

Save two functions as `pricing.py`, in the folder where the session runs:

```python file=./snippets/pricing.py start=start:order-total end=end:order-total title="pricing.py"
```

Add the second function to the same file:

```python file=./snippets/pricing.py start=start:shipping-cost end=end:shipping-cost
```

Then register them:

```python file=./snippets/tools.py start=start:register end=end:register
```

## Build tool definitions for the Messages API

List the functions by full name to build the toolkit, then turn each tool into
the dictionary the Messages API takes:

```python file=./snippets/tools.py start=start:toolkit end=end:toolkit
```

:::tip
Always pass the function client to the toolkit as `client=`. Without it, and
with no default client set by `set_uc_function_client`, the toolkit raises
`ValueError: No client provided, …`.
:::

Print the first definition to see what Claude gets:

```python file=./snippets/tools.py start=start:tool-definition end=end:tool-definition
```

Each definition has a `name`, a `description`, and an `input_schema`:

- The `name` is the function's full name with `__` in place of the dots. A
  name longer than 64 characters keeps its last 64.
- The `description` is the docstring's summary.
- The `input_schema` lists each argument with its JSON Schema type and its
  `Args:` description. A default is added to the description, as in `(Default:
  0.0)`.

The schema's `required` list is always empty, and an argument without a
default gets `"default": null`. So Claude can leave out an argument the
function needs. That call fails with `Parameter quantity is required but not
provided.`, which your loop returns to Claude as an error (see
[Return function errors to the model](#return-function-errors-to-the-model)).

To include every function in a schema, use `catalog.schema.*`:

```python file=./snippets/tools.py start=start:wildcard end=end:wildcard
```

:::warning
A wildcard also picks up functions that someone registers in the schema later.
The next toolkit you build from it offers Claude those functions too. List the
functions by name to keep an explicit allowlist of what Claude may call.
:::

## Send a request with the tools

Pass the definitions as `tools` with the question. The SDK also accepts
`toolkit.tools` as it is, and sends the same request body. When Claude wants a
function's result, the response stops with `stop_reason` `tool_use`, and its
content holds a `tool_use` block for each call. Here they follow a line of text:

```python file=./snippets/tools.py start=start:request end=end:request
```

Each block carries an `id`, the tool's `name`, and the arguments in `input`.
One response can ask for several calls, as this one does.

:::note
CI runs this page's code against a local stand-in for the Messages API, not
against Claude.
:::

## Run the tool calls and return the results

Your code runs each `tool_use` block and answers it with a `tool_result` block
that carries the same `tool_use_id`. Map each tool name back to its function,
then run the calls:

```python file=./snippets/tools.py start=start:tool-results end=end:tool-results
```

`run_tool_calls` returns one result per block, in order, with the function's
return value as text:

```python file=./snippets/tools.py start=start:run-tools end=end:run-tools
```

The function client can't run two calls at once: concurrent
`execute_function_async` calls on one client
[deadlock](../run-functions/index.md#run-calls-concurrently). So the loop awaits
each call before it starts the next.

Send the results back in a `user` message, after the assistant turn they
answer. Pass the response's `content` back unchanged, text included:

```python file=./snippets/tools.py start=start:send-results end=end:send-results
```

Claude then answers, and the response stops with `end_turn`.

### Keep calls within the toolkit

The `functions` map holds only the toolkit's functions, so a name Claude asks
for that isn't in the toolkit returns `Unknown tool: …` as an error, and nothing
runs. The map comes from `toolkit.tools_dict`, which keys each full function
name to its tool. Don't turn a tool name back into a function name by replacing
`__` with dots: a name cut to its last 64 characters becomes a function name
that doesn't exist, such as `ols.pricing.…`.

:::warning
Don't run the calls with the package's `generate_tool_call_messages` helper:

- It runs any function in the catalog that Claude names, even one the toolkit
  doesn't list.
- It returns a function's error as the text `None` without `is_error`, so
  Claude can't tell that the call failed.
- Arguments that don't fit the function make it raise, and then no block gets
  a result.
- It rejects its own output as history, so it works for one round only.
- It turns a name cut to 64 characters into a function name that doesn't
  exist, and the call fails with an `AttributeError`.
:::

### Return function errors to the model

Return a failed call as a `tool_result` with `is_error` set to `true`, so
Claude knows the call failed. A successful result leaves `is_error` out.
`run_tool_calls` flags three cases:

- **The function raises:** the content is the function's traceback, ending in
  its error, such as `ValueError: weight_kg must be greater than zero`.
- **The tool isn't in the toolkit:** the content is `Unknown tool: …`.
- **The arguments don't fit the function:** the client raises `ValueError`
  before the function runs, and the content is its message. A missing argument
  gives `Parameter quantity is required but not provided.`. An argument the
  function doesn't declare gives `Extra parameters provided that are not defined
  in the function's input parameters …`.

Arguments reach the client as the JSON Claude sent, without type conversion.
An integer for a `DOUBLE` parameter, such as `20` for `unit_price`, fails with
`Parameter unit_price should be of type ColumnTypeName.DOUBLE …`, followed by
`but got <class 'int'>`. Return the error so Claude can retry with a float, or
convert integers to floats for `DOUBLE` parameters before you call the function.

A function that returns a falsy value, such as `0`, isn't an error. The result
is a notice that begins `The function execution has completed, but no output
was produced.` When Claude needs to see a zero or an empty result, return a
value that isn't falsy, such as a string.

## Continue a conversation over several rounds

Claude may ask for more calls after it sees the first results. Repeat the
request while the response stops with `tool_use`, and cap the number of
rounds:

```python file=./snippets/tools.py start=start:multi-round end=end:multi-round
```

Each round appends the assistant turn and a `user` message with its results.
A question that takes two rounds of calls sends three requests, the last with
five messages. The loop returns the response that stops with `end_turn` or
`stop_sequence`.

Any other stop reason, such as `max_tokens`, `refusal`, or `pause_turn`, raises
`RuntimeError: Claude stopped with '<reason>'`. A response cut off at
`max_tokens` can end in an incomplete `tool_use` block, and the loop never runs
it. To recover,
[retry with a higher `max_tokens`](https://docs.claude.com/en/api/handling-stop-reasons#max-tokens).
A model that keeps asking for tools stops the loop after `max_rounds` with
`RuntimeError: No answer after 5 rounds`.

## Test the tool loop without calling Claude

To test your loop without calling the Anthropic API, give the Anthropic client
a mock transport that returns the responses you script. The transport replaces
only the Anthropic API: the tool calls still go to Unity Catalog, so the server
must be running. The SDK runs on
`httpx2`, so build the transport from `httpx2`: the SDK raises `TypeError` for
`httpx` objects.

```python file=./snippets/tools.py start=start:mock-transport end=end:mock-transport
```

The handler records each request body, so the test can check what your loop
sent. Here, the second request ends with the `tool_result` for the scripted
`tool_use` block.

## Clean up

Delete the catalog and close both clients:

```python file=./snippets/tools.py start=start:clean-up end=end:clean-up
```

## Control who can call a function

With authorization enabled, the server returns a function only to a caller
with `USE CATALOG` on its catalog, `USE SCHEMA` on its schema, and `EXECUTE` on
the function. Ownership can stand in: of the metastore or the catalog on its
own, of the schema with `USE CATALOG`, and of the function in place of
`EXECUTE`. The toolkit fetches each function when you build it, and the client
fetches it again on every call, so the check applies both times
([toolkit](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/ai/integrations/anthropic/src/unitycatalog/ai/anthropic/toolkit.py),
[client](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/ai/core/src/unitycatalog/ai/core/client.py),
[`FunctionService.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/FunctionService.java)).
Registering the functions needs `CREATE CATALOG`, `CREATE SCHEMA`, and
`CREATE FUNCTION` where you create each object. For the exact rules, ownership
cases included, see
[Control who can call a function](../langchain-tools/index.md#control-who-can-call-a-function)
in the LangChain tools page. These rules come from the server's source, and
these docs haven't run them against a server with authorization enabled.
<!-- TODO(open question): verify EXECUTE enforcement on an authorization-on environment (follow-up #282). -->

## Next steps

- Build LangChain tools from the same functions in
  [Use catalog functions as LangChain tools](../langchain-tools/index.md).
- Call functions from your own code in
  [Run catalog functions in applications and notebooks](../run-functions/index.md).
- Register, inspect, and run functions step by step in
  [Working with Python functions](../../tutorials/first-python-function/index.md).
- List, inspect, and delete functions in
  [Manage Python functions](../manage-python-functions/index.md).
