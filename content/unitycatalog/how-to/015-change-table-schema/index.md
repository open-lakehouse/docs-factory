---
title: Change a table's schema and properties
summary: Change a Unity Catalog Delta table's columns and properties with Spark, so each change is a Delta commit the catalog accepts, then check what it records.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
  - deltaSpark
  - lakehouse.table
status: draft
---

Unity Catalog keeps two records of a Delta table: the Delta log in storage,
and its own record of the table's columns, comment, and properties. A safe
change updates both in one commit. So change a managed table through an engine
that commits through the catalog, such as Spark with the Unity Catalog
connector.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17).
- A catalog with managed storage, as in
  [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md#give-a-catalog-managed-storage).
  The examples call it `warehouse`.
:::

## Choose a client

Change a managed table with Spark and the Unity Catalog connector. The other
clients can't:

| Client | Changes a managed table |
| --- | --- |
| Spark with the Unity Catalog connector | Yes. Each statement is one Delta commit that the catalog accepts. |
| DuckDB, `unity_catalog` extension | No. `ALTER TABLE` and `COMMENT ON TABLE` fail. |
| `uc` CLI, Python SDK | No. They wrap the tables API (`/tables`), which has no update. Use them to check what the catalog records. |
| Polars, Daft, pandas | No. They can't open managed tables. |

## Set up the client

Start Python with PySpark and the Unity Catalog client:

```bash
uv run --with pyspark==4.1.0 --with unitycatalog-client==0.7.0 python
```

Start a Spark session that knows your catalog:

```python file=./snippets/change_schema.py start=start:session end=end:session
```

[Use Spark with Unity Catalog](../configure-spark/index.md) explains each
setting. The examples change the following table. To follow along, create it:

```python file=./snippets/change_schema.py start=start:create-table end=end:create-table
```

## Add columns and comments

To add a column, and to comment on a column or on the table, run:

```python file=./snippets/change_schema.py start=start:add-columns end=end:add-columns
```

## Drop or widen a column

Dropping a column needs column mapping. With it, Delta drops the column without
rewriting the data files; see
[Delta column mapping](https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-column-mapping.mdx).
Spark creates managed tables with column mapping on by default (`name`). To
check a table first, run:

```python file=./snippets/change_schema.py start=start:check-column-mapping end=end:check-column-mapping
```

```text
+------------------------+-----+
|key                     |value|
+------------------------+-----+
|delta.columnMapping.mode|name |
+------------------------+-----+
```

Then drop the column:

```python file=./snippets/change_schema.py start=start:drop-column end=end:drop-column
```

A table created with column mapping off (`none`) can't drop columns this way:
Spark fails with `DELTA_UNSUPPORTED_DROP_COLUMN`.

To change a column to a wider type, such as `INT` to `BIGINT`, turn on type
widening first. Without it, Delta rejects the change with
`DELTA_UNSUPPORTED_ALTER_TABLE_CHANGE_COL_OP`:

```python file=./snippets/change_schema.py start=start:widen-type end=end:widen-type
```

## Set and remove table properties

Give the properties you add a prefix of your own, such as `sales.`.
`SET TBLPROPERTIES` adds or changes them, and `UNSET TBLPROPERTIES` removes
them:

```python file=./snippets/change_schema.py start=start:properties end=end:properties
```

```text
+-----------+-----------+
|        key|      value|
+-----------+-----------+
|sales.owner|orders-team|
+-----------+-----------+
```

:::warning
The server requires these values when it creates a managed table, as the guide
*Read and write catalog-managed Delta tables* describes:

- `delta.enableDeletionVectors = true`
- `delta.checkpointPolicy = v2`
- `delta.enableInCommitTimestamps = true`
- `delta.checkpoint.writeStatsAsStruct = true`
- `delta.checkpoint.writeStatsAsJson = true`

After the create, only the in-commit timestamp property is protected: Delta rejects a
change to it with
`[DELTA_CANNOT_MODIFY_CATALOG_MANAGED_DEPENDENCIES] Cannot override or unset in-commit timestamp table properties because this table is catalog-managed.`
Spark commits a change to any of the other four, and the catalog records it.
Leave all five as they are.
:::

<!-- TODO(open question): What does a managed table lose when deletion vectors, the v2 checkpoint policy, or checkpoint stats are turned off after create? No script checks a read, write, or checkpoint afterwards. -->

## Check what the catalog records

Each statement above added one version to the table's history:

```python file=./snippets/change_schema.py start=start:history end=end:history
```

```text
+-------+-------------------+
|version|          operation|
+-------+-------------------+
|      9|UNSET TBLPROPERTIES|
|      8|  SET TBLPROPERTIES|
|      7|      CHANGE COLUMN|
|      6|  SET TBLPROPERTIES|
|      5|       DROP COLUMNS|
|      4|  SET TBLPROPERTIES|
|      3|      CHANGE COLUMN|
|      2|        ADD COLUMNS|
|      1|              WRITE|
|      0|       CREATE TABLE|
+-------+-------------------+
```

The catalog accepted each commit and updated its record of the table with it.
To see that record:

:::tab[uc CLI]
With the `uc` shortcut from
[Create your first catalog](../../tutorials/getting-started/index.md#define-a-shortcut-for-the-cli),
run:

```bash file=./snippets/change_schema.sh start=start:get end=end:get
```

The output lists `channel` with its comment, the table's `comment`, and
`sales.owner` under `properties`.
:::

:::tab[Python SDK]
In the same Python session, run:

```python file=./snippets/change_schema.py start=start:verify-sdk end=end:verify-sdk
```

```text
One row per customer order
order_id bigint None
customer string None
amount decimal(10,2) Order total in EUR
quantity bigint None
channel string Where the order was placed
orders-team
```
:::

## Rename a table or column

The Unity Catalog connector for Spark rejects `ALTER TABLE … RENAME COLUMN` and
`ALTER TABLE … RENAME TO`.

To rename a table, create a table under the new name from the old one, then
drop the old one:

```python file=./snippets/change_schema.py start=start:rename-table end=end:rename-table
```

The new table starts its own history at version 0. The old table's history,
its comment, and its properties don't carry over.

## Bring an external table's catalog record in step

The examples in this section use an external Delta table registered in the
catalog as `warehouse.sales.order_events`. To register one, see
[Register external Delta table](../register-external-table/index.md#register-the-table).

Spark's `ALTER TABLE` on an external table writes the change to the table's
Delta log, but the catalog's record of the columns stays as it was. The
catalog doesn't coordinate an external table's writers, so its record
[can fall out of step with the files](../../explanation/external-and-managed-tables/index.md#what-clients-must-support):

```python file=./snippets/delta_api.py start=start:external-alter end=end:external-alter
```

To bring the record back in step, send the table's columns through the Unity
Catalog Delta API. These two helpers load a table and update it:

```python file=./snippets/delta_api.py start=start:delta-api end=end:delta-api
```

Send the columns Spark reads from the Delta log:

```python file=./snippets/delta_api.py start=start:sync-columns end=end:sync-columns
```

You can also drop the table from the catalog and register it again, as in
[Register external Delta table](../register-external-table/index.md#change-a-registered-table).

## Update a table through the Delta API

<!-- Move this section to the Delta API pages once they exist. -->

This section is for authors of Delta clients. An update is one `POST` to the
table's path in the Delta API, with a list of `requirements` and a list of
`updates`. If the request fails a check, the server applies none of its
updates:

- `assert-table-uuid` is required. A request without it fails with HTTP 400,
  `assert-table-uuid requirement is required.`
- `assert-etag` is optional. The etag is `metadata.etag` in the load response.
  If the table changed since you loaded it, the server returns HTTP 409
  `UpdateRequirementConflictException`. Load the table again and retry.
- A request holds at most one `set-properties` update. A second one fails with
  HTTP 400, `At most one set-properties is allowed per request.`
- `set-properties` and `remove-properties` can't name the same key. A request
  that does fails with HTTP 400,
  `set-properties and remove-properties overlap on keys: [<key>]`.

<!-- TODO(open question): Which keys does the server derive and ignore in set-properties or remove-properties? It returns 200 for `delta.minReaderVersion`, `delta.minWriterVersion`, and `delta.feature.*` in either list; no script checks what it does with them. Other update types beyond set-properties may also be limited to one per request; only set-properties is checked. -->

With the helpers from the section above, an update with an etag from an
earlier load fails, and nothing changes:

```python file=./snippets/delta_api.py start=start:stale-etag end=end:stale-etag
```

```text
409 UpdateRequirementConflictException
```

For a managed table, a change to the metadata travels with the `add-commit`
that writes it to the Delta log. The server also accepts a properties-only
update with no commit: it returns 200 and changes its record, and the Delta log
keeps the old value. So don't send metadata-only updates for managed tables.
For the full commit flow, see
[The lifecycle through the Delta API](../../explanation/external-and-managed-tables/index.md#the-lifecycle-through-the-delta-api).

## Required privileges

With authorization enabled, each task needs these privileges. Owners have all
of them.

| Task | Privileges |
| --- | --- |
| Change a table's columns, comment, or properties | Owner of the table, or of its schema or catalog |
| Rename a table by copying it | `USE CATALOG` on the catalog, `USE SCHEMA` and `CREATE TABLE` on the schema, `SELECT` on the old table, and ownership of the old table, its schema, or its catalog to drop it |

See [Ownership and privileges](../../explanation/uc-basics/index.md#ownership-and-privileges).

<!-- TODO(open question): Is MODIFY on the table enough for ALTER TABLE, COMMENT ON, and SET/UNSET TBLPROPERTIES, or is ownership required? Which privileges does reading the catalog's record (`uc table get`, `TablesApi.get_table`) and a Delta API update need? The local environment runs without authorization, so no script checks these. -->

## Next steps

- [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md)
  walks through a managed table's life from creation to drop.
- [Use Spark with Unity Catalog](../configure-spark/index.md) covers the
  session settings and storage credentials.
- [Learn how managed and external tables differ](../../explanation/external-and-managed-tables/index.md)
  and why the catalog accepts each commit.
