---
title: Use the Python client
summary: Connect to Unity Catalog 0.6.0 with the asynchronous unitycatalog-client SDK, create a catalog, a schema, and a table, handle a missing object, and clean up.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

In this tutorial you build the same small catalog as in
[Create your first catalog](../getting-started/index.md), this time from
Python with [`unitycatalog-client`](https://pypi.org/project/unitycatalog-client/),
the official SDK for the [Unity Catalog](model:unityCatalogOSS) REST API. You
connect, create a catalog, a schema, and a table, see how the client reports
an object that doesn't exist, and clean up. Applications, notebooks, and
scripts use the same calls to manage catalog objects.

You need Docker and [uv](https://docs.astral.sh/uv/). It takes about ten
minutes.

::::journey

### Open a Python session

Start the [local server](../../how-to/run-local-server/index.md) if it isn't
already running from an earlier tutorial. Then open a Python session with the
client installed:

```bash
uv run --with unitycatalog-client==0.6.0 python -m asyncio
```

`python -m asyncio` is a Python shell that accepts `await` at the top level.
The client is asynchronous, so every call is awaited. Enter each of the
following snippets in it, in order.

### Connect to the server

Point a `Configuration` at the server and open an `ApiClient`. Each resource
type has its own API class built on that client:

```python file=./snippets/catalog_flow.py start=start:connect end=end:connect
```

The host includes the API prefix, `/api/2.1/unity-catalog`. Authorization is
off on the local server, so the client needs no token.

### Create a catalog

Every create call takes one request object:

```python file=./snippets/catalog_flow.py start=start:create-catalog end=end:create-catalog
```

The server returns the new catalog, including the `id` it generated.

### List catalogs

A list call returns a response object. Its `catalogs` field holds the items:

```python file=./snippets/catalog_flow.py start=start:list-catalogs end=end:list-catalogs
```

`quickstart` is listed next to the sample catalogs `unity` and `production`.

### Create a schema

A schema lives inside one catalog:

```python file=./snippets/catalog_flow.py start=start:create-schema end=end:create-schema
```

### Create a table

Register an external Delta table with one column in the new schema:

```python file=./snippets/catalog_flow.py start=start:create-table end=end:create-table
```

Each column carries its type three ways: a `type_name` enum, a SQL
`type_text`, and `type_json`, the column in Delta schema form. Registering a
table stores only metadata, so the location doesn't need to exist yet.
[Register an existing external table](../../how-to/register-external-table/index.md)
shows how to read these values from a real Delta table.

### Handle a missing object

Asking for an object that doesn't exist raises a typed exception that carries
the HTTP status:

```python file=./snippets/catalog_flow.py start=start:handle-error end=end:handle-error
```

Other error responses raise sibling exceptions such as `BadRequestException`
and `UnauthorizedException`, all subclasses of `ApiException`.

### Clean up

Delete from the inside out, the table before its schema and the schema before
its catalog:

```python file=./snippets/catalog_flow.py start=start:cleanup end=end:cleanup
```

The server refuses to delete a catalog or schema that still holds objects,
unless you pass `force=True`. Leave the session with `Ctrl+D`.

::::

## What you did

You managed catalog objects from Python with the same requests the `uc` CLI
sends. Every client, from this SDK to Spark, talks to the same REST API and
sees the same names.

## Next steps

- [Create and manage catalogs and schemas](../../how-to/manage-catalogs-and-schemas/index.md)
  covers updating, renaming, and deleting them from Python or the CLI.
- [Create and update a catalog-managed Delta table](../managed-delta-table/index.md)
  writes real data into a table that Unity Catalog manages.
