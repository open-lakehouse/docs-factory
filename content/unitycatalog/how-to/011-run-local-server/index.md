---
title: Run a local Unity Catalog server
summary: Start one of the docs' Docker Compose environments, a single-user Unity Catalog server on localhost:8080 on its own, with a local stand-in for Amazon S3, or with PostgreSQL, and know what each one runs.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
status: ready
---

Every example in these docs runs against a local
[Unity Catalog](model:unityCatalogOSS) server that you start with Docker
Compose. The docs ship it as one download with several environments. Each
runs the same single-user server on `http://localhost:8080`, with
authorization disabled so that no request needs a token, and adds what a
group of pages needs: simulated S3 storage, or a PostgreSQL metadata database.
Start the one a page names, and it serves every page that uses it until you
stop it.

:::tip
These environments are deliberately small. For more complex setups around a
Unity Catalog server, see the
[Unity Catalog Playground](https://github.com/open-lakehouse/unitycatalog-playground)
repository.
:::

:::prerequisites{environment="unitycatalog/compose.yaml"}
:::

## Choose an environment

| Environment | Use it for | Host ports |
| --- | --- | --- |
| [Minimal server](#start-the-minimal-server) | Most pages: catalogs, schemas, tables, volumes, functions, and engines on local files | 8080 |
| [Server with simulated S3](#start-the-server-with-simulated-s3) | S3 storage, storage credentials, and credential vending | 8080, 9000 |
| [Server with PostgreSQL](#start-the-server-with-postgresql) | Metadata that survives a new or upgraded server container | 8080 |

Every page's prerequisites name the environment it runs against. Run one
environment at a time: they share the compose project `uc-docs` and the
container name `unitycatalog`, so starting one replaces the server of another.

The commands below download the environment into `uc-docs-env/` in the current
folder, and the server mounts its configuration from there. On Colima and
other VMs that share only your home directory, run them from a folder under
your home directory, or the server fails with a `not a directory` mount error.

## Start the minimal server

:::environment{key="unitycatalog/compose.yaml"}
:::

:::info[What it runs]
- One `unitycatalog` container, with authorization disabled.
- The REST API at `http://localhost:8080/api/2.1/unity-catalog`, and the
  Iceberg REST catalog under `/iceberg` on the same path.
- The sample catalog `unity`, so there is something to browse right away.
- Metadata in an H2 file inside the container, discarded when you stop it.
- [`UC_DOCS_ROOT`](#share-a-folder-with-the-server), default `/tmp/uc-docs`,
  mounted at the same path, for tables and volume files on local storage.
:::

`docker compose up --wait` returns once the server reports healthy. The server
builds from the upstream release image, with two fixes for running on Linux,
and runs with this configuration:

```yaml file=../../../../envs/unitycatalog/compose.yaml title="compose.yaml"
```

```properties file=../../../../envs/unitycatalog/server.properties title="server.properties"
```

To register tables whose files you already have, see
[Register external Delta table](../register-external-table/index.md).

## Start the server with simulated S3

:::environment{key="unitycatalog/compose.aws.yaml"}
:::

:::info[What it runs]
- The minimal server, configured with an AWS master role.
- [aws-sim](https://github.com/open-lakehouse/docs-factory/tree/main/envs/aws-sim),
  a local S3 and STS behind an Envoy proxy that answers the real AWS hostnames,
  so the server runs its real AWS code path.
- An S3 bucket named `uc-docs`, reachable from your machine at
  `http://localhost:9000`.
- The `export` lines set the endpoint for clients in the current terminal.
  Run them again in each terminal you run examples from.
:::

aws-sim enforces the session policy that the server attaches to the
credentials it vends. It doesn't check IAM trust policies or external IDs, so
verify those on real AWS.

```yaml file=../../../../envs/unitycatalog/compose.aws.yaml title="compose.aws.yaml"
```

```properties file=../../../../envs/unitycatalog/server.aws.properties title="server.aws.properties"
```

Pages that use this environment:

- [Configure AWS storage credentials and external locations](../configure-aws-storage/index.md)
- [Set managed storage for catalogs and schemas on S3](../managed-storage-s3/index.md)
- [Use Iceberg REST clients with Unity Catalog](../iceberg-rest/index.md)

[Credential vending](../../explanation/credential-vending/index.md) explains
what the server hands to clients.

## Start the server with PostgreSQL

:::environment{key="unitycatalog/compose.postgres.yaml"}
:::

:::info[What it runs]
- The minimal server, with its metadata in PostgreSQL instead of the H2 file.
- A `postgres` service (database `ucdb`, user `uc`), reachable only from the
  server, not from your machine.
- The data in the Docker volume `uc-postgres`, so catalogs survive stopping,
  recreating, or upgrading the server container.
- An empty metastore: the sample catalog `unity` isn't there.
:::

```yaml file=../../../../envs/unitycatalog/compose.postgres.yaml title="compose.postgres.yaml"
```

```properties file=../../../../envs/unitycatalog/hibernate.postgres.properties title="hibernate.postgres.properties"
```

To point a server of your own at PostgreSQL, see
[Configure PostgreSQL as the metadata database](../configure-backend-db/index.md).

## Share a folder with the server

The server container mounts one directory, `UC_DOCS_ROOT` (default
`/tmp/uc-docs`), at the same path as on your machine. A `file://` location
under it then means the same files to the server and to your client. Pages
that write tables or volume files on local storage use it.

Docker Desktop shares `/tmp` with containers by default. Colima and some other
VMs share only your home directory. On those, pick a folder under your home
directory and set it before you start the server, in every terminal you use:

```bash
export UC_DOCS_ROOT=$HOME/uc-docs
mkdir -p "$UC_DOCS_ROOT"
docker compose up -d --wait
```

## Run the `uc` CLI

The `uc` command-line tool ships inside the server image. Define a shell
function that runs it in the container, from any folder:

```bash file=../../tutorials/001-getting-started/snippets/first_catalog.sh start=start:setup end=end:setup
```

Then `uc catalog list` lists the catalogs. The CLI connects to
`http://localhost:8080` by default.

## Stop or reset the server

Stop the environment from the `uc-docs-env/unitycatalog` folder, with the same
`-f` option you started it with, so that its other services stop too:

```bash
docker compose down
docker compose -f compose.aws.yaml down
docker compose -f compose.postgres.yaml down
```

The minimal and S3 servers keep their metadata in the container, so stopping
them discards every catalog you created and restores the samples. The
PostgreSQL environment keeps it in the `uc-postgres` volume; add `-v` to its
`down` command to delete that too. Files you wrote under `UC_DOCS_ROOT` stay on
your machine.

:::warning
These environments have authorization disabled: anyone who can reach port
8080 can read and change everything in the catalog. Use them only on your own
machine.
:::

## Next steps

- [Create your first catalog](../../tutorials/getting-started/index.md) uses
  the minimal server from the command line.
- [Use the Python client](../../tutorials/python-client/index.md),
  [Spark](../configure-spark/index.md), or
  [DuckDB](../duckdb/index.md) to connect to it.
