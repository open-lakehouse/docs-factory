---
title: Table features
summary: The reader/writer feature-flag mechanism that governs Delta compatibility.
diataxis: reference
project: delta
delta_features: [table-features]
status: draft
---

> **Draft stub.** Reference content is language-agnostic. This page will document
> the table-features mechanism precisely; the authoritative facts and per-engine
> support live in the research matrix at `research/table-formats/delta-matrix.json`
> and may later be rendered here directly.

Delta replaced continuous integer protocol versioning with a discrete
**table-features** scheme anchored at reader version 3 / writer version 7. A
client may read a table only if the table's `readerFeatures` are a subset of what
the client supports, and write only if `writerFeatures` are a subset.

| Field | Values |
|-------|--------|
| `minReaderVersion` | 1, 2, 3 |
| `minWriterVersion` | 2–7 |

See [Query a Delta table as of a version](../how-to/query-a-table-as-of-version/index.md)
for a feature (time travel) in action.
