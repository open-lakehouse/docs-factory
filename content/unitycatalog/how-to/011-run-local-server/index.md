---
title: Run a local Unity Catalog server
summary: Download the docs' Docker Compose environment and start a single-user Unity Catalog 0.6.0 server on localhost:8080, optionally next to a local stand-in for Amazon S3.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
status: draft
---

Every example in these docs runs against the same local
[Unity Catalog](model:unityCatalogOSS) 0.6.0 server: one container that
listens on `http://localhost:8080`, with authorization disabled so that no
request needs a token. Start it once, and it serves every tutorial and how-to
guide until you stop it.

:::prerequisites{environment="unitycatalog/compose.yaml"}
- `docker compose version` reports v2 or later. The AWS variant also uses
  port 9000.
:::

## Download the environment

The commands under **Prerequisites** download the docs' environment, a small
archive, and start the default server. The archive unpacks into
`uc-docs-env/`:

- `uc-docs-env/unitycatalog` holds the server's compose files and
  configuration. Run every `docker compose` command on this page from here.
- `uc-docs-env/aws-sim` holds the simulated AWS services that the AWS variant
  includes.

The server mounts its configuration from this folder. On Colima and other VMs
that share only your home directory, download it to a folder under your home
directory, or the server fails with a `not a directory` mount error.

## Start the server

```bash
docker compose up -d --wait
```

The command returns once the server reports healthy. This starts Unity
Catalog 0.6.0 with this configuration:

```yaml file=../../../../envs/unitycatalog/compose.yaml title="compose.yaml"
```

```properties file=../../../../envs/unitycatalog/server.properties title="server.properties"
```

The server ships two sample catalogs, `unity` and `production`, so there is
something to browse right away.

## Start the server with simulated S3

Pages about S3 storage, storage credentials, and credential vending need an
S3 bucket and AWS STS. The AWS variant adds
[aws-sim](https://github.com/open-lakehouse/docs-factory/tree/main/envs/aws-sim),
a local S3 and STS that answers the real AWS hostnames, so the server runs its
real AWS code path against a bucket named `uc-docs`:

```bash
docker compose -f compose.aws.yaml up -d --wait
```

```yaml file=../../../../envs/unitycatalog/compose.aws.yaml title="compose.aws.yaml"
```

```properties file=../../../../envs/unitycatalog/server.aws.properties title="server.aws.properties"
```

Clients on your machine reach the simulated S3 at `localhost:9000`. Set these
variables in each terminal you run examples from:

```bash
export AWS_ENDPOINT_URL=http://localhost:9000
export AWS_ALLOW_HTTP=true
```

aws-sim enforces the session policy that the server attaches to vended
credentials. It doesn't check IAM trust policies or external IDs, so verify
those on real AWS.

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

Stop the server from the `uc-docs-env/unitycatalog` folder, with the same `-f`
option you started it with:

```bash
docker compose down
```

The server keeps its metadata in the container, so stopping it also discards
every catalog you created and restores the samples. Files you wrote under
`UC_DOCS_ROOT` stay on your machine. To keep metadata across restarts, a server
stores it in an external database instead; see
[Configure PostgreSQL as the metadata database](../configure-backend-db/index.md).

:::warning
This configuration has authorization disabled: anyone who can reach port 8080
can read and change everything in the catalog. Use it only on your own machine.
:::

## Next steps

- [Create your first catalog](../../tutorials/getting-started/index.md) uses
  this server from the command line.
- [Choose a client or engine](../../reference/clients-and-engines/index.md)
  lists the tools that connect to it.
