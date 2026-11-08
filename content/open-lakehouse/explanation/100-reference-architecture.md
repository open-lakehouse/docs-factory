---
title: Open Lakehouse reference architectures
summary: |
  An opinionated reference architecture and implementation of a composable Lakehouse platform.
diataxis: explanation
project: open-lakehouse
status: idea
---

## Trestle

The trestle project sets up the journey towards an end-to-end OpenLakehouse stack.
it covers opinionated build tooling and low level crates that are used throughout
downstream projects: code generation from annotated protobuf, the runtime crates
generated services link, and the tooling that plans and runs local lakehouse
environments. See [what Trestle generates](./what-trestle-generates.md) and the
[crate map](../reference/trestle-crate-map.md).

## Mangrove

The mangrove project serves to explore and incubate integrations and a client
ecosystem around Unity Catalog. It heavily relies on deterministic code generation
from protobuf files and agentic coding. The [trestle](#trestle) project, specifically
the code generation piece, was carved out of mangrove. Specifically we maintain
a protobuf specification compliant with the OSS API definitions, but extending
these with additional resources.

## Headwaters

## Breakwater
