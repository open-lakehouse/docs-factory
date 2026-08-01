---
title: What is a Databrick?
slug: what-is-a-databrick
status: idea
tags: [lakehouse]
series: Building the Open Lakehouse
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
