---
title: Use the Python client
summary: Use the async python SDK to query Unity Catalog and create basic securables.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

This tutorial uses the [`unitycatalog-client`](https://pypi.org/project/unitycatalog-client/)
Python SDK to talk to a running [Unity Catalog](model:unityCatalogOSS) server. You
will connect, create a catalog, a schema, and a table, and clean up.

## Prerequisites

- **Python >= 3.11+**
- **A running Unity Catalog server.** The quickest way is [Docker](../001-getting-started/index.md#managed-storage-support).

::::journey 

### Import the SDK

Import the required request types.

```python file=./catalog_flow.py start=start:imports end=end:imports
```

### Connect

Point a `Configuration` at the server and open an `ApiClient`. The client is an
async context manager, so everything runs inside `async with`. Each resource
type has its own API class constructed from that client:

```python file=./catalog_flow.py start=start:connect end=end:connect
```

:::note
`Configuration`'s default host is `http://localhost:8080/api/2.1/unity-catalog`
— the API version prefix is already included, so you pass just the base URL.
:::

### Create a catalog

A catalog is the top-level namespace. Create ops take a single request model:

```python file=./catalog_flow.py start=start:create-catalog end=end:create-catalog
```

### List catalogs

List calls return a response object whose `.catalogs` holds the items:

```python file=./catalog_flow.py start=start:list-catalogs end=end:list-catalogs
```

### Create a schema

A schema lives inside a catalog. `SchemaInfo.full_name` gives you the dotted
`catalog.schema` name:

```python file=./catalog_flow.py start=start:create-schema end=end:create-schema
```

### Create a table

Tables belong to a schema. This creates an external Delta table with a single
column, pointing at a `file://` storage location the server can write:

```python file=./catalog_flow.py start=start:create-table end=end:create-table
```

### Handle a missing resource

When you request something that does not exist, the client raises a typed
exception carrying the HTTP status:

```python file=./catalog_flow.py start=start:handle-error end=end:handle-error
```

Other 4xx/5xx responses map to sibling exceptions (`BadRequestException`,
`UnauthorizedException`, …), all subclasses of `ApiException`.

### Clean up

Delete inner-to-outer — tables before their schema, schemas before their
catalog:

```python file=./catalog_flow.py start=start:cleanup end=end:cleanup
```

:::note
Deletion order matters: a non-empty catalog or schema will not delete unless you
pass `force=True`.
:::

::::

## Next steps

- [Run a PostgreSQL-backed server](../postgres-server.md) — persist catalog data across restarts.
- [Manage catalogs](../how-to/manage-catalogs.md) — the task-focused how-to reference.
