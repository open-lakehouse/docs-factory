---
title: Namespaces, securables, and storage locations
summary: How Unity Catalog organizes data and AI assets into a three-level namespace, which objects you can secure, and how catalog objects relate to the files in storage.
diataxis: explanation
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.namespace
  - lakehouse.table
  - lakehouse.volume
  - lakehouse.registeredFunction
  - lakehouse.mlModel
status: ready
---

The umbrella term for things that Unity Catalog governs is *securable*: 
something with a name, an owner, and privileges that decide who can
use it. This page describes the securable objects in the open source server as
of 0.6.0, how they nest, and how they relate to the files they describe.

Securables fall into two groups:

- **Data and AI assets**, the tables, volumes, functions, and models that users,
  pipelines, and agents read and write.
- **System/metastore assets**, the credentials and external locations that decide which storage
  the server can reach and which paths those assets may use.

## The three-level namespace

Assets are addressed by a three-part name, `catalog.schema.object`:

```text
metastore
├── catalog                     retail
│   └── schema                  retail.sales
│       ├── table / view        retail.sales.orders
│       ├── volume              retail.sales.landing
│       ├── function            retail.sales.normalize_sku
│       └── registered model    retail.sales.churn
│           └── model version   retail.sales.churn, version 3
├── storage credential
└── external location
```

The **metastore** is the top-level container. An open source server has
exactly one; it has an ID (`GET /metastore_summary`) but no name, and it never
appears in object names. Privileges that aren't tied to a catalog, such as
creating catalogs, are granted on the metastore.

A **catalog** is the first level of the namespace. Teams typically use catalogs
to separate business units, environments, or data products. A **schema** sits
inside one catalog and groups related assets. Every asset belongs to exactly one
schema.

Names are unique within their parent: two schemas may both contain an `orders`
table, but their full names differ. Clients refer to assets by full name and
never need to know where the files are.

## Data and AI assets

| Object | What it describes |
| --- | --- |
| Table | Tabular data with a column schema and a format, such as Delta or Parquet. Its *table type* says who manages it: `EXTERNAL` or `MANAGED`. SQL views (`VIEW`) and metric views (`METRIC_VIEW`) are stored as table types too, with a definition instead of a storage location. |
| Volume | A directory of non-tabular files, either `EXTERNAL` or `MANAGED`. |
| Function | A registered routine with typed parameters and a body. The catalog stores the definition, and the caller's environment runs it. |
| Registered model | A named ML model with numbered *model versions*. Each version has its own storage location for its artifacts. |

The API's `TableType` enum also lists `STREAMING_TABLE` and
`MATERIALIZED_VIEW`. An enum value is not the same as a supported workflow, so
check the release's compatibility notes before relying on those types.

## System/metastore assets

These objects live directly under the metastore. They don't hold data. They
control which storage the server can access, and on whose behalf.

- A **storage credential** holds the cloud identity the server uses to reach
  storage. The credential service implements AWS IAM roles. Azure and
  Google Cloud access are configured on the server rather than as credential
  objects.
- An **external location** pairs a storage path, such as
  `s3://acme-lake/retail/`, with a storage credential. It doesn't have to be a
  bucket root. A location can cover any path prefix, and narrower locations
  give narrower control. External locations decide who may create external
  tables and volumes under a path (`CREATE EXTERNAL TABLE`,
  `CREATE EXTERNAL VOLUME`), use it as managed storage
  (`CREATE MANAGED STORAGE`), or read and write its files directly
  (`READ FILES`, `WRITE FILES`).

## Objects versus files

A catalog object and the files it describes are separate things. Unity Catalog
stores names, columns, comments, and a location; the files sit in object
storage or on a local disk. Three consequences follow.

**Renaming moves nothing.** Renaming a schema or a volume changes its catalog
name only. The files stay at the same location, and clients that look the object
up by name find it under the new name.

**External and managed decide who owns the files.** For an *external* table or
volume, you supply the location and keep control of its lifecycle. Dropping the
object deletes only the catalog entry. For a *managed* table or volume, the
server allocates the location and treats the files as part of the object.
Dropping it deletes them too (best effort: if the deletion fails, the server
logs it and drops the entry anyway).

**Managed storage is inherited.** A managed object's location comes from the
nearest storage root:

1. the schema's `storage_root`, if it has one;
2. otherwise the catalog's `storage_root`;
3. otherwise the metastore's `storage_root`.

The server allocates a unique path below that root, under a reserved
`__unitystorage` prefix, for example
`<root>/__unitystorage/schemas/<schema id>/volumes/<volume id>`. External
objects may not use paths containing `__unitystorage`. An external table or
volume may not overlap another one's location, which keeps any one file
governed by a single object.

The catalog doesn't stand between a client and storage. A client that can reach
the files directly, through its own cloud credentials or a shared disk, can
read them without asking Unity Catalog. To make the catalog the gatekeeper,
withhold direct storage access and have clients request temporary, scoped
credentials from the server. See
[Credential vending](../credential-vending/index.md).

## Ownership and privileges

Every securable has an owner. When authorization is enabled, the principal that
creates an object becomes its owner. The owner can modify it, drop it, and grant
privileges on it to others. Ownership of a catalog or schema also lets you
manage the objects inside it.

Other principals need privileges. The server checks each privilege on a specific
object type:

| Granted on | Privileges |
| --- | --- |
| Metastore | `CREATE CATALOG`, `CREATE EXTERNAL LOCATION`, `CREATE STORAGE CREDENTIAL` |
| Catalog | `USE CATALOG`, `CREATE SCHEMA` |
| Schema | `USE SCHEMA`, `CREATE TABLE`, `CREATE VOLUME`, `CREATE FUNCTION`, `CREATE MODEL` |
| Table | `SELECT`, `MODIFY` |
| Volume | `READ VOLUME` |
| Function, registered model | `EXECUTE` |
| Storage credential | `CREATE EXTERNAL LOCATION` |
| External location | `CREATE EXTERNAL TABLE`, `CREATE EXTERNAL VOLUME`, `CREATE MANAGED STORAGE`, `READ FILES`, `WRITE FILES` |

Access to an asset also needs access to its parents. Reading a table takes
`SELECT` on the table, `USE SCHEMA` on its schema, and `USE CATALOG` on its
catalog. `USE CATALOG` and `USE SCHEMA` don't grant access to anything inside on
their own; they let a principal reach the objects they hold other privileges on.

The how-to guides list the privileges each operation needs, for example
[Create and manage catalogs and schemas](../../how-to/manage-catalogs-and-schemas/index.md)
and [Create and manage volumes](../../how-to/manage-volumes/index.md).

:::note
This page describes the open source server's behavior, based on its API
definitions and authorization source. Databricks Unity Catalog adds securables
and governance features, such as connections, shares, tags, row filters, and
column masks, that the open source server doesn't implement.
:::
