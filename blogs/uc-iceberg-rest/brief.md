---
title: One catalog, both formats, any engine
slug: uc-iceberg-rest
status: draft
tags: [unity-catalog, iceberg, apache-spark, table-formats]
series:
series_order:
author: Robert Pack
target: unitycatalog
---

## 1. Hook / thesis

Unity Catalog 0.7 lets any Iceberg REST client create and write Iceberg tables,
so the format war stops being a catalog decision: one catalog governs Delta and
Iceberg side by side, and four engines can pass one table around without
anyone holding a bucket key.

## 2. Audience

- Data and platform engineers who know Spark and have heard of Iceberg REST, and
  who run (or are choosing) a catalog for a mixed-engine lakehouse.
- Assumes: what a table format is, what a catalog does, basic Spark SQL. Not
  assumed: the Iceberg REST protocol's details, UC's managed storage model.

## 3. Tone / voice

First person, practical, mildly opinionated: "pick the engine per job, not the
catalog per format". Show, don't pitch; be honest about the rough edges found
while building the example (DuckDB's metadata-log quirk, UniForm not reachable
from this Spark tuple).

## 4. Key takeaways

- UC 0.7 serves Iceberg REST at `/api/2.1/unity-catalog/iceberg`; native Iceberg
  tables are on by default and are managed tables under the catalog's storage root.
- Warehouse = UC catalog, namespace = UC schema; the same privileges and the same
  vended, table-scoped S3 credentials apply.
- Spark, DuckDB, and PyIceberg each create, write, update, and read the same table;
  the server's commit checks keep their writes from trampling each other.
- One Spark session joins a Delta table (UC connector) with an Iceberg table
  (Iceberg REST) from the same catalog.

## 5. Outline

1. Intro + TL;DR — answer-first: what shipped, and why it matters.
2. Why a catalog shouldn't pick your format — the stance; short.
3. How Iceberg REST maps onto Unity Catalog — the three settings; managed storage;
   vended credentials (one small table).
4. The round trip (`::::journey`, code in each step):
   1. Give the catalog storage (setup snippet).
   2. Spark creates a Delta table and an Iceberg table (session + write).
   3. DuckDB appends and updates (attach + change).
   4. PyIceberg reads it into pandas and lists the snapshots by engine (read).
   5. Spark joins Delta and Iceberg (join).
5. Rough edges — DuckDB metadata-log setting; endpoint variables only for the
   simulated S3; UniForm not readable yet from this Spark tuple.
6. What we learned + CTA — link to the H47 how-to.

## 6. Source material

- *Code (cross-repo):*
  - unitycatalog · `server/src/main/java/io/unitycatalog/server/service/IcebergRestCatalogService.java` · v0.7.0 — config (prefix = catalog), namespaces, tables, `loadCredentials`, drop semantics.
  - unitycatalog · `server/src/main/java/io/unitycatalog/server/utils/ServerProperties.java` · v0.7.0 — `server.iceberg-table.enabled` defaults to true (#1943).
  - unitycatalog · `connectors/spark/src/test/scala-shims/spark-4.0-4.1/io/unitycatalog/spark/DeltaIcebergCrossFormatJoinTest.java` · v0.7.0 — the mixed-catalog Spark session.
  - docs-factory · `content/unitycatalog/how-to/012-iceberg-rest/` — H47, the tested how-to this post points to.
- *Prior art:* `blogs/unity-catalog-delta-api/` (the Delta side of the same catalog);
  `blogs/uc-metric-views/` (shape and register). The upstream UniForm guide
  (`docs/usage/tables/uniform.md` at v0.7.0) covers read-only UniForm access; this
  post covers native Iceberg writes.
- *External refs:* the [v0.7.0 release notes](https://github.com/unitycatalog/unitycatalog/releases/tag/v0.7.0);
  the Iceberg REST catalog spec at `apache-iceberg-1.11.0`; DuckDB's
  [Iceberg REST catalog docs](https://duckdb.org/docs/stable/core_extensions/iceberg/iceberg_rest_catalogs).

## 7. Call to action

Run the round trip against the docs' local environment, then read
[Use Iceberg REST clients with Unity Catalog](../../content/unitycatalog/how-to/012-iceberg-rest/index.md)
for every operation per client.

## 8. Publishing target / format

unitycatalog.io blog via `/blog-emit unitycatalog`. No `:::tab` (docs-only).
~1,200–1,500 words. Snippets in `snippets/`, PEP 723, pinned.

## 9. Verification / accuracy notes

- All five snippets ran in order on 2026-10-14 against `unitycatalog/unitycatalog:v0.7.0`
  on the docs' `compose.aws.yaml` (aws-sim), with pyspark 4.1.0, iceberg 1.11.0,
  delta-spark 4.3.1, hadoop-aws 3.4.2, duckdb 1.5.4, pyiceberg 0.12.0.
- Outputs quoted in the post are copied from that run.
- The aws-sim fixes the run depends on (bucket-region header, `localhost:9000`
  server domain) land in the same PR as H47.

## 10. Open questions / risks

- The docs environment (`/env/uc-docs-env.tar.gz`) must be published before the
  post links to it; until then readers need this repo's `envs/`.
- DuckDB's metadata-log conflict was intermittent and not root-caused; the post
  presents the setting as a workaround, not a diagnosis.
- UniForm: confirm whether a later Delta Spark lets the connector create managed
  UniForm tables before claiming it's blocked in prose beyond "this tuple".
