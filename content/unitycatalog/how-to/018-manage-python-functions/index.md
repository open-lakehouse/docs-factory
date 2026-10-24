---
title: Manage Python functions
summary: Unity Catalog stores a Python function's signature, docstring, and body, and the caller runs it. Register, view, replace, and delete one with unitycatalog-ai.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - lakehouse.function
  - unityCatalogAi
status: ready
---

A [registered function](model:lakehouse.function) in
[Unity Catalog](model:unityCatalogServer) is metadata plus source text: a
three-part name, typed parameters, a return type, comments from the docstring,
and the function's body. The server doesn't run it. A caller fetches the
function by name and runs the body on its own machine. This page uses
[`unitycatalog-ai`](model:unityCatalogAi), the client library for catalog
functions, to register, view, replace, and delete them.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- A catalog and schema to hold the functions, such as `tools.pricing`:
  [Manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).
:::

## Set up the client

In the folder that holds your functions, start Python with `unitycatalog-ai`:

```bash
EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-ai==0.4.0 python -m asyncio
```

Use Python 3.12, the version this page's scripts run on. The command raises
the function sandbox's memory cap (`EXECUTOR_MAX_MEMORY_LIMIT`, in megabytes)
to 4096, the value the scripts use.

Create the function client:

```python file=./snippets/functions.py start=start:connect end=end:connect
```

## Write a function the catalog can store

The client builds the stored record from the function's source code, its type
hints, and its docstring. Save the function in a module, such as `pricing.py`
in the session's folder:

```python file=./snippets/pricing.py start=start:shipping-cost end=end:shipping-cost title="pricing.py"
```

Then import the module into the session:

```python file=./snippets/functions.py start=start:import-module end=end:import-module
```

The client reads the source from the module's file. A function with no source
file to read, such as one created with `exec`, fails with
`OSError: could not get source code`.

### Type hints

Every parameter and the return value need a type hint. The catalog stores each
one as SQL type text:

| Python type hint | Stored type text |
| --- | --- |
| `int` | `LONG` |
| `float` | `DOUBLE` |
| `str` | `STRING` |
| `bool` | `BOOLEAN` |
| `datetime.date` | `DATE` |
| `datetime.datetime` | `TIMESTAMP` |
| `bytes` | `BINARY` |
| `list[int]` | `ARRAY<LONG>` |
| `dict[str, int]` | `MAP<STRING, LONG>` |
| `list` | `ARRAY` |
| `dict` | `MAP` |
| `list[str]` (return value) | `ARRAY<STRING>` |
| `Optional[int]` | `LONG` |

A plain `list` or `dict` is accepted, but `typing.List` with no element type
isn't. A parameter gets a stored default only from a Python default: `= None`
is stored as `NULL`, and `= 7` as `7`.

The client rejects these hints with a `ValueError` before it sends a request:

- `Union[...]`, `Any`, and `typing.List` with no element type.
- `int | None`. Write `Optional[int]` instead.
- `*args` and `**kwargs`.
- A parameter with no hint (`Missing type hint for parameter: x.`) or a return
  value with no hint.

A `decimal.Decimal` hint fails too, with a pydantic `ValidationError`.

### Docstrings

Write the docstring in Google style. Its description, every paragraph before
`Args:` joined into one line, becomes the function's comment, and each entry under `Args:` becomes that parameter's comment. A
function with no docstring, or with a docstring that has only an `Args:`
section, is rejected with a `ValueError`. When the `Args:` entries don't match
the signature, the client only issues a `UserWarning` and registers the
function, without comments for the parameters it couldn't match.

### Imports

The catalog stores only the function's body, not the module around it. Import
what the body needs inside the body, as `shipping_cost` does with `math`. A
function that uses a module imported at the top of its file registers, but a
call returns `NameError: name 'math' is not defined` as its error.

## Register a function

Pass the function, the catalog, and the schema:

```python file=./snippets/functions.py start=start:register end=end:register
```

The function's name in the catalog is its Python name, `shipping_cost`, under
the schema you pass.

**Required privileges:** `USE CATALOG` on the catalog, or ownership of it. Also
`USE SCHEMA` and `CREATE FUNCTION` on the schema, or ownership of it.

:::note
The privileges on this page come from the server's source
([`FunctionService.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/FunctionService.java))
and haven't been tested against a server with authorization enabled
([#282](https://github.com/open-lakehouse/docs-factory/issues/282)).
:::
<!-- TODO(open question): verify the function privileges on an authorization-on environment (follow-up #282). -->

## Register a function that calls helpers

A plain registration stores only the body of the function you pass, so helpers
it calls aren't stored. `order_total` calls `apply_discount`:

```python file=./snippets/pricing.py start=start:order-total end=end:order-total title="pricing.py"
```

If you register it with `create_python_function_async`, a call to `order_total` returns
a traceback ending in `NameError: name 'apply_discount' is not defined` as its
error. To store the helpers too, register the function with
`create_wrapped_function_async` and list the helpers in `functions`:

```python file=./snippets/functions.py start=start:wrap-helpers end=end:wrap-helpers
```

The stored body starts with each helper's source, followed by the body of
`order_total`. The name, signature, and comments come from `order_total`.

**Required privileges:** the same as for
[registering a function](#register-a-function).

## View a function and get its source back

Fetch a function by its full name to see what the catalog stores:

```python file=./snippets/functions.py start=start:view end=end:view
```

List the functions in a schema:

```python file=./snippets/functions.py start=start:list end=end:list
```

Print the function as Python source:

```python file=./snippets/functions.py start=start:get-source end=end:get-source
```

Or get it back as a Python function you can call in the session:

```python file=./snippets/functions.py start=start:as-callable end=end:as-callable
```

The client rebuilds both from the stored record. The docstring is regenerated,
with a `Returns:` section added, and the parameter defaults are left out. So
`shipping_cost(2.5)`, without `express`, raises a `TypeError`.

**Required privileges:** one of the following. A call to the function looks it
up first, so running it needs the same.

- Ownership of the metastore or of the function's catalog.
- Ownership of the function's schema, plus `USE CATALOG` on its catalog.
- `USE CATALOG` on the catalog, `USE SCHEMA` on the schema, and `EXECUTE` on
  the function or ownership of it.

Listing returns only the functions you could view this way.

## Replace a function

Functions have no update call, so changing a function's body or its comment
means replacing it. Registering a name that already exists fails:

```python file=./snippets/functions.py start=start:name-conflict end=end:name-conflict
```

The message is
`Function tools.pricing.shipping_cost already exists. Set replace=True to overwrite it.`
Edit the function in `pricing.py`:

```python file=./snippets/pricing_edited.py start=start:shipping-cost end=end:shipping-cost title="pricing.py"
```

Then reload the module and register the function again with `replace=True`:

```python file=./snippets/functions.py start=start:replace end=end:replace
```

A replace deletes the function and creates it again. The new function has a
new `function_id`, and the client that replaced it runs the new body.

:::warning
A replace isn't atomic. If the create fails after the delete, no function is
left under the name. For example, the server stores a comment of at most
65,535 characters
([`FunctionInfoDAO.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/persist/dao/FunctionInfoDAO.java#L35)),
so a replace with a 70,000-character docstring fails with HTTP 500 and the
original is gone. Register the function again to
restore it.
:::

:::warning
Other clients keep running the old body. A client caches each function the
first time it runs it, and a replace from another client doesn't clear that
cache. In each application that already ran the function, clear the cache:

```python file=./snippets/caching.py start=start:clear-cache end=end:clear-cache
```
:::

**Required privileges:** those for viewing, deleting, and registering a
function. The client gets, deletes, then creates the function
([`client.py`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/ai/core/src/unitycatalog/ai/core/client.py)),
so a replace needs all three.

## Delete a function

Delete a function by its full name:

```python file=./snippets/functions.py start=start:delete end=end:delete
```

After the delete, `get_function_async` returns `None`.

**Required privileges:** one of the following.

- Ownership of the function's catalog.
- Ownership of the function's schema, plus `USE CATALOG` on its catalog.
- `USE CATALOG` on the catalog, `USE SCHEMA` on the schema, and ownership of
  the function.

## Next steps

- Register, inspect, and run a function step by step in
  [Working with Python functions](../../tutorials/first-python-function/index.md).
- Learn how functions, schemas, and privileges fit together in
  [Core concepts](../../explanation/uc-basics/index.md).
- [Manage catalogs and schemas](../manage-catalogs-and-schemas/index.md) to
  organize your functions.
