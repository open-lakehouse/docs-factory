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
downstream projects.

- [`olai-codegen`][olai-codegen]: Generate server and client code based on annotated protobuf
  definitions. Can generate unity-catalog like rest services with flattened resource hierarchies.
- [`olai-http`][olai-http]: http client with build in authorization for the major clouds
  and Databricks Universal Auth.
- [`olai-http-wasm`][olai-http-wasm]: a wasm compatible client with `olai-http` compatible APIs.
- [`olai-stack-topology`][olai-stack-topology]:
- [`olai-trestle`][olai-trestle]:

## Mangrove

The mangrove project serves to explore and incubate integrations and a client
ecosystem around Unity Catalog. It heavily relies on deterministic code generation
from protobuf files and agentic coding. The [trestle](#trestle) project, specifically
the code generation piece, was carved out of mangrove. Specifically we maintain
a protobuf specification compliant with the OSS API definitions, but extending
these with additional resources.

## Headwaters

## Breakwater

[olai-codegen]: https://crates.io/crates/olai-codegen
[olai-http]: https://crates.io/crates/olai-http
[olai-http-wasm]: https://crates.io/crates/olai-http-wasm
[olai-stack-topology]: https://crates.io/crates/olai-stack-topology
[olai-trestle]: https://crates.io/crates/olai-trestle
