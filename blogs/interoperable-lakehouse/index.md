---
title: The Interoperable Lakehouse
slug: interoperable-lakehouse
status: idea
tags: [lakehouse, delta-lake, iceberg, table-formats]
series: The Composable Lakehouse
series_order: 6
author: Robert Pack
---

_Adjective still open._

**Thesis:** open formats only pay off if more than one engine can actually use
them. The catalog is where Delta and Iceberg, and Spark, DuckDB, and graph
engines, meet the same governed tables.

## Scope

- Delta and Iceberg as peer table formats, with neither privileged in the model.
- One catalog, two protocols: UC serves its native API and Iceberg REST.
  Who reads what, and what still doesn't work (UniForm, write paths).
- Many engines on one table: `sql_engine`, `graph` (PuppyGraph reading Delta),
  Spark / DuckDB / PyIceberg from the tracked compatibility journeys.
- The compatibility matrix as evidence: every claim backed by a CI-tested
  script (`content/<project>/compatibility.yml`).

## Trestle configuration

- Previous stack + an engine role (`sql_engine` and/or `puppygraph` as
  `graph`); UC with Iceberg REST enabled.
- Demo: write with one engine, read with two others, through the same catalog.

## Model hooks

- `deltaSpec`, `icebergSpec`, `icebergRestSpec`; `lakehouse.queryEngine`;
  journeys joined to the model (convergence plan §5).

## Cross-links

- *UC Iceberg REST* (`blogs/uc-iceberg-rest/`) has the details; this post only
  places it in the stack.

**Prev:** *The Observable Lakehouse* · **Next:** *The Portable Lakehouse*
