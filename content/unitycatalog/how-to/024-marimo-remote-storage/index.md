---
title: Use volumes as marimo remote storage
summary: Open a Unity Catalog volume as an obstore store in a marimo notebook, so its files show in the Remote Storage panel and cells read them with vended credentials.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - lakehouse.volume
  - marimo
  - obstore
status: draft
---

[marimo](model:marimo) shows any [obstore](model:obstore) store a notebook
defines in its
[Remote Storage panel](https://docs.marimo.io/guides/working_with_data/remote_storage/),
where you browse and download the store's files. Open a
[volume](model:lakehouse.volume) as an obstore store whose credentials come
from [Unity Catalog](model:unityCatalogServer), and the panel and your cells
read the volume with credentials scoped to it. No storage keys go in the
notebook.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- A volume on S3 storage that you can read. The examples use
  `analytics.ops.files`, which holds `reports/2026-10.csv`.
:::

## Open a notebook

Start marimo with the SDK and obstore:
`uv run --with unitycatalog-client==0.7.0 --with obstore==0.11.1 --with marimo==0.25.1 marimo edit notebook.py`.

In the first cell, import the clients and point the configuration at your
server:

```python file=./snippets/notebook.py start=start:nb-connect end=end:nb-connect
```

## Add the credential provider

The Remote Storage panel lists files with obstore's sync methods and
downloads them with its async ones, so the store needs a provider that serves
both. In a cell, define the provider from
[Use Unity Catalog credentials with obstore](../obstore-credentials/index.md):

```python file=./snippets/notebook.py start=start:nb-provider end=end:nb-provider
```

A provider that is only an async function fails in the panel as soon as
obstore needs a new credential.

## Open the volume

In a new cell, ask for read credentials on the volume and open a store on its
storage location:

```python file=./snippets/notebook.py start=start:nb-store end=end:nb-store
```

When the cell runs, `files` appears under **Remote Storage** in the **Files**
panel. Expand it to browse the volume's files, and download one from its
menu.

`READ_VOLUME` lets the store list and read, and S3 rejects its writes. To
write from cells, ask for `WRITE_VOLUME`, which needs ownership of the volume.

## Read a file in a cell

Cells read through the same store:

```python file=./snippets/notebook.py start=start:nb-read end=end:nb-read
```

obstore renews the credential once less than five minutes are left, so the
store keeps working while the notebook stays open. Each renewal asks the
server again, so a revoked grant stops it.

## Next steps

- [Use Unity Catalog credentials with obstore](../obstore-credentials/index.md)
  to open table files and see how the provider renews credentials.
- [Manage volumes](../manage-volumes/index.md) to create the volume and grant
  `READ VOLUME`.
- [Call a function in a marimo notebook](../run-functions/index.md#call-a-function-in-a-marimo-notebook)
  to run catalog functions from the same notebook.
