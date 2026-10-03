---
title: Register and execute your first Python function
summary: Register a typed Python function in Unity Catalog, inspect what the catalog stores, run it through the catalog, and remove it.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
status: draft
---

In this tutorial you turn an ordinary Python function into a catalog object.
You register it under a three-part name, see what Unity Catalog stores about
it, call it by that name, and remove it again. Once a function is in the
catalog, applications and AI agents with access can find and call it by name,
without copying your code.

You need Docker and [uv](https://docs.astral.sh/uv/). It takes about ten
minutes.

::::journey

### Start the server

Create an empty folder and save these two files in it:

```yaml file=./compose.yaml title="compose.yaml"
```

```properties file=./server.properties title="server.properties"
```

Start Unity Catalog 0.6.0 and wait until it reports healthy:

```bash
docker compose up -d --wait
```

Authorization is off, so the client needs no token. Use this configuration
only on your own machine.

### Create the script

Create `first_function.py` in the same folder and start it with this header.
`uv` reads it to install `unitycatalog-ai`, the client library for catalog
functions:

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-ai==0.4.0"]
# ///
```

Then add the imports and the server address:

```python file=./snippets/first_function.py start=start:connect end=end:connect
```

`unitycatalog-ai` 0.4.0 depends on the 0.4 release of `unitycatalog-client`.
It works with the 0.6.0 server for everything in this tutorial.

### Write the function

Add the function you are going to register:

```python file=./snippets/first_function.py start=start:define end=end:define
```

Every argument and the return value need a type hint, because the catalog
stores the function's signature as SQL types: `int` becomes `LONG`, and
`float` becomes `DOUBLE`. The docstring follows the Google style. The client
stores its first paragraph as the function's comment and each `Args:` entry as
that parameter's comment. An AI agent later reads exactly these descriptions to
decide when to call the function, so they are worth writing well.

### Connect and create a schema

The client is asynchronous, so the rest of the code goes into an `async def
main()` function. Open a connection and create the function client:

```python file=./snippets/first_function.py start=start:open end=end:open
```

Functions live in a schema like tables do. Inside the `async with` block,
create a catalog and a schema for them. Every snippet from here on goes inside
that block too:

```python file=./snippets/first_function.py start=start:namespace end=end:namespace
```

### Register the function

Hand the function object to the client:

```python file=./snippets/first_function.py start=start:register end=end:register
```

The client reads the signature and docstring, then stores everything as
`tools.pricing.order_total`. Before it creates the function, it checks whether
the name is taken. The log line `Failed to retrieve function
tools.pricing.order_total ... (404)` that appears is that check, and you can
ignore it.

### See what the catalog stored

Fetch the function back from the catalog:

```python file=./snippets/first_function.py start=start:inspect end=end:inspect
```

The output shows the comment, three typed parameters with their descriptions,
`returns: DOUBLE`, and the function body:

```text
return round(quantity * unit_price * (1 - discount_pct / 100), 2)
```

That body is the important part. The catalog stores your code as text, together
with the metadata needed to call it. It doesn't run the code.

### Run the function by name

Add a call that executes the function through the catalog:

```python file=./snippets/first_function.py start=start:execute end=end:execute
```

Leave out `discount_pct` and its default of `0.0` applies, because the catalog
stored the default too:

```python file=./snippets/first_function.py start=start:default end=end:default
```

The first call returns `53.97`, and the second `59.97`.

Neither call ran on the server. The client fetched the stored
definition, rebuilt the function from it, and ran it on your machine, in a
separate Python process by default. So whoever calls a catalog function runs
it with their own Python environment and permissions. To run in the calling
process instead, pass `execution_mode="local"` to `UnitycatalogFunctionClient`.

### Pass the right types

The client checks every argument against the stored parameter types before it
runs anything. `20` is an `int`, but `unit_price` is a `DOUBLE`:

```python file=./snippets/first_function.py start=start:wrong-type end=end:wrong-type
```

The call raises `ValueError` and doesn't run the function. Pass `20.0` instead.

:::note
In `unitycatalog-ai` 0.4.0, a result that Python treats as false, such as `0`,
`0.0`, or an empty string, comes back as a message saying that no output was
produced. Check `result.value` for that message when zero is a valid answer.
:::

### List and clean up

List the functions in the schema, then remove the function and the catalog:

```python file=./snippets/first_function.py start=start:list end=end:list
```

```python file=./snippets/first_function.py start=start:clean-up end=end:clean-up
```

### Run the script

Close the script with an entry point, outside `main()`:

```python
asyncio.run(main())
```

Then run it from the folder:

```bash
uv run first_function.py
```

You see the function's name, its stored description and body, `53.97`,
`59.97`, the `ValueError` message, and the list with your one function.

If a run stops partway, the function stays registered, and the next run fails
with `Function tools.pricing.order_total already exists`. Delete the catalog
with `CatalogsApi(api).delete_catalog(name="tools", force=True)`, or pass
`replace=True` to `create_python_function_async` to overwrite the function.

Stop the server when you are done:

```bash
docker compose down
```

::::

## What you did

You registered a Python function under a catalog name. Unity Catalog stored its
signature, descriptions, default, and source code, and the client used that
record to validate arguments and run the function on your side. Catalog
functions work this way in general: the catalog makes them discoverable and
governed, and the caller runs them.

## Next steps

- [Choose a client or engine](../../reference/clients-and-engines/index.md)
  lists the framework integrations that turn catalog functions into agent
  tools, such as `unitycatalog-langchain` and `unitycatalog-openai`.
- [Features, scope, and limitations](../../reference/features-and-limitations/index.md)
  covers what the server supports for functions, such as delete-and-recreate
  instead of update.
