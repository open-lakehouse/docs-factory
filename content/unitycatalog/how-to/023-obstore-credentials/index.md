---
title: Use Unity Catalog credentials with obstore
summary: Give obstore a credential provider that asks Unity Catalog for S3 credentials, works from sync and async code, and renews them before they expire.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - lakehouse.credentialIssuer
  - obstore
  - s3Spec
status: draft
---

[obstore](model:obstore) reads and writes object storage from Python. Instead
of fixed keys, you can give it a credential provider: a function obstore calls
for credentials, and calls again when they're about to expire. A provider that
asks [Unity Catalog](model:unityCatalogServer) for temporary credentials gives
your code a store scoped to one volume or table. It never handles a
long-lived key.

:::prerequisites
- A storage credential and an external location over the data:
  [Configure AWS storage credentials and external locations](../configure-aws-storage/index.md).
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
:::

The examples use a catalog `analytics` with an S3 storage root. Its schema
`ops` holds a managed volume `files` and an external table `trips`.

## Set up the client

Start Python with the SDK and obstore:

```bash
uv run --with unitycatalog-client==0.7.0 --with obstore==0.11.1 python -m asyncio
```

```python file=./snippets/obstore_credentials.py start=start:connect end=end:connect
```

## Write the credential provider

obstore accepts a sync or an async provider, but it can call an async one only
from its async methods. A sync method such as `obstore.list` or `obstore.put`
that needs credentials from an async provider fails with `no running event
loop` in a thread without an event loop, and hangs in a thread that runs
one. The Unity Catalog SDK is async, so a provider that serves both kinds
of call runs the SDK on an event loop of its own:

```python file=./snippets/obstore_credentials.py start=start:provider end=end:provider
```

The provider takes a `request` function, so the same class serves a volume
and a table. It asks the server once when you create it, which gives the
store its URL and fails early if you lack a grant. obstore's first call gets
that answer instead of a second request.

## Open a volume

Write a `request` function that looks up the volume and asks for
`WRITE_VOLUME`, or `READ_VOLUME` to only read. Then open an `S3Store` at the
URL the server returned:

```python file=./snippets/obstore_credentials.py start=start:volume end=end:volume
```

Sync calls work on the store:

```python file=./snippets/obstore_credentials.py start=start:sync end=end:sync
```

So do async calls:

```python file=./snippets/obstore_credentials.py start=start:async end=end:async
```

**Required privileges:** `USE CATALOG` and `USE SCHEMA` on the parents, plus
`READ VOLUME` to read. Writing needs ownership of the volume. For the other
objects, see
[Request temporary storage credentials](../temporary-credentials/index.md).

A volume or table on `file://` storage gets no keys from the server, so the
provider has nothing to return. Open its URL with obstore's `from_url` and no
credentials instead, as
[Read files from a volume](../../tutorials/read-volume-files/index.md) does.

## Open a table's files

For a table, the `request` function asks for table credentials. A `READ`
credential lists and reads the table's files, and S3 rejects its writes:

```python file=./snippets/obstore_credentials.py start=start:table end=end:table
```

To read the table as a table rather than as files, use an engine or a
DataFrame library: see
[Query Unity Catalog tables from Python DataFrame libraries](../python-dataframes/index.md).

## How obstore renews the credentials

obstore caches the credential and calls the provider again once less than five
minutes are left before `expires_at`. The server's S3 credentials last an
hour, so a long-running store asks again about every 55 minutes, and
operations in between reuse the cached credential. Each renewal is a new
request, so the server checks your grants again then.

## Close the provider

When you're done, close the provider's connection to the server:

```python file=./snippets/obstore_credentials.py start=start:close end=end:close
```

## Next steps

- [Use volumes as marimo remote storage](../marimo-remote-storage/index.md)
  to browse a volume through this provider in a notebook.
- [Request temporary storage credentials](../temporary-credentials/index.md)
  for every kind of object and operation, with their privileges.
- Learn how the server decides and mints a credential in
  [Credential vending](../../explanation/credential-vending/index.md).
