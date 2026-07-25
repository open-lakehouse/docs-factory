---
title: Open Lakehouse reference architectures
summary: The metadata authority of the lakehouse
diataxis: explanation
project: open-lakehouse
status: idea
explains: lakehouse.catalog
---

## Trestle

The trestle project sets up the journey towards an end-to-end OpenLakehouse stack.
it covers opinionated build tooling and low level crates that are used throughout
downstream projects.

- [`olai-codegen`][olai-codegen]: Generate server and client code based on annotated protobuf definitions.
  Can generate unity-catalog like rest services with flattened resource hierarchies.
- [`olai-http`][olai-http]: http client with build in authorization for the major clouds
  and Databricks Universal Auth.
- [`olai-http-wasm`][olai-http-wasm]: a wasm compatible client with `olai-http` compatible APIs.

## Mangrove

## Headwaters

## Breakwater

[olai-codegen]: https://crates.io/crates/olai-codegen
[olai-http]: https://crates.io/crates/olai-http
[olai-http-wasm]: https://crates.io/crates/olai-http-wasm
