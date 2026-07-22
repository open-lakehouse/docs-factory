---
title: Use the Python client
summary: Install the official unitycatalog-client, connect to a running server, then create a catalog, schema, and table — and handle a not-found error — with the async SDK.
diataxis: tutorial
project: unitycatalog
engines: [python]
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

This tutorial uses the official [`unitycatalog-client`](https://pypi.org/project/unitycatalog-client/)
Python SDK to talk to a running [Unity Catalog](model:unityCatalogOSS) server. You
will connect, create a [catalog](model:lakehouse.catalog), a schema, and a table,
see how the client reports a missing resource, and clean up.

The SDK is **async** and generated from the Unity Catalog OpenAPI spec: you drive
one `ApiClient` as an async context manager and call per-resource API classes
(`CatalogsApi`, `SchemasApi`, `TablesApi`) on it. Every step below pulls its code
from a single runnable file our CI executes against a real server, so what you
copy is what we test.

## Prerequisites

- **Python 3.11+**
- **[uv](https://docs.astral.sh/uv/)** — used to run the script with its
  dependencies resolved automatically
- **A running Unity Catalog server.** The quickest way is Docker — the tutorial
  ships a compose file next to this page:

  ```bash
  docker compose -f docker-compose.uc.yml up
  ```

  This starts the open-source server on `http://localhost:8080`. (Or follow
  [Start your first server](../first-server.md) to run one yourself.)

## Run it end to end

The whole flow is one self-contained script, `catalog_flow.py`, sitting next to
this page. It declares its own dependency on `unitycatalog-client` inline (a
[PEP 723](https://peps.python.org/pep-0723/) header), so you can run it with no
setup beyond `uv`:

```bash
uv run catalog_flow.py
```

It connects to `http://localhost:8080` by default; point it elsewhere with
`UC_BASE_URL`. The rest of this page walks through what it does.

## Step 1 — Import the SDK

```python file=./catalog_flow.py start=start:imports end=end:imports
```

The API classes and the request models (`CreateCatalog`, `CreateSchema`,
`CreateTable`) all come from the top-level `unitycatalog.client` package;
exceptions live in `unitycatalog.client.exceptions`.

## Step 2 — Connect

Point a `Configuration` at the server and open an `ApiClient`. The client is an
async context manager, so everything runs inside `async with`. Each resource
type has its own API class constructed from that client:

```python file=./catalog_flow.py start=start:connect end=end:connect
```

:::note
`Configuration`'s default host is `http://localhost:8080/api/2.1/unity-catalog`
— the API version prefix is already included, so you pass just the base URL.
:::

## Step 3 — Create a catalog

A catalog is the top-level namespace. Create ops take a single request model:

```python file=./catalog_flow.py start=start:create-catalog end=end:create-catalog
```

## Step 4 — List catalogs

List calls return a response object whose `.catalogs` holds the items:

```python file=./catalog_flow.py start=start:list-catalogs end=end:list-catalogs
```

## Step 5 — Create a schema

A schema lives inside a catalog. `SchemaInfo.full_name` gives you the dotted
`catalog.schema` name:

```python file=./catalog_flow.py start=start:create-schema end=end:create-schema
```

## Step 6 — Create a table

Tables belong to a schema. This creates an external Delta table with a single
column, pointing at a `file://` storage location the server can write:

```python file=./catalog_flow.py start=start:create-table end=end:create-table
```

## Step 7 — Handle a missing resource

When you request something that does not exist, the client raises a typed
exception carrying the HTTP status:

```python file=./catalog_flow.py start=start:handle-error end=end:handle-error
```

Other 4xx/5xx responses map to sibling exceptions (`BadRequestException`,
`UnauthorizedException`, …), all subclasses of `ApiException`.

## Step 8 — Clean up

Delete inner-to-outer — tables before their schema, schemas before their
catalog:

```python file=./catalog_flow.py start=start:cleanup end=end:cleanup
```

:::note
Deletion order matters: a non-empty catalog or schema will not delete unless you
pass `force=True`.
:::

## Next steps

- [Run a PostgreSQL-backed server](../postgres-server.md) — persist catalog data across restarts.
- [Manage catalogs](../how-to/manage-catalogs.md) — the task-focused how-to reference.
