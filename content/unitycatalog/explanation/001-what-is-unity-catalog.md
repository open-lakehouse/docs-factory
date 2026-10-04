---
title: What is Unity Catalog OSS?
summary: What a lakehouse catalog does, what the open source Unity Catalog server manages, and where its responsibilities end.
diataxis: explanation
project: unitycatalog
explains: unityCatalogOSS
references:
  - lakehouse.catalog
  - ucSpec
status: draft
---

Unity Catalog OSS is an open source catalog server for data and AI assets. It
keeps track of which tables, volumes, functions, and models exist, where their
data lives, and who may use them. Query engines and applications ask it those
questions over open REST APIs. The project is hosted by the LF AI & Data
Foundation.

> Unity Catalog is a unified and open governance solution for data and AI assets.
> It helps teams and organizations discover, secure, govern, and share trusted data
> and AI across clouds and platforms from a single control plane.

That description is accurate, but abstract. It's easier to start from the
smallest job a catalog has.

## What a catalog does

Take a query any data system has to answer:

```sql
SELECT * FROM my.interesting.table;
```

Before reading a single byte, the engine must decide three things. Which files
hold the data of `my.interesting.table`? Is the current user allowed to read
them? And what does `*` expand to, that is, what is the table's schema? Answering
those questions has long been the job of the [catalog](model:lakehouse.catalog).

In a traditional database the catalog is built in and you rarely notice it. The
[lakehouse architecture] took that monolith apart: storage and compute became
separate systems, and open table formats such as Delta Lake took over
responsibilities like schema enforcement and ACID transactions. In early
lakehouses, which were mostly large analytical pipelines, the catalog almost
disappeared. Looking up a table often meant passing a file path.

That worked while one team owned both the pipelines and the files. As
lakehouses spread, many engines, teams, and AI applications came to share the
same storage, and file paths stopped being enough. Readers need to *find* data
by name. Administrators need to decide who may read or change it without
handing out storage keys. And the assets worth governing are no longer only
tables, but also raw files, functions, and machine-learning models. Unity Catalog
brings the catalog back as a shared, open service that does these jobs for all
of them.

## What Unity Catalog OSS manages

Unity Catalog organizes assets in a three-level namespace,
`catalog.schema.asset`. A catalog contains schemas, and a schema contains:

- **Tables.** Delta tables, plus other formats registered as external tables.
  The catalog stores each table's columns, format, and storage location. A
  *managed* Delta table goes further: the catalog allocates its storage and
  coordinates its commits.
- **Views and metric views.** Stored SQL or YAML definitions. The catalog keeps
  the definition, and an engine runs it.
- **Volumes.** Governed directories of non-tabular files such as documents,
  images, or model inputs.
- **Functions.** Registered Python or SQL functions, for example as tools for an
  AI agent. They run in the caller's environment, not on the server.
- **Registered models.** MLflow models and their versions, with the catalog as
  the model registry.

Around the namespace the server also manages storage credentials and external
locations, which describe the cloud storage it may access, and users, ownership,
and privileges, which describe who may do what. For how these objects fit
together, see
[Namespaces, securables, and storage locations](uc-basics/index.md).

## What it is not

Unity Catalog is a metadata and access service. Two neighbouring jobs belong
to other systems:

- **It does not run queries.** Spark, DuckDB, Trino, Daft, and your own
  applications do. They connect through the Unity Catalog REST API, the Delta
  API for catalog-managed Delta tables, or the Iceberg REST API for reading
  Delta tables with Iceberg metadata (UniForm).
- **It does not store your data.** Table and volume files live in object
  storage or a file system. The catalog records where. When an engine needs the
  files, the catalog can issue short-lived credentials scoped to that one
  table or volume, a mechanism called
  [credential vending](credential-vending/index.md).

This split is the point of an open catalog. Any engine that speaks the APIs
sees the same names, schemas, and permissions, and no engine has to own the
data.

## Governance in the open source server

With authentication and authorization enabled, the server validates tokens from
an external identity provider, maps them to users it knows, and checks
ownership and privileges such as `USE_CATALOG`, `SELECT`, or `MODIFY` on every
request. Credential vending extends those checks to storage: an engine receives
storage access only for data the user may read or write.

These checks govern access *through the catalog*. Anyone holding direct
storage credentials can bypass them, so locking down the storage itself remains
part of a secure deployment.

## Unity Catalog OSS and Databricks Unity Catalog

Databricks created Unity Catalog and open sourced it in 2024. Databricks
Unity Catalog is a managed service with the same API heritage and many more
features, such as lineage, tags, row filters, column masks, and attribute-based
access control. The open source server does not include those. Some features
behave differently in the two, so a Databricks guide is not automatically a
guide for the open source server.

These docs describe only the open source server. For the exact feature boundary
of each release, see
[Features, scope, and limitations](../reference/features-and-limitations/index.md).

## Next steps

- [Create your first catalog](../tutorials/getting-started/index.md) runs a
  local server and walks the namespace from the command line.
- [Choose a client or engine](../reference/clients-and-engines/index.md) shows
  how to connect the tools you already use.

[lakehouse architecture]: https://www.databricks.com/blog/what-is-data-lakehouse
