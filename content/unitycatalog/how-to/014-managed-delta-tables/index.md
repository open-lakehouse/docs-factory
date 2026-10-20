---
title: Read and write catalog-managed Delta tables
summary: Create catalog-managed Delta tables in Unity Catalog without a location, and read and write them through Spark or DuckDB by name, not by path.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
  - deltaSpark
  - duckdb
  - ucSpec
status: draft
---

A catalog-managed [Delta](model:deltaSpec) table lives where
[Unity Catalog](model:unityCatalogOSS) puts it, and a write becomes the table's
next version only when the server accepts the commit. So every client reaches
the table by its catalog name, never by its path; see
[External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
for why.

:::prerequisites
- A schema in a catalog with a storage root, such as `inventory.stock`:
  [Manage catalogs and schemas](../manage-catalogs-and-schemas/index.md), or
  [Set managed storage for catalogs and schemas on S3](../managed-storage-s3/index.md).
- Table files that your engine and the server can both reach, such as the local
  server's [shared folder](../run-local-server/index.md#share-a-folder-with-the-server).
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17), for Spark.
:::

## Choose an engine

Spark with the Unity Catalog connector does every task on this page. DuckDB
reads and appends:

| Engine | What it can do with a managed table |
| --- | --- |
| Spark with the Unity Catalog connector | Create, append, update, delete, read, read earlier versions, and drop. |
| DuckDB with the `unity_catalog` extension | Append and read. It can't create, change, or drop tables. |
| Polars, Daft, pandas (`deltalake`) | Nothing: they can't load the table. |

The tested matrix for every client is in
[External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md#what-clients-must-support).

## Set up the client

:::tab[Spark]
Open a Python session with PySpark:

```bash
uv run --with pyspark==4.1.0 python
```

Create a Spark session with the connector and a Spark catalog named after the
Unity Catalog catalog:

```python file=./snippets/managed_tables.py start=start:session end=end:session
```

[Use Spark with Unity Catalog](../configure-spark/index.md) explains each
setting and the connector versions.
:::

:::tab[DuckDB]
Open a Python session with DuckDB:

```bash
uv run --with duckdb==1.5.4 python
```

Install the `delta` and `unity_catalog` extensions, then attach the catalog:

```python file=./snippets/managed_tables.py start=start:duckdb-connect end=end:duckdb-connect
```

[Use DuckDB with Unity Catalog](../duckdb/index.md#install-the-extensions)
explains why `unity_catalog` comes from `core_nightly`.
:::

When an engine reads or writes the table, it asks the server for credentials
scoped to the table's location; see
[Tune storage credentials](../configure-spark/index.md#tune-storage-credentials)
for Spark's settings and [Credential vending](../../explanation/credential-vending/index.md)
for what they protect.

## Create a managed table

Create the table in Spark without a location:

```python file=./snippets/managed_tables.py start=start:create-table end=end:create-table
```

The connector creates it as a catalog-managed table and sets
`delta.feature.catalogManaged` for you. You don't choose where it lives: the
server allocates a path under the nearest storage root, the schema's, else the
catalog's, else the metastore's. If none of them has a root, the create fails
with
`None of catalog, schema or storage-root.tables server property has managed location configured.`
See [Managed storage roots](../../explanation/uc-basics/index.md#managed-storage-roots)
for how the path is built.

Creating a table from a query (`CREATE TABLE … AS SELECT`) is covered in the
guide *Replace or overwrite a managed Delta table*.

### Required table features

To create a managed table, the server requires reader version 3 and writer
version 7, with the `catalogManaged`, `deletionVectors`, `v2Checkpoint`,
`vacuumProtocolCheck`, and `inCommitTimestamp` table features. Spark also turns
on the features the server suggests, including column mapping. To list a
table's protocol versions and features, run:

```python file=./snippets/managed_tables.py start=start:inspect end=end:inspect
```

A create that turns off deletion vectors fails:

```python file=./snippets/managed_tables.py start=start:conflicting-property end=end:conflicting-property
```

```text
Cannot create table inventory.stock.returns: catalog requires table property 'delta.enableDeletionVectors'='true' but the caller supplied 'delta.enableDeletionVectors'='false'. Remove the conflicting TBLPROPERTIES entry and retry.
```

## Write to the table

Append rows with `INSERT INTO`:

:::tab[Spark]
```python file=./snippets/managed_tables.py start=start:spark-append end=end:spark-append
```
:::

:::tab[DuckDB]
DuckDB writes rows correctly only to a table without column mapping, and Spark
turns column mapping on by default. On such a table, DuckDB's rows read as
`NULL` in Spark and in DuckDB. So create the table in Spark with column mapping
off:

```python file=./snippets/managed_tables.py start=start:create-for-duckdb end=end:create-for-duckdb
```

Then append:

```python file=./snippets/managed_tables.py start=start:duckdb-append end=end:duckdb-append
```

If another engine writes to the table after DuckDB reads it, DuckDB's next
append to it fails, and the table doesn't change. To retry, detach and attach
the catalog, then append again:

```python file=./snippets/managed_tables.py start=start:duckdb-reattach end=end:duckdb-reattach
```
:::

Update and delete rows in Spark:

```python file=./snippets/managed_tables.py start=start:change-rows end=end:change-rows
```

DuckDB can't update or delete rows.

The server accepts one commit for each version, so when two writers race for
the same version, one of them fails. See
[Why a catalog should accept commits](../../explanation/external-and-managed-tables/index.md#why-a-catalog-should-accept-commits).

## Read the table

Query the table by its three-part name:

:::tab[Spark]
```python file=./snippets/managed_tables.py start=start:spark-read end=end:spark-read
```

```text
+-----+---+
|  sku|qty|
+-----+---+
|apple| 10|
| pear|  9|
+-----+---+
```
:::

:::tab[DuckDB]
```python file=./snippets/managed_tables.py start=start:duckdb-read end=end:duckdb-read
```

```text
┌─────────┬───────┐
│   sku   │  qty  │
│ varchar │ int32 │
├─────────┼───────┤
│ apple   │    10 │
│ pear    │     9 │
└─────────┴───────┘
```
:::

### Read an earlier version

To query the table as it was at an earlier version, add `VERSION AS OF` in
Spark:

```python file=./snippets/managed_tables.py start=start:time-travel end=end:time-travel
```

```text
+-----+---+
|  sku|qty|
+-----+---+
|apple| 10|
| pear|  4|
| plum|  0|
+-----+---+
```

Version 1 is the table after the first insert, before the update and delete.

## Don't write to the table's path

:::warning
Always use the table's name. Clients that open a catalog-managed table by its
path refuse to read or write it:

- Spark fails with `[DELTA_PATH_BASED_ACCESS_TO_CATALOG_MANAGED_TABLE_BLOCKED] Path-based access is not allowed for Catalog-Managed table`.
- `deltalake`, and Polars, Daft, and pandas through it, fail with
  `Max catalog version is required when loading a catalog-managed table`.

A tool that writes files to the path anyway bypasses the server's commit
acceptance, so the catalog never accepts its version. Anyone who can reach the
storage directly also bypasses the catalog's grants.
:::

## Drop a managed table

Drop the table in Spark:

```python file=./snippets/managed_tables.py start=start:drop end=end:drop
```

:::danger
Dropping removes the table from the catalog right away. The server deletes its
files once `server.storage-cleanup.initial-delay` has passed, 7 days by
default. Keep a copy of any data you need before you drop the table.
:::

The server deletes the files only if it can write to them. With the upstream
image on Linux and a bind-mounted folder, it can't.

## Required privileges

With authorization enabled, each task needs these privileges. Owners have all
of them.

| Task | Privileges |
| --- | --- |
| Create a table | `USE CATALOG` on the catalog, `USE SCHEMA` and `CREATE TABLE` on the schema |
| Read a table | `USE CATALOG`, `USE SCHEMA`, and `SELECT` on the table |
| Append, update, or delete rows | `USE CATALOG`, `USE SCHEMA`, and `SELECT` and `MODIFY` on the table |
| Drop a table | Owner of the table, or of its schema or catalog |

See [Ownership and privileges](../../explanation/uc-basics/index.md#ownership-and-privileges).

## Next steps

- [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md)
  walks the same lifecycle step by step.
- [Use Spark with Unity Catalog](../configure-spark/index.md) configures
  authentication and credential options for the connector.
- [Use DuckDB with Unity Catalog](../duckdb/index.md) covers DuckDB's secrets
  and table listing.
- [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md)
  explains how the server accepts commits.
