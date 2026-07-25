---
title: Read a Delta table
summary: Load a Delta table into a dataframe with the deltalake Python package.
diataxis: how-to
project: delta
delta_features: []
prerequisites:
  packages:
    python: [deltalake, pandas]
  datasets: [orders]
references:
  - deltaSpec
  - deltaRs
status: ready
---

Reading a Delta table means loading its current version into an in-memory
dataframe. [Delta Lake](model:deltaSpec) is an open table format; this guide
uses [delta-rs](model:deltaRs) via its `deltalake` Python package.

The example reads the `orders` sample table. To create it locally, first
bootstrap the data (this is the same table our CI reads):

```console
pip install docs-factory-seed
docs-factory-seed orders   # prints the table path
```

```python file=./snippets/read_delta_table.py start=start:read-delta-table end=end:read-delta-table
```

## Related

- [Query a Delta table as of a version](../query-a-table-as-of-version/index.md) — read historical versions.
- [What is Delta Lake?](../../explanation/what-is-delta-lake.md) — the concepts behind the format.
