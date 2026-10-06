---
title: Working with volumes and files
summary: Register a folder of documents as a Unity Catalog volume, then find it by name, ask the catalog for access, and read the files with obstore.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogOSS
  - lakehouse.catalog
status: ready
---

In this tutorial you register a folder of documents as a Unity Catalog
*volume*, then read those files the way any other application would, knowing
only the volume's name. On the way you see the three steps every volume reader
takes: look up where the files live, ask the catalog for access, and open them
with a storage library.

It takes about ten minutes.

:::prerequisites
- [uv](https://docs.astral.sh/uv/).
:::

::::journey

### Open a Python session

Start the environment under **Prerequisites** if it isn't already running
from an earlier tutorial. Then open a Python session with the
Unity Catalog client and [obstore](https://developmentseed.org/obstore/), a
Python library for object storage and local files:

```bash
uv run --with unitycatalog-client==0.6.0 --with obstore==0.11.1 python -m asyncio
```

`python -m asyncio` is a Python shell that accepts `await` at the top level,
which the asynchronous client needs. Enter each of the following snippets in
it, in order.

### Connect to the server

```python file=./snippets/volume_files.py start=start:connect end=end:connect
```

Authorization is off on the local server, so the client needs no token.

### Put some files in a folder

Write three short policy documents into a folder. In a real setup these files
already exist, in cloud storage or on a shared file system:

```python file=./snippets/volume_files.py start=start:write-files end=end:write-files
```

### Register the folder as a volume

Create a catalog and a schema, then an *external* volume that points at the
folder:

```python file=./snippets/volume_files.py start=start:register end=end:register
```

The server only records the location. It neither copies nor checks the files,
which is why the folder doesn't have to be visible inside the server's
container. From now on, the files have a governed name:
`support.knowledge.policies`.

### Find the volume by name

Now switch roles. You are an application that knows only the name. Ask the
catalog for the volume:

```python file=./snippets/volume_files.py start=start:find end=end:find
```

The output shows `support.knowledge.policies EXTERNAL` and the folder's
`file://` location.

### Ask for access

Before reading, request temporary credentials for the volume, naming what you
want to do with it:

```python file=./snippets/volume_files.py start=start:credentials end=end:credentials
```

This is the request the catalog can refuse. With authorization enabled, the
server answers only if you may use the catalog and schema (`USE CATALOG`,
`USE SCHEMA`) and read the volume (`READ VOLUME`), or own them. On S3, ADLS,
or GCS the answer holds short-lived keys that work only for this volume's
location, plus their expiry. That process is called
[credential vending](../../explanation/credential-vending/index.md). Local files
need no keys, so here the answer carries only the location and both values
print as `None`.

### Open the volume's storage

Define a small function that turns the answer into a storage client:

```python file=./snippets/volume_files.py start=start:open-store end=end:open-store
```

With vended AWS keys, the function passes them to obstore. Otherwise it opens
the location directly. Your reading code stays the same either way.

### Read the files

List the volume's files and read each one:

```python file=./snippets/volume_files.py start=start:read end=end:read
```

The output shows the three documents and their sizes:

```text
returns.md (50 bytes): Items can be returned within 30 days of delivery.
shipping.md (38 bytes): Orders ship within two business days.
warranty.md (39 bytes): Electronics carry a one-year warranty.
```

### Clean up

Delete the catalog, and with it the schema and the volume:

```python file=./snippets/volume_files.py start=start:clean-up end=end:clean-up
```

Deleting an external volume removes only the catalog's record. The folder and
its files stay where they are, so the last line lists all three. Leave the
session with `Ctrl+D`.

::::

## What you did

You gave a folder of files a governed name. Then, as a reader that knew only the
name, you asked Unity Catalog where the files are and for permission to read
them. Finally, you read them directly from storage. The catalog never served a
byte of the files. It handed out the location and the permission, and the data
came straight from storage.

## Next steps

- [Create and manage volumes](../../how-to/manage-volumes/index.md) covers
  managed volumes, renaming, and what deleting each kind does to its files.
- [Credential vending](../../explanation/credential-vending/index.md) explains
  the trust boundary behind the access request.
