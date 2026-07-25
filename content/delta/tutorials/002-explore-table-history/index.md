---
title: Explore a Delta table's history
summary: Walk a Delta table's version history end to end — open it, read the commit log, and time-travel to an earlier version.
diataxis: tutorial
project: delta
delta_features: [time-travel]
prerequisites:
  packages:
    python: [deltalake, docs-factory-seed]
  datasets: [orders]
references:
  - deltaSpec
  - deltaRs
status: draft
---

Every write to a [Delta Lake](model:deltaSpec) table appends a commit to its
transaction log, and Delta keeps the whole history. That means you can see how a
table changed over time and read it exactly as it was at any past version — a
feature called **time travel**.

This tutorial walks that history end to end against the `orders` sample table,
using [delta-rs](model:deltaRs) (the `deltalake` Python package). Every step
below pulls its code from a single runnable file our CI executes, so what you
copy is what we test.

::::journey

### Open the table

Point `DeltaTable` at the table's path. It reads the latest version of the
transaction log and reports which version that is.

```python file=./snippets/explore_delta_history.py start=start:open end=end:open
```

:::note
`seed_dataset("orders")` (outside the shown region) bootstraps a deterministic
two-commit table so this tutorial is reproducible — the same one-liner CI uses.
:::

### Inspect the commit history

`history()` returns the commits newest-first. Each entry records the operation
that produced the version (`WRITE`, `DELETE`, `MERGE`, …) so you can see the
shape of how the table evolved.

```python file=./snippets/explore_delta_history.py start=start:history end=end:history
```

### Time-travel to an earlier version

Pass `version=` to open the table as of a specific commit. Here we open both the
first commit and the latest, then compare their row counts — the `orders` table
starts at 1000 rows and a later commit deletes 50.

```python file=./snippets/explore_delta_history.py start=start:time-travel end=end:time-travel
```

:::tip
You can also travel by wall-clock time instead of version number — useful for
"read the table as it was last Monday" style queries.
:::

::::

## Related

- [Read a Delta table](../../how-to/read-a-delta-table/index.md) — the basics.
- [Query a Delta table as of a version](../../how-to/query-a-table-as-of-version/index.md) — the time-travel how-to on its own.
