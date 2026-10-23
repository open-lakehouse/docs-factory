# Compatibility journeys

What readers set out to do with the lakehouse, defined once for the estate
([ADR-0009](../adr/ADR-0009-journeys-as-path-patterns.md)). A journey is one
task on one asset kind through one path, such as "append to a managed table".
Scripts on the docs pages claim whether an engine or client does it, and each
project's `content/<project>/compatibility.yml` arranges journeys into the
tables its pages embed. `uv run docsnip compat --fix` renders them, and
`docsnip check` validates every id here against `../dist/model.json`. The
authoring contract is `content/README.md`, "Compatibility claims"; the design
is [`docs/design/journey-graph.md`](../../docs/design/journey-graph.md).

```
paths.yml         how participants reach the asset: the contract each role needs
interfaces.yml    one engine or client through one language binding (the columns)
journeys/*.yml    the journeys, one file per area; an id is unique across files
evidence.yml      cells no script here proves, each with its source
aliases.yml       renamed journey ids → current ids
```

| Path | Participants need |
| --- | --- |
| `by-path` | a client that implements Delta Lake |
| `uc-api` | a Unity Catalog API client and server |
| `uc-external` | `uc-api`, and a client that implements Delta Lake |
| `uc-managed` | `uc-external`, with both sides on the Unity Catalog Delta API |
| `iceberg-rest-api` | an Iceberg REST client and catalog |
| `iceberg-rest` | `iceberg-rest-api`, and a client that implements Apache Iceberg |

A journey's own `roles` add a participant or a contract to its path's: a read
with vended S3 credentials adds a `storage` role. Before adding a journey,
look for one that covers the task on the same path in any file here. The
model checks the paths; it never creates a journey or a passing cell.
