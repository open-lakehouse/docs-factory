---
title: Query Iceberg tables with DataFusion in Rust
summary: Connect iceberg-rust's REST catalog to Unity Catalog's Iceberg REST API, then create, write, and read a managed Iceberg table with DataFusion SQL.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - icebergRestSpec
  - icebergRust
  - datafusion
status: draft
---

A Rust program can work with [Unity Catalog](model:unityCatalogServer)'s
Iceberg tables through the [Iceberg REST API](model:icebergRestSpec), with
[iceberg-rust](model:icebergRust) as the catalog client and
[DataFusion](model:datafusion) as the query engine. iceberg-rust's DataFusion
integration turns a Unity Catalog catalog into a DataFusion catalog, so
`CREATE TABLE`, `INSERT INTO`, and `SELECT` work on its tables. The server
vends short-lived credentials for each table, so the program never holds
bucket keys.

:::prerequisites
- A catalog with managed storage on S3, such as `retail`:
  [Set managed storage for catalogs and schemas on S3](../managed-storage-s3/index.md).
- [Rust](https://www.rust-lang.org/tools/install).
:::

## Create a Cargo project

Create a project with iceberg-rust's REST catalog, its DataFusion integration
and S3 storage, DataFusion, and the Tokio runtime:

```bash
cargo new iceberg-datafusion && cd iceberg-datafusion
cargo add iceberg@0.10.1 iceberg-catalog-rest@0.10.1 iceberg-datafusion@0.10.1 iceberg-storage-opendal@0.10.1
cargo add datafusion@53.1
cargo add tokio --features macros,rt-multi-thread
```

Add the DataFusion release that `iceberg-datafusion` builds on. With
another one, its catalog doesn't fit your `SessionContext`.

Rust has no shell, so the steps below go into `src/main.rs`, in a
`#[tokio::main] async fn main() -> Result<(), Box<dyn std::error::Error>>`.
Run them with `cargo run`. They use these imports:

```rust file=./snippets/query.rs start=start:imports end=end:imports
```

## Connect DataFusion to the catalog

```rust file=./snippets/query.rs start=start:connect end=end:connect
```

The REST catalog takes the same three values as any Iceberg REST client: the
catalog URI, the warehouse, which is the name of one Unity Catalog catalog,
and a token. The local server has authorization disabled and accepts any
token. The S3 storage factory reads and writes table files with the
credentials the server vends for each table.

`register_catalog` makes the catalog's schemas DataFusion schemas, so SQL names
a table `retail.sales.orders`. The provider lists the schemas once, when you
create it; create it again to see schemas added later.

## Create a table

```rust file=./snippets/query.rs start=start:create end=end:create
```

DataFusion hands the column definitions to the catalog, which creates the
table as `MANAGED`, with data source format `ICEBERG`, under the catalog's
storage root.

## Write and read rows

```rust file=./snippets/query.rs start=start:write end=end:write
```

```rust file=./snippets/query.rs start=start:read end=end:read
```

```text
+----------+----------+--------+
| order_id | customer | amount |
+----------+----------+--------+
| 1        | ada      | 9.5    |
| 2        | grace    | 20.0   |
+----------+----------+--------+
```

`INSERT INTO` appends: DataFusion writes the data files with the vended
credentials, then asks the server to commit the new snapshot. Other Iceberg
REST clients see the rows as soon as the commit succeeds.

## Required privileges

With authorization enabled, the server checks the same privileges as for any
other Iceberg REST client: `CREATE TABLE` on the schema to create the table,
`MODIFY` to insert, and `SELECT` to read. See
[Use Iceberg REST clients with Unity Catalog](../iceberg-rest/index.md#required-privileges).

## Next steps

- [Use Iceberg REST clients with Unity Catalog](../iceberg-rest/index.md)
  connects Spark, DuckDB, and PyIceberg to the same catalog, and covers
  updates, renames, and drops.
- [Credential vending](../../explanation/credential-vending/index.md) explains
  how the server scopes the credentials it hands each client.
