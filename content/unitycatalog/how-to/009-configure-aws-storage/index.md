---
title: Configure AWS storage credentials and external locations
summary: Run Unity Catalog on AWS under a master IAM role, register an S3 storage role as a storage credential, bind an S3 prefix to it with an external location, and check that the server vends scoped credentials.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.objectStorage
  - s3Api
status: draft
---

A [Unity Catalog](model:unityCatalogOSS) server governs access to Amazon S3
through storage credentials and external locations, and it never hands out
long-lived keys.
When an authorized client needs data, the server assumes an IAM role through
AWS STS and returns credentials that expire after an hour and are scoped to the
path the client asked for. For why this matters, see
[Credential vending](../../explanation/credential-vending/index.md).

Three IAM principals and two catalog objects are involved:

| Name on this page | What it is | Where it lives |
| --- | --- | --- |
| Master role `uc-master` | The identity the server runs as. It may only assume storage roles. | IAM, attached to the server's host |
| Storage role `uc-storage-lake` | Reads and writes one bucket or prefix. It trusts the master role. | IAM |
| Storage credential `lake_storage` | Records the storage role's ARN, plus an external ID that the server generates. | Unity Catalog |
| External location `lake` | Binds `s3://uc-docs/lake` to the storage credential. | Unity Catalog |

When a client requests access to a path under `s3://uc-docs/lake`, the server
finds the matching external location, assumes its credential's storage role
as the master role with the credential's external ID, and attaches a session
policy that narrows access to the requested path and operation.

## Requirements

- Unity Catalog server 0.4.0 or later. This page is tested against 0.6.0.
- In AWS, permission to create IAM roles and policies, and to edit the bucket's
  policy if the bucket uses one.
- For the Python examples, Python 3.11 or later with `unitycatalog-client` 0.6.0
  and, to check vended credentials, `obstore`. For the CLI examples, `curl`.

To try the steps without an AWS account, start the
[local server with simulated S3](../run-local-server/index.md#start-the-server-with-simulated-s3).
It runs the server's real AWS code path, but it doesn't check trust policies
or external IDs, so do the IAM steps for real on AWS.

Set up the client for your interface:

:::tab[Python SDK]
```python file=./snippets/aws_storage.py start=start:connect end=end:connect
```

Create the API objects from an open client:
`async with ApiClient(config) as api: credentials = CredentialsApi(api)`.
:::

:::tab[CLI]
```bash file=./snippets/aws_storage.sh start=start:setup end=end:setup
```

The CLI connects to `http://localhost:8080` by default. Pass `--server` and
`--auth_token` to reach a different server.
:::

## Run the server as a master role

Create an IAM role for the server, for example `uc-master`, with a permission
policy that allows only `sts:AssumeRole` on your storage roles. A name prefix
keeps the policy stable as you add storage roles:

```json file=./snippets/master-role-policy.json title="uc-master permission policy"
```

Attach the role to wherever the server runs: an EC2 instance profile, an ECS
task role, or an EKS service account through IRSA or EKS Pod Identity. Then set
the role's ARN and region in `server.properties`:

```properties file=./server.aws.properties title="server.properties (on AWS)"
```

Leave `aws.accessKey` and `aws.secretKey` unset. The server then signs its STS
calls through the AWS SDK's default credential chain, which picks up the
attached role. `aws.masterRoleArn` doesn't select an identity. The server
reports it to whoever creates a storage credential, as the principal that the
storage role must trust, so it must match the role the server actually runs as.

The server reads each key from a JVM system property first, then from an
environment variable with the same name (for example `aws.region`), then from
`server.properties`. If `aws.region` is unset, the server uses the AWS SDK's
region chain, then the global STS endpoint.

:::note
Use exactly these key names. The `aws.s3.masterRoleArn`-style spellings in the
upstream `docs/server/aws.md` are silently ignored by the 0.6.0 server.
:::

### Run outside AWS

On premises, prefer
[IAM Roles Anywhere](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html):
it gives the host temporary credentials for the master role through the same
default credential chain, so the configuration above doesn't change. If that
isn't possible, use an IAM user as the master identity. Grant it the same
policy, set `aws.masterRoleArn` to the user's ARN, and pass its keys in
`aws.accessKey` and `aws.secretKey` (or the standard `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` variables). The local stack does this, with aws-sim's
keys.

## Create a storage credential

First create the storage role in IAM, for example `uc-storage-lake`. Give it a
permission policy on the bucket and prefix it serves. A temporary trust policy
is enough for now; you replace it once the server has generated the external
ID.

```json file=./snippets/storage-role-policy.json title="uc-storage-lake permission policy"
```

The server narrows each vended credential to object reads (`s3:GetO*`) and
prefix-scoped `s3:ListBucket`, or for writes, also `s3:PutO*`, `s3:DeleteO*`,
and the multipart actions. Actions the storage role lacks stay denied, so grant
everything your engines need. Engines such as Spark may also call
`s3:GetBucketLocation`.

:::note
Encrypt buckets that Unity Catalog 0.6.0 governs with SSE-S3. The 0.6.0 session
policy has no KMS actions, so vended credentials can't use SSE-KMS objects.
Releases after 0.6.0 add them
([#1774](https://github.com/unitycatalog/unitycatalog/pull/1774)).
:::

Then register the role with Unity Catalog:

:::tab[Python SDK]
```python file=./snippets/aws_storage.py start=start:create-credential end=end:create-credential
```
:::

:::tab[CLI]
```bash file=./snippets/aws_storage.sh start=start:create-credential end=end:create-credential
```
:::

The response's `aws_iam_role` holds three values: `role_arn` (the storage
role), `unity_catalog_iam_arn` (the server's `aws.masterRoleArn`), and
`external_id`, a UUID the server generated for this credential.

**Required privileges:** ownership of the metastore, or `CREATE STORAGE
CREDENTIAL` on it.

## Update the storage role's trust policy

Replace the storage role's trust policy so that only the master role can assume
it, and only with this credential's external ID. The external ID stops another
tenant of the same server from pointing their own credential at your role.

```json file=./snippets/storage-role-trust.json title="uc-storage-lake trust policy"
```

Substitute `unity_catalog_iam_arn` for the principal and `external_id` for
`EXTERNAL_ID_FROM_THE_CREDENTIAL`. If the master identity is an IAM user, use
the user's ARN as the principal.

## Create an external location

An external location makes the server use the credential for every path under
its URL:

:::tab[Python SDK]
```python file=./snippets/aws_storage.py start=start:create-location end=end:create-location
```
:::

:::tab[CLI]
```bash file=./snippets/aws_storage.sh start=start:create-location end=end:create-location
```
:::

External locations can't overlap. The server rejects a URL that equals, contains,
or falls inside another external location's URL, with
`Cannot accept an external location that duplicates or overlaps with existing external location`.
Use one location per prefix that has its own storage role.

**Required privileges:** ownership of the metastore; or `CREATE EXTERNAL
LOCATION` on the metastore plus ownership of, or `CREATE EXTERNAL LOCATION` on,
the storage credential.

## Check that the server vends credentials

Ask for temporary credentials on a path under the location. A successful
response proves the whole chain: the server's identity, the trust policy, the
external ID, and the storage role's access.

:::tab[Python SDK]
The example writes and lists a file with the vended keys:

```python file=./snippets/aws_storage.py start=start:verify end=end:verify
```
:::

:::tab[CLI]
The `uc` CLI has no command for this, so call the REST API:

```bash file=./snippets/aws_storage.sh start=start:verify end=end:verify
```

To use the keys with the AWS CLI, export `access_key_id`, `secret_access_key`,
and `session_token` as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
`AWS_SESSION_TOKEN`.
:::

The credentials reach only the requested path. A write to
`s3://uc-docs/lake/curated` with keys vended for `s3://uc-docs/lake/landing` is
denied. If the request fails with `AccessDenied` from STS, check the trust policy
and the external ID first. Tables and volumes use the same mechanism. Their
credential endpoints resolve the object's storage location to its external
location.

**Required privileges:** for a path that no table, volume, or registered model
owns, ownership of the metastore or of the external location, or `READ FILES`
on the location (`PATH_READ`) or both `READ FILES` and `WRITE FILES`
(`PATH_READ_WRITE`). For a path inside a table or volume, the usual privileges
on that object apply instead, such as `SELECT` on a table or `READ VOLUME` on a
volume.

## View storage credentials and external locations

:::tab[Python SDK]
```python file=./snippets/aws_storage.py start=start:view end=end:view
```
:::

:::tab[CLI]
```bash file=./snippets/aws_storage.sh start=start:view end=end:view
```
:::

The CLI's `credential` and `external_location` commands take the flags
`--name`, `--aws_iam_role_arn`, `--url`, `--credential_name`, `--comment`,
`--new_name`, and `--force`. Their `--help` pages don't work in 0.6.0; see
[Known issues in 0.6.0](../../reference/features-and-limitations/index.md#known-issues-in-060).

**Required privileges:** ownership of the metastore, or ownership of (or
`CREATE EXTERNAL LOCATION` on) the credential. For an external location:
ownership, or any of `READ FILES`, `WRITE FILES`, `CREATE EXTERNAL TABLE`,
`CREATE EXTERNAL VOLUME`, and `CREATE MANAGED STORAGE` on it.

## Update a credential or external location

To move a credential to a different storage role, update its role ARN:

:::tab[Python SDK]
```python file=./snippets/aws_storage.py start=start:update-credential end=end:update-credential
```
:::

:::tab[CLI]
```bash file=./snippets/aws_storage.sh start=start:update-credential end=end:update-credential
```
:::

:::warning
Changing the role ARN generates a new `external_id`. Vending fails until the
new storage role's trust policy names the new ID. Update the trust policy right
after the credential. A comment or name change keeps the ID.
:::

Update an external location's comment, name, credential, or URL the same way:

:::tab[Python SDK]
```python file=./snippets/aws_storage.py start=start:update-location end=end:update-location
```
:::

:::tab[CLI]
```bash file=./snippets/aws_storage.sh start=start:update-location end=end:update-location
```
:::

:::warning
In 0.6.0 the server doesn't check what lives under a location before it accepts
a new URL. Tables, volumes, and managed storage roots under the old URL lose
their credential, and vending for them fails with `FAILED_PRECONDITION`. Before
you change a URL, create the new location alongside the old one if the
prefixes don't overlap, and move the data first.
:::

**Required privileges:** for a credential, ownership of it or of the metastore.
For an external location, ownership of the metastore, or ownership of the
location plus ownership of (or `CREATE EXTERNAL LOCATION` on) any new
credential.

## Delete an external location and credential

Delete the location first, then the credential:

:::tab[Python SDK]
```python file=./snippets/aws_storage.py start=start:delete end=end:delete
```
:::

:::tab[CLI]
```bash file=./snippets/aws_storage.sh start=start:delete end=end:delete
```
:::

An external location can't be deleted while a table, volume, or registered
model is stored under it. Catalog and schema storage roots don't count. A
credential can't be deleted while an external location uses it. `force` skips
these checks. Deleting either object removes only the catalog entry. The data
in S3 and the IAM roles stay.

:::danger
Always delete the location before its credential. Force-deleting a credential
that a location still uses breaks every list of external locations; see
[Known issues in 0.6.0](../../reference/features-and-limitations/index.md#known-issues-in-060) to recover.
:::

**Required privileges:** ownership of the object or of the metastore.

## Next steps

- [Set managed storage for catalogs and schemas on S3](../managed-storage-s3/index.md)
  to put managed tables and volumes under this external location.
- [Configure Spark to use Unity Catalog](../configure-spark/index.md): Spark
  needs `hadoop-aws` on the classpath to use vended S3 credentials.
- [Create and manage volumes](../manage-volumes/index.md) with `s3://` locations
  under the external location.
