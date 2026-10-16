---
title: The Observable Lakehouse
slug: observable-lakehouse
status: idea
tags: [lakehouse, observability, data-lineage]
series: The Composable Lakehouse
series_order: 5
author: Robert Pack
---

**Thesis:** you can't govern what you can't see. Traces tell you what the
system did; lineage tells you what happened to the data. Both span every brick,
so they belong to the platform, not to any one engine.

## Scope

- Two different questions: tracing ("which services handled this request, and
  how long did each take?") vs. lineage ("which tables and columns did this
  output come from?").
- Tracing: OTLP as the seam, jaeger as one backend. Be honest that a trace
  backend doesn't instrument every service on its own (the model marks it as a
  *partial* contribution).
- Lineage at planning time: headwaters captures dataset- and column-level
  OpenLineage while planning on DataFusion, so lineage exists before the job
  runs and doesn't depend on parsing logs afterwards.
- Concerns, not layers: observability and lineage are modeled as concerns that
  span capabilities. Why that modeling choice matters.
- Tie-in with governance: audit = identity (previous post) + trace + lineage.

## Trestle configuration

- Previous stack + `jaeger` (`tracing`) + `headwaters` (`lineage`).
- Demo: one query → its trace through gateway / catalog / engine → the column
  lineage graph it produced.

## Model hooks

- `lakehouse.observability`, `lakehouse.lineage` concerns; `jaeger`,
  `headwaters` implementations; `otlpSpec`, `openLineageSpec`.

## Open questions

- headwaters' release status: disclose it as pre-release if it's still
  unpublished when we draft (CONVENTIONS §6).
- Fold in MLflow tracing here or save it for *Interactive* / *Agentic*?

**Prev:** *The Trusted Lakehouse* · **Next:** *The Interoperable Lakehouse*
