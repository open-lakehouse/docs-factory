---
title: Create and manage catalogs and schemas
summary: Create, inspect, update, rename, and delete Unity Catalog catalogs and schemas with the Python SDK or the CLI.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

This page shows how to create and manage catalogs and schemas in
[Unity Catalog](model:unityCatalogOSS). A catalog is the top level of the
three-level namespace. It contains schemas, and a schema contains tables,
volumes, functions, and registered models. For how these objects relate, see
[Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md).

## Requirements

- A Unity Catalog server, version 0.6.0. To follow along locally, save the two
  files below in one folder and run `docker compose up -d`. The server listens
  on `http://localhost:8080` with authorization disabled, so every request
  succeeds without a token.
- For the Python examples, Python 3.11 or later and the
  [`unitycatalog-client`](https://pypi.org/project/unitycatalog-client/) package,
  version 0.6.0. The SDK is asynchronous; run the snippets inside an `async`
  function.
- For the CLI examples, Docker. The `uc` CLI ships in the server image, so these
  examples run it inside the container from the folder that holds
  `compose.yaml`.

```yaml file=./compose.yaml title="compose.yaml"
```

```properties file=./server.properties title="server.properties"
```

Set up the client for your interface:

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:connect end=end:connect
```

Create one `CatalogsApi` and one `SchemasApi` from an open client:
`async with ApiClient(config) as api: catalogs = CatalogsApi(api)`.
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:setup end=end:setup
```

The CLI connects to `http://localhost:8080` by default. Pass `--server` and
`--auth_token` to reach a different server.
:::

## Create a catalog

Give the catalog a name, plus an optional comment and key-value properties.

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:create-catalog end=end:create-catalog
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:create-catalog end=end:create-catalog
```
:::

To give the catalog its own managed storage for managed tables and volumes, also
pass `storage_root` (`--storage_root` in the CLI), for example
`file:///srv/uc/retail` or `s3://bucket/retail`. Without it, managed objects in
this catalog need a storage root on their schema or a server-wide default.

**Required privileges:** `CREATE_CATALOG` on the metastore, or metastore
ownership. With `storage_root`, you also need `CREATE_MANAGED_STORAGE` on (or
ownership of) the external location that contains the path.

## View catalogs

List the catalogs you can see, or fetch one by name.

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:view-catalogs end=end:view-catalogs
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:view-catalogs end=end:view-catalogs
```
:::

**Required privileges:** to get a catalog, you need `USE_CATALOG` on it or
ownership of it (or of the metastore). A list returns only the catalogs you
could get.

## Update a catalog

Change the comment, the properties, or the name (`new_name`).

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:update-catalog end=end:update-catalog
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:update-catalog end=end:update-catalog
```
:::

:::warning
`properties` replaces the whole map, so include every key you want to keep.
Updating only the comment leaves the properties unchanged.
:::

**Required privileges:** ownership of the catalog.

## Create a schema

A schema always belongs to one catalog. Like a catalog, it accepts a comment,
properties, and an optional `storage_root`. A schema's storage root takes
precedence over its catalog's.

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:create-schema end=end:create-schema
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:create-schema end=end:create-schema
```
:::

**Required privileges:** `USE_CATALOG` and `CREATE_SCHEMA` on the catalog, or
ownership of the catalog. A `storage_root` needs the same external-location
privilege as a catalog's.

## View schemas

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:view-schemas end=end:view-schemas
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:view-schemas end=end:view-schemas
```
:::

**Required privileges:** `USE_CATALOG` on the catalog and `USE_SCHEMA` on the
schema, or ownership of the schema, catalog, or metastore.

## Update or rename a schema

Pass `new_name` to rename a schema. The schema keeps its contents, and its full
name changes from `retail.staging` to `retail.sales`.

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:update-schema end=end:update-schema
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:update-schema end=end:update-schema
```
:::

**Required privileges:** ownership of the schema or the metastore.

:::caution
In 0.6.0 the server also allows schema updates, renames included, for any
principal with `USE_CATALOG` and `USE_SCHEMA`. Grant those privileges with that
in mind.
:::

## Delete a schema or catalog

The server rejects a delete while the target still contains objects. It returns
HTTP 400 with `FAILED_PRECONDITION`, and the SDK raises `BadRequestException`:

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:delete-nonempty end=end:delete-nonempty
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:delete-nonempty end=end:delete-nonempty
```

The command exits non-zero, with the message
`Cannot delete catalog with schemas. Use force=true to force deletion.`
:::

Delete the contents first, starting with the innermost objects:

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:delete-inward end=end:delete-inward
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:delete-inward end=end:delete-inward
```
:::

Or delete a catalog with everything in it:

:::tab[Python SDK]
```python file=./snippets/catalogs.py start=start:delete-force end=end:delete-force
```
:::

:::tab[CLI]
```bash file=./snippets/catalogs.sh start=start:delete-force end=end:delete-force
```
:::

:::danger
A forced delete removes every schema, table, volume, function, and model in the
catalog, and it can't be undone. The server also deletes the directories of
managed tables and volumes. That cleanup is best effort: if it fails, the
server logs the error and still removes the metadata. External tables and
volumes lose only their metadata, and their files stay where they are.
:::

**Required privileges:** to delete a catalog, you need ownership of the catalog
or the metastore. To delete a schema, you need ownership of the schema plus
`USE_CATALOG`, or ownership of the catalog or metastore.

The privilege rules on this page come from the server's 0.6.0 authorization
expressions (`CatalogService`, `SchemaService`). They apply only when the
server runs with authorization enabled.

## Next steps

- [Register an existing external table](../register-external-table/index.md) in
  your new schema.
- [Create and manage volumes](../manage-volumes/index.md) for files.
- [Use the Python client](../../tutorials/python-client/index.md) for a guided
  walkthrough of the same SDK.
