---
title: Use Unity Catalog credentials with obstore
summary: Give obstore a credential provider that asks Unity Catalog for S3, Azure, or Google Cloud credentials, works from sync and async code, and renews them before they expire.
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
your code a store scoped to one volume, table, or path. It never handles a
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

The provider returns the credential in the shape obstore expects for the
storage the server answers for: S3 keys, an Azure SAS token, or a Google
Cloud OAuth token. It asks the server once when you create it, which gives
the store its URL and fails early if you lack a grant. obstore's first call
gets that answer instead of a second request.

`for_volume`, `for_table`, and `for_path` build the request for you. For any
other request, pass the constructor an async function that takes the
`ApiClient` and returns the server's answer.

## Open a volume

Ask for `WRITE_VOLUME` on the volume, or `READ_VOLUME` to only read. Then
open a store at the URL the server returned. `from_url` picks the store from
the URL's scheme; `region` applies to S3 only:

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

For a table, ask for `READ` or `READ_WRITE`. A `READ` credential lists and
reads the table's files, and storage rejects its writes:

```python file=./snippets/obstore_credentials.py start=start:table end=end:table
```

To read the table as a table rather than as files, use an engine or a
DataFrame library: see
[Query Unity Catalog tables from Python DataFrame libraries](../python-dataframes/index.md).

## Open a path

For a storage path no table or volume owns, such as a landing prefix under
an external location, ask for `PATH_READ` or `PATH_READ_WRITE`:

```python file=./snippets/obstore_credentials.py start=start:path end=end:path
```

## How obstore renews the credentials

obstore caches the credential and calls the provider again once less than five
minutes are left before `expires_at`. The server sets the lifetime, and
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
