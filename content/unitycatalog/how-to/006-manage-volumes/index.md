---
title: Create and manage volumes
summary: Create external and managed Unity Catalog volumes, inspect, rename, and delete them, and see what happens to their files.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

A [Unity Catalog](model:unityCatalogOSS) volume governs a directory of files
that aren't a table: CSV drops, documents, images, model inputs. Like a table, a
volume lives in a schema and has a three-level name, such as
`retail.files.landing`. This guide creates, inspects, renames, and deletes
volumes, and shows what each step does to their files.

Volumes come in two types:

- An **external** volume points at a directory you already have. Unity Catalog
  records the location and never deletes the files.
- A **managed** volume gets a directory that Unity Catalog allocates under the
  schema's or catalog's storage root. Deleting the volume deletes that
  directory.

For how volumes fit into the namespace, see
[Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md).

:::prerequisites
- For managed volumes, a storage root on the schema or its catalog.
- For the Python examples, Python 3.11 or later with `unitycatalog-client`
  0.6.0.
:::

## Set up the client

Set up the client for your interface:

:::tab[Python SDK]
```python file=./snippets/volumes.py start=start:connect end=end:connect
```
:::

:::tab[CLI]
```bash file=./snippets/volumes.sh start=start:setup end=end:setup
```
:::

The examples use a catalog `retail` with a schema `files` whose storage root is
`$UC_DOCS_ROOT/managed`:

:::tab[Python SDK]
```python file=./snippets/volumes.py start=start:managed-root end=end:managed-root
```
:::

:::tab[CLI]
```bash file=./snippets/volumes.sh start=start:managed-root end=end:managed-root
```
:::

## Create an external volume

Point the volume at an existing directory. This example assumes
`$UC_DOCS_ROOT/landing` holds a few files.

:::tab[Python SDK]
```python file=./snippets/volumes.py start=start:create-external end=end:create-external
```
:::

:::tab[CLI]
```bash file=./snippets/volumes.sh start=start:create-external end=end:create-external
```
:::

The location must be a directory below a bucket or container root, not the root
itself. It must not overlap another table or volume, and it must not contain
`__unitystorage`, the prefix the server uses for managed storage.

**Required privileges:** `USE_CATALOG` on the catalog (or ownership of it),
plus ownership of the schema or `USE_SCHEMA` and `CREATE_VOLUME` on it. If the
location falls inside an external location, you also need
`CREATE_EXTERNAL_VOLUME` on that external location, or ownership of it.

## Create a managed volume

Leave out the location. The server allocates one below the schema's storage
root or, if the schema has none, the catalog's.

:::tab[Python SDK]
```python file=./snippets/volumes.py start=start:create-managed end=end:create-managed
```
:::

:::tab[CLI]
```bash file=./snippets/volumes.sh start=start:create-managed end=end:create-managed
```
:::

The allocated path has the form
`<storage root>/__unitystorage/schemas/<schema id>/volumes/<volume id>`. The
server records the path but doesn't create the directory; it appears when the
first file is written there. If neither the schema nor the catalog has a storage
root, the request fails with
`None of catalog, schema or storage-root.tables server property has managed location configured.`

**Required privileges:** the same as for an external volume, without the
external-location check.

## View volumes

:::tab[Python SDK]
```python file=./snippets/volumes.py start=start:view end=end:view
```
:::

:::tab[CLI]
```bash file=./snippets/volumes.sh start=start:view end=end:view
```
:::

To check whether a volume exists, list the schema's volumes; see
[Known issues](../../reference/features-and-limitations/index.md#known-issues).

**Required privileges:** `READ_VOLUME` or ownership on the volume, plus
`USE_SCHEMA` and `USE_CATALOG`. Owners of the schema (with `USE_CATALOG`), the
catalog, or the metastore can also view it. A list returns only the volumes you
could get.

## Work with the files

A volume's metadata tells a client where its files are. The client then reads
and writes them with ordinary storage tools.

:::tab[Python SDK]
With local `file://` storage, the location is a directory you can use directly:

```python file=./snippets/volumes.py start=start:list-files end=end:list-files
```
:::

:::tab[CLI]
`volume read` lists a directory in the volume, or prints a file when `--path`
names one. It runs in the server container.

```bash file=./snippets/volumes.sh start=start:list-files end=end:list-files
```
:::

On cloud storage, a client needs credentials for the location. A client with
the right privileges can request temporary credentials scoped to a volume from
the server; see [Credential vending](../../explanation/credential-vending/index.md).
Open source Unity Catalog doesn't provide the `/Volumes/<catalog>/<schema>/<volume>`
paths that Databricks compute mounts. Clients work with the volume's
`storage_location`.

## Rename or update a volume

Change the comment, or rename the volume with `new_name`. Renaming changes only
the volume's name. Its files and location stay the same.

:::tab[Python SDK]
```python file=./snippets/volumes.py start=start:update end=end:update
```
:::

:::tab[CLI]
```bash file=./snippets/volumes.sh start=start:update end=end:update
```
:::

**Required privileges:** ownership of the volume, plus `USE_CATALOG` (or
ownership) on the catalog and `USE_SCHEMA` (or ownership) on the schema.

## Delete a volume

:::tab[Python SDK]
```python file=./snippets/volumes.py start=start:delete end=end:delete
```
:::

:::tab[CLI]
```bash file=./snippets/volumes.sh start=start:delete end=end:delete
```
:::

What happens to the files depends on the volume type:

| Volume type | Catalog entry | Files |
| --- | --- | --- |
| External | Deleted | Left in place. Delete them with your storage tools if you no longer need them. |
| Managed | Deleted | The server deletes the volume's directory. |

:::warning
Managed-volume file deletion is best effort. If the server can't delete the
directory, for example because of storage permissions, it logs the error and
still deletes the volume. The files then remain without a catalog entry, so
check storage after deleting volumes that matter.
:::

**Required privileges:** ownership of the catalog; or ownership of the schema
plus `USE_CATALOG`; or ownership of the volume plus `USE_CATALOG` and
`USE_SCHEMA`.

## Next steps

- [Register an existing external table](../register-external-table/index.md) for
  tabular data in the same schema.
- [Credential vending](../../explanation/credential-vending/index.md) explains
  how clients get access to cloud storage.
