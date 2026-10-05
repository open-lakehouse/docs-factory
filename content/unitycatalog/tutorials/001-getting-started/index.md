---
title: Create your first catalog
summary: Start a local Unity Catalog 0.6.0 server, browse its sample data, then create a catalog, a schema, and a Delta table of your own with the uc CLI.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
status: draft
---

In this tutorial you start a Unity Catalog server on your machine, look around
the sample data it ships with, and then build your own corner of the catalog: a
catalog, a schema inside it, and a Delta table you write to and read back.

:::prerequisites
:::

::::journey

### Start the server

Run the commands under **Prerequisites**. They download the docs'
environment and start Unity Catalog 0.6.0.

The server now listens on `http://localhost:8080`. Authorization is off, so
every command succeeds without a token. That keeps this tutorial short, and it
is also why this configuration must never serve anyone but you.
[Run a local Unity Catalog server](../../how-to/run-local-server/index.md)
describes the environment.

### Define a shortcut for the CLI

The CLI lives inside the server's container. Define this shortcut in every
terminal you use:

```bash file=./snippets/first_catalog.sh start=start:setup end=end:setup
```

### Browse the sample data

The server comes with two sample catalogs. List them, then look one level
down at a time, through a schema to its tables:

```bash file=./snippets/first_catalog.sh start=start:browse end=end:browse
```

You see the catalogs `production` and `unity`. Inside `unity` are the schemas
`commerce`, `consumer`, and `default`, and `unity.default` holds tables such as
`numbers` and `marksheet`. Every table has a three-part name,
`catalog.schema.table`.

Read a few rows from one of them:

```bash file=./snippets/first_catalog.sh start=start:sample-rows end=end:sample-rows
```

The output is a table with the columns `as_int` and `as_double`. The CLI asked
the catalog where `unity.default.numbers` lives, then read the Delta files at
that location.

### Create a catalog

Now make your own. A catalog is the top level of the namespace:

```bash file=./snippets/first_catalog.sh start=start:create-catalog end=end:create-catalog
```

The CLI prints the new catalog, including its generated `ID`. Run
`uc catalog list` again and `quickstart` is now listed next to the samples.

### Create a schema

A schema groups related tables, and always belongs to one catalog:

```bash file=./snippets/first_catalog.sh start=start:create-schema end=end:create-schema
```

Its full name is `quickstart.sales`.

### Create a table

Create a Delta table with three columns. `--storage_location` tells the catalog
where the table's files live:

```bash file=./snippets/first_catalog.sh start=start:create-table end=end:create-table
```

This is an *external* table: you chose the location, and the catalog records it
alongside the table's name and columns. The path is inside the container, so
the files go away when you remove the container.

### Write and read rows

Fill the table with sample rows, then read them back by name:

```bash file=./snippets/first_catalog.sh start=start:write-rows end=end:write-rows
```

```bash file=./snippets/first_catalog.sh start=start:read-rows end=end:read-rows
```

You see rows with `order_id`, `customer`, and `amount` columns.

:::note
`uc table write` exists for trying things out: it writes randomly generated
rows that match the table's columns, so your values differ from anyone else's.
Real applications write through an engine such as Spark or a Delta library.
:::

### Clean up

Delete your catalog together with everything in it:

```bash file=./snippets/first_catalog.sh start=start:clean-up end=end:clean-up
```

Leave the server running for the next tutorial. When you're done,
[stop it](../../how-to/run-local-server/index.md#stop-or-reset-the-server)
with `docker compose down`. The server keeps its metadata inside the
container, so stopping it also resets the sample catalogs.

::::

## What you did

You ran a Unity Catalog server and used it the way every client does. You found
data by its three-part name, and the catalog answered with metadata and a
storage location. Then you registered a catalog, schema, and table of your own.

## Next steps

- [Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md)
  explains the objects you just created and how they relate.
- [Use the Python client](../python-client/index.md) does the same from Python.
- [Create and manage catalogs and schemas](../../how-to/manage-catalogs-and-schemas/index.md)
  covers updating, renaming, and deleting them.
