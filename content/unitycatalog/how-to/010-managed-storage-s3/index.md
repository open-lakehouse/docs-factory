---
title: Set managed storage for catalogs and schemas on S3
summary: Give Unity Catalog catalogs and schemas S3 storage roots under an external location, see where managed volumes and tables land, and avoid roots that the server accepts but can't vend credentials for.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
  - lakehouse.objectStorage
status: draft
---

This page shows how to set the storage root that
[Unity Catalog](model:unityCatalogOSS) uses for managed tables and volumes.
When you create a managed object, you don't give it a location. The server
allocates one under the schema's storage root or, if the schema has none, under
the catalog's. On S3, that root must lie inside an
[external location](../configure-aws-storage/index.md), because the external
location's storage credential is what the server uses to vend access to the
managed data. For the difference between managed and external objects, see
[External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md).

## Requirements

- Unity Catalog server 0.4.0 or later. This page is tested against 0.6.0. The
  `storage-root.tables` server property is deprecated in 0.6.0; use catalog and
  schema roots instead.
- A server configured for AWS with a storage credential and an external
  location, as in
  [Configure AWS storage credentials and external locations](../configure-aws-storage/index.md).
- For the Python examples, Python 3.11 or later with `unitycatalog-client` 0.6.0
  and `obstore`. For the CLI examples, Docker.

To try the steps locally, save the files below in one folder and run
`docker compose up -d`. The stack is the same aws-sim setup as on the AWS
storage page. Run host-side clients with
`AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true`.

```yaml file=./compose.yaml title="compose.yaml"
```

```properties file=./server.properties title="server.properties"
```

Set up the client for your interface:

:::tab[Python SDK]
```python file=./snippets/managed_storage.py start=start:connect end=end:connect
```
:::

:::tab[CLI]
```bash file=./snippets/managed_storage.sh start=start:setup end=end:setup
```
:::

The examples use an external location `lake` on `s3://uc-docs/lake`:

:::tab[Python SDK]
```python file=./snippets/managed_storage.py start=start:location end=end:location
```
:::

:::tab[CLI]
```bash file=./snippets/managed_storage.sh start=start:location end=end:location
```
:::

## Create a catalog with a storage root

Pass `storage_root` when you create the catalog. The server appends its own
prefix and the catalog's ID, and returns the result as `storage_location`:

:::tab[Python SDK]
```python file=./snippets/managed_storage.py start=start:catalog-root end=end:catalog-root
```
:::

:::tab[CLI]
```bash file=./snippets/managed_storage.sh start=start:catalog-root end=end:catalog-root
```
:::

The root can be the external location's URL or any path below it. Several
catalogs can share one root, since each gets its own ID-named directory.

The root is fixed when the catalog is created. The update API in 0.6.0 has no
`storage_root` field. To move managed data, create a new catalog and copy it.

**Required privileges:** ownership of the metastore or `CREATE CATALOG` on it,
plus ownership of the external location or `CREATE MANAGED STORAGE` on it.

## Give a schema its own storage root

A schema without a root uses its catalog's. Give a schema its own root when its
data belongs in a different prefix, for example one with a different storage
role or retention policy:

:::tab[Python SDK]
```python file=./snippets/managed_storage.py start=start:schema-root end=end:schema-root
```
:::

:::tab[CLI]
```bash file=./snippets/managed_storage.sh start=start:schema-root end=end:schema-root
```
:::

A schema's root doesn't have to be under its catalog's root. Here `curated`
uses a sibling prefix inside the same external location.

**Required privileges:** ownership of the catalog, or `USE CATALOG` and
`CREATE SCHEMA` on it. For a root, also ownership of the external location or
`CREATE MANAGED STORAGE` on it.

## Create managed objects

Create a managed volume without a location, and the server picks the nearest
root:

:::tab[Python SDK]
```python file=./snippets/managed_storage.py start=start:managed-volume end=end:managed-volume
```
:::

:::tab[CLI]
```bash file=./snippets/managed_storage.sh start=start:managed-volume end=end:managed-volume
```
:::

Managed paths have these forms:

| Object's schema | Managed volume path |
| --- | --- |
| Has no root (`sales.raw`) | `<catalog root>/__unitystorage/catalogs/<catalog id>/volumes/<volume id>` |
| Has a root (`sales.curated`) | `<schema root>/__unitystorage/schemas/<schema id>/volumes/<volume id>` |

Managed tables follow the same pattern with `tables/<table id>`. Engines create
them through the catalog. See
[Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md).

Clients reach managed data with vended credentials, the same way as for
external data:

:::tab[Python SDK]
```python file=./snippets/managed_storage.py start=start:write end=end:write
```
:::

:::tab[CLI]
The `uc` CLI can't vend credentials. Use the Python SDK or the REST API
`POST /temporary-volume-credentials`.
:::

The `__unitystorage` prefix belongs to the server. An external table or volume
whose location contains it is rejected with
`Input path '…' contains managed storage prefix __unitystorage.`:

:::tab[Python SDK]
The example script checks this rejection in `_check_reserved_prefix`.
:::

:::tab[CLI]
```bash file=./snippets/managed_storage.sh start=start:reserved-prefix end=end:reserved-prefix
```
:::

:::warning
With authorization disabled, as on the local stack, the server doesn't check
that a storage root lies inside an external location. It accepts
`storage_root=s3://uc-docs/elsewhere`, allocates managed objects under it, and
then fails every credential request for them with `FAILED_PRECONDITION`
(`S3 bucket configuration not found.`). With authorization enabled, creating
such a catalog or schema is denied. Check each root against
`external_location list` before you use it.
:::

## Delete a catalog with managed storage

:::tab[Python SDK]
```python file=./snippets/managed_storage.py start=start:clean-up end=end:clean-up
```
:::

:::tab[CLI]
```bash file=./snippets/managed_storage.sh start=start:clean-up end=end:clean-up
```
:::

`force` deletes the catalog's schemas and everything in them. Deleting the
catalog doesn't delete the external location or the storage credential.

**Required privileges:** ownership of the catalog or of the metastore.

The privilege rules on this page come from the server's 0.6.0 authorization
expressions (`CatalogService` and `SchemaService`). They apply only when the
server runs with authorization enabled.

## Next steps

- [Configure Spark to use Unity Catalog](../configure-spark/index.md) and create
  managed Delta tables under these roots.
- [Create and manage volumes](../manage-volumes/index.md) for the full volume
  lifecycle.
