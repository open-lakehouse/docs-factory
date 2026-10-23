---
title: "Core concepts"
summary: How Unity Catalog organizes data and AI assets into a three-level namespace, how catalogs reach storage, which privileges the open source server enforces on each object, and how it manages users.
diataxis: explanation
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.namespace
  - lakehouse.table
  - lakehouse.volume
  - lakehouse.function
  - lakehouse.mlModel
  - lakehouse.governance
  - lakehouse.credentialIssuer
status: ready
---

Unity Catalog is a registry of named objects. Each object has an owner and a set
of grants that decide who can use it, and most objects describe files that live
somewhere else. The umbrella term for these objects is *securable*.

This page follows the order in which a catalog is built up:

1. the **namespace** that names every asset;
2. **catalog administration**: the metastore, catalogs, and schemas, and the
   credentials and external locations that let the server reach storage;
3. the **data and AI assets** that users, pipelines, and agents work with;
4. how those objects relate to the **files** they describe;
5. the **privileges** the server checks on each object;
6. the **users** those privileges are granted to.

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
├── storage credential          acme-lake-role
└── external location           acme-lake-retail
```

Names are unique within their parent: two schemas may both contain an `orders`
table, but their full names differ. Clients refer to assets by full name and
never need to know where the files are. Storage credentials and external
locations sit outside the namespace. They have single-part names and are
addressed by name alone.

## Catalog administration

### Metastore, catalogs, and schemas

The **metastore** is the top-level container. An open source server has
exactly one. It has an ID (`GET /metastore_summary`) but no name, and it never
appears in object names. Privileges that aren't tied to a catalog, such as
creating catalogs, are granted on the metastore.

A **catalog** is the first level of the namespace. Teams typically use catalogs
to separate business units, environments, or data products. A **schema** sits
inside one catalog and groups related assets. Every asset belongs to exactly one
schema.

### External data access

Two kinds of object live directly under the metastore and hold no data. They
decide which storage the server can reach, and on whose behalf.

- A **storage credential** holds the cloud identity the server uses to reach
  storage. In this release every credential has the purpose `STORAGE`, and the
  credential service implements AWS IAM roles. Azure and Google Cloud access
  are configured on the server rather than as credential objects.
- An **external location** pairs a storage path, such as
  `s3://acme-lake/retail/`, with a storage credential. It doesn't have to be a
  bucket root. A location can cover any path prefix, and narrower locations
  give narrower control. External locations decide who may create external
  tables and volumes under a path, use it as managed storage, or read and write
  its files directly.

With these objects in place, the server can hand out short-lived credentials
scoped to a single asset or path. It exposes one endpoint each for tables,
volumes, model versions, and raw paths. See
[Credential vending](../credential-vending/index.md).

### Managed storage roots

The metastore, a catalog, and a schema can each declare a `storage_root`. When
the server creates a managed object, it takes the location from the nearest
root:

1. the schema's `storage_root`, if it has one;
2. otherwise the catalog's `storage_root`;
3. otherwise the metastore's `storage_root`.

The server allocates a unique path below that root, under a reserved
`__unitystorage` prefix, for example
`<root>/__unitystorage/schemas/<schema id>/volumes/<volume id>`. External
objects may not use paths containing `__unitystorage`.

## Data and AI assets

Every asset lives in a schema. The *securable type* is the name the permissions
API uses for the object.

| Object | Securable type | What it describes |
| --- | --- | --- |
| Table | `table` | Tabular data with a column schema and a format, such as Delta or Parquet. Its *table type* says who manages it: `EXTERNAL` or `MANAGED`. SQL views (`VIEW`) and metric views (`METRIC_VIEW`) are stored as table types too, with a definition instead of a storage location. |
| Volume | `volume` | A directory of non-tabular files, either `EXTERNAL` or `MANAGED`. |
| Function | `function` | A registered routine with typed parameters and a body. The catalog stores the definition, and the caller's environment runs it. |
| Registered model | `registered_model` | A named ML model with numbered *model versions*. Each version has its own storage location for its artifacts. Versions aren't securables of their own: privileges on the model cover them. |

A managed Delta table starts life as a *staging table*: the server reserves a
location, the client writes the first commit there, and creating the table
ratifies it. See
[External tables and catalog-managed Delta tables](../external-and-managed-tables/index.md).

The API's `TableType` enum also lists `STREAMING_TABLE` and
`MATERIALIZED_VIEW`. An enum value is not the same as a supported workflow, so
check the release's compatibility notes before relying on those types.

## Objects versus files

A catalog object and the files it describes are separate things. Unity Catalog
stores names, columns, comments, and a location. The files sit in object
storage or on a local disk. Three consequences follow.

**Renaming moves nothing.** Renaming a schema or a volume changes its catalog
name only. The files stay at the same location, and clients that look the object
up by name find it under the new name.

**External and managed decide who owns the files.** For an *external* table or
volume, you supply the location and keep control of its lifecycle. Dropping the
object deletes only the catalog entry. For a *managed* table or volume, the
server allocates the location below a storage root and treats the files as part
of the object. Dropping it deletes them too, once a cleanup delay passes (7 days
by default).

**One file, one object.** An external table or volume may not overlap another
one's location, so any one file is governed by a single object.

The catalog doesn't stand between a client and storage. A client that can reach
the files directly, through its own cloud credentials or a shared disk, can
read them without asking Unity Catalog. To make the catalog the gatekeeper,
withhold direct storage access and have clients request temporary, scoped
credentials from the server.

## Ownership and privileges

The server checks privileges only when authorization is enabled
(`server.authorization=enable` in `server.properties`). With it disabled, every
request is allowed.

Every securable has an owner. The principal that creates an object becomes its
owner. `OWNER` is the only privilege that implies the others: the owner can
read, modify, drop, and grant privileges on the object. The server has no
`ALL PRIVILEGES`, `MANAGE`, or `BROWSE`. The server's checks honor ownership
on the way down: the owner of a catalog can manage every schema and asset in
it, and the owner of a schema can manage every asset in that schema. The
metastore owner is the server's administrator.

Other principals need privileges. The server checks each privilege on a specific
object type:

| Checked on | Privileges |
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
catalog. Writing to it takes both `SELECT` and `MODIFY`. `USE CATALOG` and
`USE SCHEMA` don't grant access to anything inside on their own. They let a
principal reach the objects it holds other privileges on. Creating an object
works the same way: a `CREATE …` privilege on the parent, plus `USE` on every
level above it.

Privileges other than `OWNER` are inherited. A privilege granted on a catalog
or schema also applies to every object below it, so `SELECT` on a schema covers
every table in it, including tables created later. `OWNER` applies only to the
object it's held on.

Grants are read and changed through the permissions API, which addresses an
object by its securable type and full name
(`/permissions/{securable_type}/{full_name}`). A change adds or removes
privileges for one principal. The CLI wraps the same calls in
`bin/uc permission create | get | delete`.

The how-to guides list the privileges each operation needs, for example
[Manage catalogs and schemas](../../how-to/manage-catalogs-and-schemas/index.md)
and [Manage volumes](../../how-to/manage-volumes/index.md).

## Principals and users

A principal in the open source server is a user, identified by email address.
The server has no groups or service principals, so every grant names an
individual user.

The server keeps its own user list, managed through a SCIM 2.0 Users API under
`/api/1.0/unity-control/scim2/Users` (create, list, get, update, delete) and
`/scim2/Me` for the calling user. The CLI wraps it as `bin/uc user`. A user
record holds a display name, an email address, an optional external ID, and an
active flag.

Users authenticate with an identity provider, such as Google, then
exchange that provider's token for a Unity Catalog token at `/auth/tokens`. The
exchange succeeds only for an active user that is already registered on the
server. Registration and grants are two separate steps: a new user can sign in
but reaches nothing until someone grants them privileges.

On first start with authorization enabled, the server creates an `admin` user,
makes it the metastore owner, and writes a token for it to `etc/conf/token.txt`.
That account is the bootstrap: use it to register the first real users and grant
them access.

:::note
This page describes the open source server's behavior, based on its API
definitions and authorization source. Databricks Unity Catalog adds securables
and governance features beyond it, so a Databricks guide may not apply here.
:::
