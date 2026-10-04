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

It takes about ten minutes.

:::prerequisites
- [uv](https://docs.astral.sh/uv/), which installs the Python packages for the
  session.
:::

::::journey

### Open a Python session

Start the environment under **Prerequisites** if it isn't already running
from an earlier tutorial. Then create an empty folder and, in
it, open a Python session with `unitycatalog-ai`, the client library for
catalog functions:

```bash
mkdir first-function && cd first-function
uv run --with unitycatalog-ai==0.4.0 python -m asyncio
```

`python -m asyncio` is a Python shell that accepts `await` at the top level,
which the asynchronous client needs. Enter each of the following snippets in
it, in order.

### Connect to the server

```python file=./snippets/first_function.py start=start:connect end=end:connect
```

`unitycatalog-ai` 0.4.0 depends on the 0.4 release of `unitycatalog-client`.
It works with the 0.6.0 server for everything in this tutorial. Authorization
is off on the local server, so the client needs no token.

### Create a schema for functions

Functions live in a schema like tables do. Create a catalog and a schema for
them:

```python file=./snippets/first_function.py start=start:namespace end=end:namespace
```

### Write the function

Save the function you are going to register as `pricing.py`, in the folder
where the session runs:

```python file=./snippets/pricing.py title="pricing.py"
```

Then import it into the session:

```python file=./snippets/first_function.py start=start:import-function end=end:import-function
```

The client reads the function's source code to register it, so define
functions in a module like this one rather than typing them into the session.

Every argument and the return value need a type hint, because the catalog
stores the function's signature as SQL types: `int` becomes `LONG`, and
`float` becomes `DOUBLE`. The docstring follows the Google style. The client
stores its first paragraph as the function's comment and each `Args:` entry as
that parameter's comment. An AI agent later reads exactly these descriptions to
decide when to call the function, so they are worth writing well.

### Register the function

Hand the imported function to the client:

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

Execute the function through the catalog:

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

### List and clean up

List the functions in the schema, then remove the function and the catalog:

```python file=./snippets/first_function.py start=start:list end=end:list
```

```python file=./snippets/first_function.py start=start:clean-up end=end:clean-up
```

To register the function again under the same name, pass `replace=True` to
`create_python_function_async`; without it, registration fails with
`Function tools.pricing.order_total already exists`. Leave the session with
`Ctrl+D`.

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
