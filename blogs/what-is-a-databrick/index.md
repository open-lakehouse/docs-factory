---
title: What is a Databrick?
slug: what-is-a-databrick
status: idea
tags: [lakehouse, table-formats, unity-catalog]
series: The Composable Lakehouse
series_order: 1
author: Robert Pack
target: openlakehouse
---

When joining Databricks, a common question comes up: What is a Databrick?

Before answering that question, we want to examine to in my mind closely related movements
in the data architecture space - the [lakehouse architecture] and [composable systems].
From a higher level both of these argue for a similar approach to how we should be designing
systems. Composable systems look at at the layers of data-systems or query engines
and define intermediate representations (IR) for data, query, plans etc. that allow
composing systems from existing modules, isolating any desired customization where it matters.
A key premise of the lakehouse architecture is the separation of storage and compute. More
recently we see that catalogs have emerged as another component that used to once be contained
inside a data warehouse is hoisted to a platform layer. 

[lakehouse architecture]: https://www.cidrdb.org/cidr2021/papers/cidr2021_paper17.pdf
[composable systems]: https://www.vldb.org/pvldb/vol16/p2679-pedreira.pdf

## Scope (idea notes)

**Thesis:** a lakehouse isn't a product, it's a set of capabilities with open
interfaces between them. A "databrick" is one of those capabilities, and once
you can name the seams you can swap any brick.

- Two movements that argue the same thing:
  - Lakehouse (CIDR '21): warehouse-grade management on open formats in object
    storage, with storage and compute separated.
  - Composable data systems (VLDB '23): engines decompose into layers joined by
    intermediate representations (Arrow, Substrait, plan IRs), so you customize
    only the layer that matters.
- The catalog leaves the warehouse: after storage and compute split, the catalog
  becomes its own platform layer (Unity Catalog, Iceberg REST), and governance
  moves with it.
- Open specs and IRs are the seams: table format (Delta, Iceberg), file format
  (Parquet), catalog API, policy (Cedar), lineage (OpenLineage), traces (OTLP).
- The capability chain from the reference model: query engine → catalog → table
  format → object storage, with governance and lineage applied at planning time.
- Our stance: assemble, don't buy. Open foundations plus the glue they don't
  ship (see `blogs/STORYLINE.md`).
- Why it matters now: agents are a new kind of principal and workload, so the
  platform has to compose and govern by default instead of per tool.

**Model hooks:** `lakehouse` and its capabilities
(`architecture/design/reference-architecture.md`); the logical-vs-deployment
split (ADR-0003) as "the same bricks at two levels of detail".

**Highlight:** one diagram of the abstract capability chain, which every later
post fills in with concrete modules.

**Series map:** introduce the posts that follow. Each one is a Trestle
configuration that adds bricks to the same stack: Composable → Governed →
Observable → Interoperable → Portable → Interactive → Agentic.

**Open questions:**
- How hard to lean into the "databrick" pun vs. a straight architecture opener.
- Does it carry its own small runnable stack, or stay conceptual and hand the
  first `trestle env` to *The Composable Lakehouse*?

**Next:** *The Composable Lakehouse* (`blogs/composable-lakehouse/`).
