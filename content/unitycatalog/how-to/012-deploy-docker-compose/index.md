---
title: Deploy a persistent Unity Catalog server with Docker Compose
summary: Run one Unity Catalog server and its PostgreSQL database with Docker Compose, with a pinned image, a readiness health check, and volumes that survive restarts and upgrades.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

The [local server](../run-local-server/index.md) that the other pages use is
for trying things out: its metadata disappears with the container. This page
sets up a [Unity Catalog](model:unityCatalogOSS) server you keep. It runs on
one host with Docker Compose, stores its metadata in PostgreSQL, and reports
when it's ready to serve. Its state lives in named volumes, so it survives new
containers and image upgrades.

:::prerequisites
- Docker Engine with the Compose plugin 2.23.1 or later, on a host that can
  pull from Docker Hub.
- `openssl` and `curl` on the host.
:::

## Create the deployment folder

The deployment is three files in one folder: the Compose file,
`server.properties`, and an `.env` file with the database password. Create the
folder and save this Compose file in it as `compose.yaml`:

```yaml file=./snippets/compose.yaml title="compose.yaml"
```

| Setting | Why |
| --- | --- |
| `image: unitycatalog/unitycatalog:v0.7.0` | A fixed release. With `latest`, an unplanned pull changes the server under its database. |
| `command: [..., "--obs-port", "8090"]` | Turns on the `/livez`, `/readyz`, and `/metrics` endpoints on their own port. They're off unless you pass the flag. |
| `healthcheck` on `/readyz` | `/readyz` answers 200 only while the server can reach its database, so `up --wait` returns when the server can serve. |
| `conf` volume | The server writes its token-signing keys and an admin token to `etc/conf` on first start. The volume keeps them across new containers. |
| `server.properties` bind mount | Your server settings, mounted read-only into the `conf` volume. |
| `configs: hibernate` | Generates `hibernate.properties` from `.env`, so the password is stored in one file. |
| `db` volume | PostgreSQL's data directory. |
| `restart: unless-stopped` | Brings both services back after a crash or a host reboot. |

Port 8090 stays on the Compose network. Its endpoints don't check
credentials, and `/metrics` exposes operational counters, so don't publish the
port. A Prometheus container on the same network can still scrape it.

The image's own `hibernate.properties` would keep metadata in an H2 file
inside the container. [Configure PostgreSQL as the metadata
database](../configure-backend-db/index.md) explains the Hibernate keys and how
to point them at a database you already run.

## Configure the server

Save the server settings next to `compose.yaml` as `server.properties`:

```properties file=./snippets/server.properties title="server.properties"
```

This starts a server without authorization, so anyone who can reach port 8080
has full access. Bind it to a private network, or set up authentication before
you share it, as in [Authenticate requests with an Envoy
proxy](../envoy-authentication/index.md). The file replaces the image's
`server.properties`, so add the storage credentials and other settings your
deployment needs to it. The image's file lists every key with a comment.

## Start the server

Generate a database password into `.env` and make the file readable only to
you:

```bash file=./snippets/deploy.sh start=start:write-env end=end:write-env
```

PostgreSQL takes the password from this file only when it first initializes
the `db` volume. To change it later, change it in the database too.

Start both services and wait until they're healthy:

```bash file=./snippets/deploy.sh start=start:start end=end:start
```

Check the services, the readiness endpoint, and the API:

```bash file=./snippets/deploy.sh start=start:check end=end:check
```

Both services show `healthy`, `/readyz` answers `{"healthy":true}`, and the
catalog list is empty. The sample catalogs `unity` and `production` live in
the image's H2 file, so a PostgreSQL-backed server doesn't have them.

## Check that the metadata survives

Define a `uc` shell function that runs the CLI inside the server container:

```bash file=./snippets/deploy.sh start=start:setup end=end:setup
```

Create a catalog:

```bash file=./snippets/deploy.sh start=start:create-catalog end=end:create-catalog
```

Remove the containers and start new ones, then read the catalog back:

```bash file=./snippets/deploy.sh start=start:restart end=end:restart
```

The catalog is still there, and the new container signs tokens with the same
keys as the old one. `docker compose down` removes containers and the network
but keeps named volumes.

## Back up the server

Back up two things: the PostgreSQL database, and the `conf` volume with the
signing keys:

```bash file=./snippets/deploy.sh start=start:backup end=end:backup
```

`uc-conf-backup` holds the private signing key and the generated
`hibernate.properties` with the database password. Store it like any other
secret. The backup covers metadata only: table and volume data stays in its
storage locations.

## Upgrade the server

1. Back up the database and the `conf` volume, as in the previous section.
2. In `compose.yaml`, change the image tag to the new release.
3. Recreate the server:

   ```bash file=./snippets/deploy.sh start=start:upgrade end=end:upgrade
   ```

Compose pulls the new image, replaces the server container, and waits for
`/readyz`. On its first start, the new release adds the tables and columns it
needs to the database, and nothing reverses that change. To roll back, restore
the database backup and start the old tag.

Servers before 0.7.0 don't have `--obs-port` or `/readyz`. To upgrade such a
server, bring its Compose file in line with this page's `command` and
`healthcheck` in the same change as the new tag.

## Remove the deployment

To remove the containers and every volume, run:

```bash file=./snippets/deploy.sh start=start:remove end=end:remove
```

:::danger
`down -v` deletes the database and the signing keys. Every catalog, schema,
table, volume, and credential the server stored is gone. The files those
tables point to stay where they are.
:::

## Next steps

- [Deploy Unity Catalog on Kubernetes with Helm](../deploy-kubernetes-helm/index.md)
  runs the same server on a cluster.
- [Configure AWS storage credentials and external
  locations](../configure-aws-storage/index.md) lets the server vend
  credentials for S3 tables and volumes.
- [Features, scope, and limitations](../../reference/features-and-limitations/index.md)
  lists the server's deployment options.
