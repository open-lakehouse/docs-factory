---
title: Query a Delta table as of a version
summary: Use Delta time travel to read a historical version of a table.
diataxis: how-to
project: delta
engines: [python]
delta_features: [time-travel]
prerequisites:
  packages:
    python: [deltalake, docs-factory-seed]
  datasets: [orders]
snippets:
  - file: ../../../examples/python/time_travel_read.py
    start: docs-time-travel-read-start
    end: docs-time-travel-read-end
    engine: python
status: published
---

Every write to a Delta table produces a new **version**. Delta keeps the history,
so you can read the table exactly as it was at an earlier version — this is
called **time travel**. It's useful for reproducing a report, auditing a change,
or rolling back.

The snippet below reads a table that already has history. The first line seeds
that history so the example runs as shown — the same one-liner our CI uses, so
what you copy is what we test.

## Python (deltalake)

```python file=../../../examples/python/time_travel_read.py start=docs-time-travel-read-start end=docs-time-travel-read-end
```

`DeltaTable(path, version=0)` opens the first commit; omitting `version` opens the
latest. You can also travel by timestamp with `DeltaTable(path, ...)` options.

## Related

- [Read a Delta table](./read-a-delta-table.md) — the basics, across engines.
- [Table features](../reference/table-features.md) — how Delta versions its protocol.
