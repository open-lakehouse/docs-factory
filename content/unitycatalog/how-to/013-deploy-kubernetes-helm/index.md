---
title: Deploy Unity Catalog on Kubernetes with Helm
summary: Install the Unity Catalog Helm chart with a pinned server image, PostgreSQL metadata, a kept token-signing key, and an Ingress or Gateway route, then upgrade and uninstall it safely.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: draft
---

The [Unity Catalog](model:unityCatalogOSS) Helm chart runs the server as a
Kubernetes Deployment. This page installs one server whose metadata lives in
PostgreSQL, so pods can be replaced, rescheduled, and upgraded without losing
catalogs. It also covers how to route traffic to the server, and what to keep
when you uninstall.

:::prerequisites
- A Kubernetes cluster and `kubectl` configured for it, with permission to
  create a namespace.
- Helm 3.8 or later, which installs charts from OCI registries.
- A PostgreSQL database the cluster can reach. To try the chart without one,
  this page includes a single-pod PostgreSQL.
- `openssl` on your machine.
:::

## Create the namespace and the database password

The chart reads the database password from a Secret. Create a namespace and a
Secret with a generated password:

```bash file=./snippets/deploy.sh start=start:create-secret end=end:create-secret
```

If you use a database you already run, put its password in the Secret instead.
Give the server's role ownership of its database: the server creates and
alters its own tables.

To try the chart without a database, apply this manifest. It runs one
PostgreSQL pod with a 1 GiB volume and takes the password from the same
Secret:

```bash file=./snippets/deploy.sh start=start:trial-postgres end=end:trial-postgres
```

```yaml file=./snippets/postgres.yaml title="postgres.yaml"
```

:::warning
This PostgreSQL has no replicas and no backups. Use a managed database or an
operator-run cluster for anything you keep.
:::

## Write the values file

Save the chart settings as `values.yaml`:

```yaml file=./snippets/values.yaml title="values.yaml"
```

| Value | Why |
| --- | --- |
| `server.db.type: postgresql` | The default `file` database is an H2 file on a volume. It works for one pod only and can't be shared. |
| `server.db.postgresqlConfig` | Host, database, and role. Set `host` to your database's address. `postgres` is the trial Service. |
| `passwordSecretName`, `passwordSecretKey` | The Secret from the previous step. The chart never stores the password in a ConfigMap. |
| `server.deployment.image.tag` | The server release. Pin it, so that a new chart version doesn't change the server by itself. |
| `resources` | Requests that let the scheduler place the pod, and a memory limit. The server is a JVM, so give it at least 1 GiB. |
| `enableReadinessProbe`, `enableLivenessProbe` | The chart's probes check the API port. Without a readiness probe, a Service sends traffic to a pod that's still starting. |
| `ui.enabled: false` | The chart also deploys the web UI by default, but no UI image ships with the server releases. |

The server runs without authorization: anyone who can reach the Service has
full access to it. Keep the Service internal until you set up authentication,
as in [Authenticate requests with an Envoy
proxy](../envoy-authentication/index.md). The chart's `auth` values configure
the server's own OAuth login.

## Install the chart

Install the chart into the namespace, and wait until the server is ready:

```bash file=./snippets/deploy.sh start=start:install end=end:install
```

On first install, the chart creates the Secret
`unitycatalog-server-jwt-key` with a new key for signing the server's access
tokens.

Define a `uc` shell function that runs the CLI inside the server pod:

```bash file=./snippets/deploy.sh start=start:setup end=end:setup
```

Check the pods and the API:

```bash file=./snippets/deploy.sh start=start:check end=end:check
```

Both pods are `Running` and ready, and the catalog list is empty. A
PostgreSQL-backed server doesn't have the image's sample catalogs.

To reach the API from your machine, forward the Service port in the
background:

```bash file=./snippets/deploy.sh start=start:port-forward end=end:port-forward
```

The API is now at `http://localhost:8080/api/2.1/unity-catalog`. To stop
forwarding, run `kill %1`.

## Check that the metadata survives a new pod

Create a catalog:

```bash file=./snippets/deploy.sh start=start:create-catalog end=end:create-catalog
```

Replace the server pod, then read the catalog back:

```bash file=./snippets/deploy.sh start=start:restart end=end:restart
```

The new pod finds the catalog in PostgreSQL and signs tokens with the key from
`unitycatalog-server-jwt-key`, so tokens issued before the restart stay valid.

## Route traffic to the server

The chart routes `/api` on one host name to the server. Add one of these
values files to the install or upgrade, with `--values`:

:::tab[Ingress]
```yaml file=./snippets/values-ingress.yaml title="values-ingress.yaml"
```

Set `ingressClassName` to your Ingress controller's class. With
`tlsSecretName`, the Ingress serves TLS with the certificate in that Secret.
:::

:::tab[Gateway API]
```yaml file=./snippets/values-httproute.yaml title="values-httproute.yaml"
```

`parentRefs` names the Gateway that accepts traffic for the host. The Gateway
handles TLS.
:::

Clients then use `https://catalog.example.com/api/2.1/unity-catalog`.

## Upgrade

Back up the database before you upgrade the server. On its first start, a new
release adds the tables and columns it needs, and nothing reverses that
change. Then change `image.tag` in `values.yaml` and upgrade the release. For
a new chart version, change `--version` too:

```bash file=./snippets/deploy.sh start=start:upgrade end=end:upgrade
```

The chart replaces the pod with a rolling update and waits for it to be
ready. To roll back, restore the database backup and run `helm rollback`.

## Run more than one replica

`server.deployment.replicaCount` above 1 needs a PostgreSQL database: replicas
can't share the `file` database. Each server also keeps its authorization
policy in memory. Set `server.authorization.policy-refresh=true` under
`server.config.extraProperties`, so a grant made through one replica reaches
the others. More replicas spread load and survive the loss of a pod. They
don't make the database highly available.

## Uninstall

Uninstall the release:

```bash file=./snippets/deploy.sh start=start:uninstall end=end:uninstall
```

Helm removes the Deployment, Service, and ConfigMap. It keeps
`unitycatalog-server-jwt-key`, and it doesn't touch the database, so a
reinstall into the same namespace finds the same key and metadata. Delete the
Secret only if you also want to invalidate every token the server issued.

## Next steps

- [Deploy a persistent Unity Catalog server with Docker
  Compose](../deploy-docker-compose/index.md) runs the same server on one host.
- [Configure PostgreSQL as the metadata
  database](../configure-backend-db/index.md) explains the database settings
  and backups.
- [Configure AWS storage credentials and external
  locations](../configure-aws-storage/index.md) lets the server vend
  credentials for S3 tables and volumes. The chart's `storage.credentials`
  values hold the same settings.
