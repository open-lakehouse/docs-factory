---
title: Manage table schemas and properties
summary: Change a Unity Catalog managed table's columns and properties through Spark; change an external table with Spark or deltalake, then sync the catalog's record.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpec
  - deltaSpark
  - deltaRs
  - lakehouse.table
status: draft
---

Unity Catalog keeps two records of a Delta table: the Delta log in storage,
and its own record of the table's columns, comment, and properties. A safe
change leaves the two in agreement.

- **Managed tables:** Spark commits each change through the catalog, so both
  records move together.
- **External tables:** Spark and deltalake (delta-rs) write only the Delta
  log, so you sync the catalog's record afterwards.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- [Java 17](https://adoptium.net/temurin/releases/?version=17), for Spark.
- A catalog with managed storage, as in
  [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md#give-a-catalog-managed-storage).
  The examples call it `warehouse`.
- For the external-table steps, the external Delta table
  `warehouse.sales.order_events` at `file:///tmp/uc-docs/order_events`, with
  the columns `order_id` (`bigint`) and `status` (`string`). The delta-rs ·
  Python setup below writes and registers it. For more on registering external
  tables, see
  [Register external Delta table](../register-external-table/index.md#register-the-table).
:::

## Choose a client

Spark with the Unity Catalog connector is the only client that changes both
kinds of table. deltalake changes external tables only:

| Client | Managed table | External table |
| --- | --- | --- |
| Spark with the Unity Catalog connector, SQL or Python | Yes. Each statement is one Delta commit that the catalog accepts. | Yes, in the Delta log. Then sync the catalog's record. |
| deltalake (delta-rs) | No. Opening the table fails with `Max catalog version is required when loading a catalog-managed table`. | Yes, in the Delta log. It changes columns in place only by adding them, setting their metadata, or relaxing `NOT NULL`. Dropping, renaming, or changing the type of a column means overwriting the table with `schema_mode="overwrite"`, which rewrites every row. Then sync the catalog's record. |
| DuckDB, `unity_catalog` extension | No. `ALTER TABLE` fails with `UCTableSet::AlterTable`, and `COMMENT ON TABLE` fails with `Only altering tables is supported for now`. | No. Same errors, and `ALTER TABLE … SET (key = value)` fails with `UCTableSet::AlterTable`. |
| `uc` CLI, Python SDK | No. The tables API has no update. Use them to check the record. | No. The tables API has no update. Use them to check the record, or to drop and register the table again. |

## Set up the client

:::tab[Spark · SQL]
Start the Spark SQL shell with Delta Lake and the Unity Catalog connector:

```bash file=./snippets/spark_sql.sh start=start:launch end=end:launch
```
:::

:::tab[Spark · Python]
Start Python with PySpark and the Unity Catalog client:

```bash
uv run --with pyspark==4.1.0 --with unitycatalog-client==0.7.0 python
```

Then start a Spark session that knows your catalog:

```python file=./snippets/change_schema.py start=start:session end=end:session
```
:::

:::tab[delta-rs · Python]
deltalake changes external tables only. Start Python with it and the Unity
Catalog client:

```bash
uv run --with deltalake==1.6.6 --with unitycatalog-client==0.7.0 python -m asyncio
```

The external-table examples change `warehouse.sales.order_events`. To follow
along, write a two-row Delta table and register it:

```python file=./snippets/external_deltalake.py start=start:register-events end=end:register-events
```
:::

[Use Spark with Unity Catalog](../configure-spark/index.md) explains each
Spark setting. The managed-table examples change the following table. To follow
along, create it with Spark:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:create-table end=end:create-table
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:create-table end=end:create-table
```
:::

## Add columns and comments

To add a column, and to comment on a column or on the table, run:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:add-columns end=end:add-columns
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:add-columns end=end:add-columns
```
:::

## Drop or widen a column

Dropping a column needs column mapping. With it, Delta drops the column without
rewriting the data files; see
[Delta column mapping](https://github.com/delta-io/delta/blob/v4.4.0/docs/src/content/docs/delta-column-mapping.mdx).
Spark creates managed tables with column mapping on by default (`name`). To
check a table first, run:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:check-column-mapping end=end:check-column-mapping
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:check-column-mapping end=end:check-column-mapping
```
:::

```text
+------------------------+-----+
|key                     |value|
+------------------------+-----+
|delta.columnMapping.mode|name |
+------------------------+-----+
```

Then drop the column:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:drop-column end=end:drop-column
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:drop-column end=end:drop-column
```
:::

A table created with column mapping off (`none`) can't drop columns this way:
Spark fails with `DELTA_UNSUPPORTED_DROP_COLUMN`.

To change a column to a wider type, such as `INT` to `BIGINT`, turn on type
widening first. Without it, Delta rejects the change with
`DELTA_UNSUPPORTED_ALTER_TABLE_CHANGE_COL_OP`:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:widen-type end=end:widen-type
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:widen-type end=end:widen-type
```
:::

## Set and remove table properties

Give the properties you add a prefix of your own, such as `sales.`.
`SET TBLPROPERTIES` adds or changes them, and `UNSET TBLPROPERTIES` removes
them:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:properties end=end:properties
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:properties end=end:properties
```
:::

```text
+-----------+-----------+
|        key|      value|
+-----------+-----------+
|sales.owner|orders-team|
+-----------+-----------+
```

:::info
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

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:history end=end:history
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:history end=end:history
```
:::

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
In a Python session with the Unity Catalog client, run:

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

The Unity Catalog connector for Spark rejects both renames.
`ALTER TABLE … RENAME COLUMN` fails with
`ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet`, and
`ALTER TABLE … RENAME TO` fails with `Renaming a table is not supported yet`.

To rename a table, create a table under the new name from the old one, then
drop the old one:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:rename-table end=end:rename-table
```
:::

:::tab[Spark · Python]
```python file=./snippets/change_schema.py start=start:rename-table end=end:rename-table
```
:::

The new table starts its own history at version 0. The old table's history,
its comment, and its properties, such as `sales.owner`, don't carry over.

## Change an external table

An external table's writers commit to its Delta log without the catalog, so
the catalog's record
[can fall out of step with the files](../../explanation/external-and-managed-tables/index.md#what-clients-must-support).
Change the log first, then sync the record. The examples use the external
table `warehouse.sales.order_events`.

### Change the Delta log

To add a column, comment on a column and on the table, and set a property, run:

:::tab[Spark · SQL]
```sql file=./snippets/change_schema.sql start=start:external-alter end=end:external-alter
```
:::

:::tab[Spark · Python]
```python file=./snippets/delta_api.py start=start:external-alter end=end:external-alter
```
:::

:::tab[delta-rs · Python]
deltalake opens the table by its storage location, which the Python SDK
returns:

<!-- Opens by path, not uc://, until #273 is fixed (file:// decode error, S3 stall). Move this tab to uc:// then. -->

```python file=./snippets/external_deltalake.py start=start:open-external end=end:open-external
```

Then change it:

```python file=./snippets/external_deltalake.py start=start:alter-deltalake end=end:alter-deltalake
```

deltalake accepts only the `delta.*` property keys it knows. A custom key such
as `sales.owner` needs `raise_if_not_exists=False`. Without it, the call fails
with `Error parsing property 'sales.owner':'orders-team'`.
:::

The Delta log now has every change. The catalog's record doesn't: its columns,
column comments, table comment, and properties all stay as they were
registered.

### Sync the catalog's record

Send the table's columns, comment, and properties from the Delta log to the
catalog in one request to the Unity Catalog Delta API. You send it from
Python. If you changed the table in the Spark SQL shell, use the delta-rs ·
Python tab, which reads the same Delta log: start its session as in
[Set up the client](#set-up-the-client), and open the table as in
[Change the Delta log](#change-the-delta-log).

These two helpers load a table and update it:

```python file=./snippets/delta_api.py start=start:delta-api end=end:delta-api
```

Then send what your engine reads from the Delta log:

:::tab[Spark · Python]
```python file=./snippets/delta_api.py start=start:sync-columns end=end:sync-columns
```
:::

:::tab[delta-rs · Python]
```python file=./snippets/external_deltalake.py start=start:sync-deltalake end=end:sync-deltalake
```
:::

Load the table again and retry if the server returns HTTP 409
`UpdateRequirementConflictException`. It means the table changed after you
loaded it, and the server applied none of the updates.

<!-- Link E14 (The Unity Catalog Delta API) here once it has a page. Its model element is pending #272. -->

You can also drop the table from the catalog and register it again, as in
[Register external Delta table](../register-external-table/index.md#change-a-registered-table).

## Required privileges

With authorization enabled, each task needs these privileges. Owners have all
of them.

| Task | Privileges |
| --- | --- |
| Change a table's columns, comment, or properties | Owner of the table, or of its schema or catalog |
| Rename a table by copying it | `USE CATALOG` on the catalog, `USE SCHEMA` and `CREATE TABLE` on the schema, `SELECT` on the old table, and ownership of the old table, its schema, or its catalog to drop it |
| Sync an external table's record through the Delta API | Not checked: the examples run without authorization |

See [Ownership and privileges](../../explanation/uc-basics/index.md#ownership-and-privileges).

<!-- TODO(open question): Is MODIFY on the table enough for ALTER TABLE, COMMENT ON, and SET/UNSET TBLPROPERTIES, or is ownership required? Which privileges does reading the catalog's record (`uc table get`, `TablesApi.get_table`) and a Delta API update need? The local environment runs without authorization, so no script checks these. -->

## Next steps

- [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md)
  walks through a managed table's life from creation to drop.
- [Register external Delta table](../register-external-table/index.md) covers
  registering, reading, and dropping an external table.
- [Use Spark with Unity Catalog](../configure-spark/index.md) covers the
  session settings and storage credentials.
- [Learn how managed and external tables differ](../../explanation/external-and-managed-tables/index.md)
  and why the catalog accepts each commit.
