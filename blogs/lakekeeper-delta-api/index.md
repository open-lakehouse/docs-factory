---
title: First Class Delta Support in Lakekeeper
slug: lakekeeper-delta-api
status: idea
tags: [delta-lake, delta-kernel, table-formats, rust]
author: Robert Pack
target: delta
---

:::tldr
* Lakekeeper supports Delta Lake as first class citizens via the UC Delta APIs
* A new Rust crate to isolate Delta logic and request only base capabilities
* Supports all existing Delta clients with UC Delta API support
:::

The Lakehouse is making great strides towards a harmonized ecosystem.

## Design

Whenever specs are involved, we do need to take extra care on how we want to approach ecosystem
fragmentation.
