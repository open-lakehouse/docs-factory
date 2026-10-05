---
title: Configure PostgreSQL as the metadata database
summary: Store Unity Catalog's metadata in PostgreSQL instead of the default in-container H2 database, so catalogs survive restarts.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

A [Unity Catalog](model:unityCatalogOSS) 0.6.0 server stores catalogs,
schemas, tables, volumes, functions, models, and credentials in a relational
database. By default this is an H2 file inside the server, so the metadata is
lost with the container. To keep it in PostgreSQL, mount one
`hibernate.properties` file into the server. The official image already
includes the PostgreSQL JDBC driver, and the server creates its tables on first
start.

:::prerequisites
- Unity Catalog server 0.6.0. This page is tested against 0.6.0 with
  PostgreSQL 16.
- A PostgreSQL database that the server can reach, and a role that owns it.
:::

## Create the database

Create a role and a database it owns. The server needs to create and alter
tables in the database, so the owner is the simplest role to use:

```sql file=./snippets/create-database.sql title="create-database.sql"
```

## Point the server at PostgreSQL

The server reads `etc/conf/hibernate.properties`, relative to its working
directory. In the container that's
`/home/unitycatalog/etc/conf/hibernate.properties`. Replace the file with one
that names your database:

```properties file=./hibernate.properties title="hibernate.properties"
```

| Key | What it sets |
| --- | --- |
| `hibernate.connection.driver_class` | The JDBC driver. `org.postgresql.Driver` ships in the image. |
| `hibernate.connection.url` | The JDBC URL. Add `sslmode` and other [pgJDBC options](https://jdbc.postgresql.org/documentation/use/) as query parameters. |
| `hibernate.connection.username`, `hibernate.connection.password` | The role from the previous step. |
| `hibernate.hbm2ddl.auto` | `update` makes the server create missing tables and columns at startup. Keep it: the server has no separate schema migration tool. |
| `hibernate.archive.autodetection`, `hibernate.show_sql` | The image's defaults. |

The file replaces the image's own `hibernate.properties`, so write all of
these keys, not only the ones you change. With Docker, bind-mount it read-only
over the path above. On Kubernetes, mount it from a Secret, because it holds
the password. Then restart the server.

If you run the server from a release tarball or a source build instead of the
image, also put the PostgreSQL JDBC driver on the server's classpath, as the
upstream
[deployment guide](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/server/deployment.md)
describes.

A server that can't reach the database doesn't start. It exits with
`Exception during creation of SessionFactory` and the database's reason, for
example `FATAL: password authentication failed for user "unitycatalog"`.

:::warning
A server whose `server.properties` sets `server.env=test` ignores
`hibernate.properties` and keeps its metadata in memory. Use `dev` or leave it
unset.
:::

## Try it on the local server

The docs' local environment has a PostgreSQL variant. From the
`uc-docs-env/unitycatalog` folder, start it instead of the default server:

```bash file=./snippets/backend_db.sh start=start:start-server end=end:start-server
```

It runs the same server next to a `postgres` service, with its data in the
named volume `uc-postgres`:

```yaml file=../../../../envs/unitycatalog/compose.postgres.yaml title="compose.postgres.yaml"
```

```properties file=../../../../envs/unitycatalog/hibernate.postgres.properties title="hibernate.postgres.properties"
```

The server starts with an empty metastore. The sample catalogs `unity` and
`production` live in the image's H2 file, so they aren't there.

## Check that metadata survives a new container

Define the `uc` alias from [Run the `uc` CLI](../run-local-server/index.md#run-the-uc-cli)
and create a catalog:

```bash file=./snippets/backend_db.sh start=start:create-catalog end=end:create-catalog
```

Replace the server container with a new one, then read the catalog back:

```bash file=./snippets/backend_db.sh start=start:recreate-server end=end:recreate-server
```

The catalog is still there. On the default H2 server, the new container would
start from the image's H2 file, without it. `docker compose down` followed by
`up` keeps the metadata too, because it removes the containers but not the
`uc-postgres` volume.

The metadata is ordinary PostgreSQL tables, one per object type, named
`uc_catalogs`, `uc_schemas`, `uc_tables`, and so on:

```bash file=./snippets/backend_db.sh start=start:inspect end=end:inspect
```

Read these tables to inspect or back up the metastore, but change objects only
through the server's API. The server keeps related rows consistent, and direct
writes bypass that.

## Back up and upgrade

Back up the database with the usual PostgreSQL tools. On the local stack:

```bash file=./snippets/backend_db.sh start=start:backup end=end:backup
```

Take a backup before you upgrade the server. On its first start, a new release
adds the tables and columns it needs to the database, and nothing reverses
that change. To roll back, restore the backup and start the old release.

The backup holds metadata only. Table and volume data stays in its storage
locations.

To move from the default H2 database, recreate your catalogs and their
contents through the API, or register existing external tables again. There's
no export from H2.

## Reset the local metadata

To start over on the local stack, remove the containers and the
`uc-postgres` volume:

```bash file=./snippets/backend_db.sh start=start:reset end=end:reset
```

:::danger
`down -v` deletes every catalog, schema, table, volume, and credential that
the server stored. Files the tables point to stay where they are, but the
server no longer knows about them.
:::

## Next steps

- [Run a local Unity Catalog server](../run-local-server/index.md) covers the
  other variants of the local environment.
- [Create and manage catalogs and schemas](../manage-catalogs-and-schemas/index.md)
  to fill the new metastore.
- [Features and limitations](../../reference/features-and-limitations/index.md)
  lists the server's deployment options.
