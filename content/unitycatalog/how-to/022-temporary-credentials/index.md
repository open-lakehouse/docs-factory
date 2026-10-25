---
title: Request temporary storage credentials
summary: Ask Unity Catalog for S3 credentials scoped to one table, volume, model version, or path, open storage with them, and renew them before they expire.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - lakehouse.credentialIssuer
  - lakehouse.objectStorage
  - s3Spec
status: draft
---

A client that reads or writes data under [Unity Catalog](model:unityCatalogServer)
asks the server for storage credentials, then talks to
[object storage](model:lakehouse.objectStorage) itself. Each request names one
table, volume, model version, or path, and one operation. On S3, the server
answers with an access key, secret key, and session token that reach only that
object's location, allow only that operation, and expire after an hour. Engines
such as Spark make these requests for you. Make them yourself when you build a
client, or open storage from an application. For how the server decides and
mints a credential, see
[Credential vending](../../explanation/credential-vending/index.md).

:::prerequisites
- A storage credential and an external location over the data:
  [Configure AWS storage credentials and external locations](../configure-aws-storage/index.md).
- [uv](https://docs.astral.sh/uv/getting-started/installation/), for the Python
  examples, or [jq](https://jqlang.org/download/), for the REST examples.
:::

The examples use a catalog `analytics` with an S3 storage root under the
external location `lake` on `s3://amzn-s3-demo-bucket/lake`. Its schema `ops`
holds an external table `trips`, a managed volume `files`, and a registered
model `churn` with a finalized version 1.

## Set up the client

:::tab[Python SDK]
Start Python with the SDK and obstore:

```bash
uv run --with unitycatalog-client==0.7.0 --with obstore==0.11.1 python -m asyncio
```

```python file=./snippets/temporary_credentials.py start=start:connect end=end:connect
```

Inside `async with ApiClient(config) as api:`, create the API object:

```python file=./snippets/temporary_credentials.py start=start:api end=end:api
```
:::

:::tab[REST API]
The `uc` CLI has no command for temporary credentials, so call the REST API:

```bash file=./snippets/temporary_credentials.sh start=start:setup end=end:setup
```
:::

Every response has the same shape: `url`, the location the credential covers;
`aws_temp_credentials`, with `access_key_id`, `secret_access_key`, and
`session_token`; and `expiration_time`, in epoch milliseconds.

## Get credentials for a table

Look up the table's ID, then ask for `READ` or `READ_WRITE`:

:::tab[Python SDK]
```python file=./snippets/temporary_credentials.py start=start:table end=end:table
```
:::

:::tab[REST API]
```bash file=./snippets/temporary_credentials.sh start=start:table end=end:table
```
:::

The `url` is the table's storage location. A `READ` credential lists and reads
the table's files, and S3 rejects its writes.

**Required privileges:** `USE CATALOG` and `USE SCHEMA` on the parents, plus
`SELECT` on the table to read, or `SELECT` and `MODIFY` to write. Ownership
covers each of them
([source](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/auth/AuthorizeExpressions.java#L205-L213)).

## Get credentials for a volume

Look up the volume's ID, then ask for `READ_VOLUME` or `WRITE_VOLUME`:

:::tab[Python SDK]
```python file=./snippets/temporary_credentials.py start=start:volume end=end:volume
```
:::

:::tab[REST API]
```bash file=./snippets/temporary_credentials.sh start=start:volume end=end:volume
```
:::

The `url` is the volume's storage location. For a managed volume, the server
chose it under the schema's or catalog's storage root.

**Required privileges:** `USE CATALOG` and `USE SCHEMA` on the parents, plus
`READ VOLUME` to read. Writing needs ownership of the volume
([source](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/TemporaryVolumeCredentialsService.java#L36-L43)).

## Get credentials for a model version

A model version is named by its model's three-part name and its version
number. Ask for `READ_MODEL_VERSION` to load its files:

:::tab[Python SDK]
```python file=./snippets/temporary_credentials.py start=start:model-version end=end:model-version
```
:::

:::tab[REST API]
```bash file=./snippets/temporary_credentials.sh start=start:model-version end=end:model-version
```
:::

`READ_WRITE_MODEL_VERSION` works only while the version is
`PENDING_REGISTRATION`, so a client can upload its files. Once the version is
finalized, the server refuses with `Cannot request read/write credentials on a
model version that has been finalized`. MLflow makes both requests for you when
it registers and loads a model (see
[Manage models](../manage-models/index.md)).

**Required privileges:** `USE CATALOG` and `USE SCHEMA` on the parents, plus
`EXECUTE` on the registered model to read. Writing needs ownership of the
model
([source](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/TemporaryModelVersionCredentialsService.java#L40-L47)).

## Get credentials for a path

Ask for a storage URL directly when no catalog object names it yet, for
example to stage files before you register a table:

:::tab[Python SDK]
```python file=./snippets/temporary_credentials.py start=start:path end=end:path
```
:::

:::tab[REST API]
```bash file=./snippets/temporary_credentials.sh start=start:path end=end:path
```
:::

The operation is `PATH_READ`, `PATH_READ_WRITE`, or `PATH_CREATE_TABLE`. The
credential covers the URL you asked for, not its external location, so ask for
the narrowest prefix you need. A URL outside every external location fails
with `FAILED_PRECONDITION` and `S3 bucket configuration not found.`

**Required privileges:** for a path inside a table, volume, or model, the
privileges on that object, as if you had asked for it by name. For a path no
object owns, `READ FILES` on the external location for `PATH_READ`, or `READ
FILES` and `WRITE FILES` for `PATH_READ_WRITE`. `PATH_CREATE_TABLE` needs
`CREATE EXTERNAL TABLE` on the external location, and the server refuses it
for a path that overlaps an existing table, volume, or model. Ownership of the
location covers each of them
([source](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/TemporaryPathCredentialsService.java#L58-L101)).

## Open storage with the credentials

Pass the three keys to your S3 client, with the `url` as its root. With
obstore:

:::tab[Python SDK]
```python file=./snippets/temporary_credentials.py start=start:store end=end:store
```
:::

Other S3 clients take the same three values. The AWS CLI and SDKs read them
from `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`.
S3 rejects any request outside the `url`, and any write made with a read
credential.

## Renew credentials before they expire

A long-running client caches a credential until shortly before
`expiration_time` and then asks again. The server checks the grants on every
request, so a revoked grant stops the renewal. With obstore, return the
credential from a provider function, and obstore calls it again only when the
cached one expires:

:::tab[Python SDK]
```python file=./snippets/temporary_credentials.py start=start:refresh end=end:refresh
```
:::

The three writes share one credential. `expiration_time` is in milliseconds,
so divide it by 1000 before converting it to a time.

obstore calls an async provider only from its async methods. For a provider
that also serves sync calls, and how obstore times renewals, see
[Use Unity Catalog credentials with obstore](../obstore-credentials/index.md).

## Credentials for local storage

A table, volume, or path on `file://` storage needs no keys. The server still
checks the privileges, then returns only the `url`, with no
`aws_temp_credentials` and no `expiration_time`. A client that always expects
keys fails on local data, so check for them before you build an S3 client.

## Next steps

- [Read files from a volume](../../tutorials/read-volume-files/index.md)
  requests a volume credential and reads the files with it.
- [Configure Spark to use Unity Catalog](../configure-spark/index.md): Spark
  requests table credentials itself and can renew them.
- [Set managed storage for catalogs and schemas on S3](../managed-storage-s3/index.md)
  to choose where managed volumes and model versions land.
