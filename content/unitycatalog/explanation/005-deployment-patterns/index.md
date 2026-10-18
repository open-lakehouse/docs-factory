---
title: "Deployment patterns: local, hybrid, and hosted"
summary: Unity Catalog keeps no state of its own, so a deployment is a choice of where its database and storage live and where the server runs. Three patterns cover it.
diataxis: explanation
project: unitycatalog
references:
  - unityCatalogOSS
  - postgresql
  - lakehouse.objectStorage
  - lakehouse.credentialIssuer
status: draft
---

A [Unity Catalog](model:unityCatalogOSS) deployment has three parts: the
server, a [PostgreSQL](model:postgresql) database that holds the catalog's
metadata, and [object storage](model:lakehouse.objectStorage) that holds the
files of its tables and volumes. The server keeps nothing between requests
that isn't in one of those two stores. Deploying Unity Catalog therefore comes
down to two questions: where the state lives, and where the server runs. Three
patterns answer them, and each moves one more part off your machine.

| Pattern | Server | Metadata and data | Who shares the catalog |
| --- | --- | --- | --- |
| [Local](#local-everything-on-one-machine) | your machine | your machine's disk | you |
| [Hybrid](#hybrid-a-local-server-with-hosted-state) | each person's machine | a hosted database and bucket | everyone with the database and bucket credentials |
| [Fully hosted](#fully-hosted-only-clients-on-your-machine) | the cloud | the cloud | every client the server authenticates |

The local and hybrid patterns are environments these docs generate with
Trestle. Each diagram below is that environment's plan: select a node's file
count to read the configuration it runs with.

## Local: everything on one machine

The server, PostgreSQL, and RustFS, an S3-compatible object store, run as
containers on one machine under Docker Compose. There is no gateway: each
service publishes its own port, Unity Catalog's REST API on `8080` and the S3
API on `9000`, and clients on the machine call them directly.

![Clients on the host reach Unity Catalog on port 8080 and RustFS on port 9000; Unity Catalog keeps its metadata in PostgreSQL and its files in RustFS](../../../../envs/uc-local/diagram.png "trestle=uc-local")

All state is on the machine's disk. PostgreSQL writes into the environment's
`.data/postgres` folder, so the catalog survives `docker compose down` and a
new server container, and even `docker compose down -v`. RustFS keeps the
files in a Docker volume, which `down -v` deletes. On first start, the stack
registers the bucket with the server as a storage credential and an external
location, so the server can vend credentials for it like it would for Amazon
S3 (see [Credential vending](../credential-vending/index.md)).

The server runs with authorization disabled: whoever can reach port `8080`
acts as the administrator. That is the right trade for one person. Nothing
leaves the machine, a reset is deleting a folder, and the stack starts with
one command. It is the shape of the docs' own environments, which
[Run a local Unity Catalog server](../../how-to/run-local-server/index.md)
starts.

Choose it for development, for learning, and for tests that need a fresh
catalog each run. It stops working when a second person needs the same
catalog, because the state is on your disk.

## Hybrid: a local server with hosted state

Hosted PostgreSQL and S3-compatible storage are a sign-up away, and
providers such as Neon and Cloudflare R2 have free tiers. The hybrid pattern moves the state there and keeps
the server on your machine. Compared with the local pattern, only the two
stores change: [PostgreSQL](model:postgresql) becomes a Neon project, and
RustFS becomes a bucket on any S3-compatible service, such as Cloudflare R2 or
Tigris. Unity Catalog still runs in a container on `8080`.

![Clients on the host reach Unity Catalog on port 8080; Unity Catalog keeps its metadata in a hosted PostgreSQL database on Neon and its files in a bucket on an external S3-compatible store](../../../../envs/uc-hybrid/diagram.png "trestle=uc-hybrid")

Because the server keeps nothing of its own, this is already a shared
deployment. Each person runs the same environment with the same database and
bucket credentials, and every server reads and writes the same catalog. A
catalog one person creates is there for the next request on anyone else's
server. Nothing is deployed to the cloud except the two stores, and stopping a
server loses nothing.

Setting it up takes more than `docker compose up`, because the stores have to
exist first. The environment's own steps create them:

:::deployment{key="uc-hybrid/compose.yaml"}
:::

The steps run a few command-line tools, each named in its step: the Neon CLI
and `jq` for the database, the AWS CLI for the bucket, and
[Trestle](https://github.com/open-lakehouse/trestle) to render the stack
again with the secrets the steps saved.

<!-- Open question: verify the hybrid environment end to end against a Neon
project and an R2 bucket, including two servers on one database at once. Only
its rendered plan is checked today. -->

The pattern's limits come from the same fact that makes it work. Every
participant holds the database password and the bucket key:

- **There is no access control between participants.** Each server runs with
  authorization disabled, and anyone with the database password can change
  the catalog directly. Share the credentials only with people you would make
  administrators.
- **Clients bring their own storage keys.** The server vends credentials only
  for an S3 store that has an IAM role for it to assume. An S3-compatible
  bucket without one isn't registered, so engines read and write it with the
  key from the environment instead of credentials the catalog vends.
- **Every machine is the server's identity.** The secrets that protect the
  data sit in a file on each participant's machine.

Choose it for a small team that trusts each other: a shared sandbox, a
workshop, or a demo that has to survive a laptop restart.

## Fully hosted: only clients on your machine

The last step moves the server too. Unity Catalog runs in the cloud, next to
a managed PostgreSQL database and the object storage. Your machine runs only clients: engines, SDKs, and the
CLI, which reach the catalog over HTTPS.

![Clients on your machine call Unity Catalog in the cloud over its REST API and read and write object storage with vended credentials; in the cloud, Unity Catalog keeps its metadata in PostgreSQL and its files in object storage](./assets/ucDeploymentPatterns_hosted.png "likec4=ucDeploymentPatterns_hosted")

What changes is where the secrets live. The database password and the
storage identity stay in the cloud with the server, and clients hold only
their own token and the short-lived credentials the server vends. That puts
the catalog back at the trust boundary that
[Credential vending](../credential-vending/index.md) describes, so the server
has to turn on authentication and authorization before anyone else reaches
it. The server still keeps no state of its own, so replacing it loses
nothing.

No environment in these docs renders this pattern. The diagram comes from the
architecture model instead. The persistence half is the same as in the hybrid
pattern: [Configure PostgreSQL as the metadata database](../../how-to/configure-backend-db/index.md)
points a server at PostgreSQL, and
[Configure AWS storage credentials and external locations](../../how-to/configure-aws-storage/index.md)
sets up vending on S3.

Choose it when the catalog serves people or jobs you don't sit next to:
production pipelines, a shared platform, or anyone who shouldn't hold the
storage keys.
