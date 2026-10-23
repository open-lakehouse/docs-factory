# Table-format compatibility tracking plan

Date: 2026-10-20

Status: Tracking is in place (journeys, evidence, review-app grouping); the
backlog in §5 is the work to implement against.

Scope: Delta table features across the Delta engines, and Apache Iceberg
through **Unity Catalog as its Iceberg REST catalog**. Cross-format concepts
go to the `open-lakehouse` project (§4). Other catalogs as columns are out of
scope (§3).

Companion to [`delta-documentation-plan.md`](./delta-documentation-plan.md)
and [`unitycatalog-documentation-plan.md`](./unitycatalog-documentation-plan.md).

## 1. Why

[icebergmatrix.org][icm] ([source][icm-src]) publishes Iceberg support as
**features × platforms, per format version**. Each cell is keyed
`<platform>:<feature>:v2|v3` and rated `full`, `partial`, `none`, or `unknown`,
with notes, caveats, and links. It tracks 32 features in six categories across
29 engines. A second dataset rates 11 catalogs on IRC spec support, v2 and v3
support, and five openness criteria. Every rating comes from documentation;
none is tested.

Our matrices answer the same questions with CI: a ✓ is a script on a `ready`
page. Before this plan, three things were missing:

1. Delta table features were a hand-written grid in the private coverage
   page, mostly `?`, and outside the coverage counts.
2. Unity Catalog's Iceberg REST API had nine lifecycle journeys and nothing for
   evolution, row-level strategies, format v3, or the endpoints the server
   lacks.
3. Format-neutral concepts (format versions, a Delta↔Iceberg crosswalk, the
   IRC protocol, UniForm) had no home or backlog.

icebergmatrix's **Unity Catalog OSS rows describe 0.6.0**: a read-only IRC that
serves only UniForm tables, with v3 `unknown`. The 0.7.0 server creates,
commits, renames, and drops native Iceberg tables, which our ready H47 page
tests with Spark, DuckDB, and PyIceberg. We don't plan an upstream
correction. Our matrix is the record we keep current.

## 2. How it's tracked

Everything is journeys, as before (`content/README.md`, "Compatibility
claims"); nothing new renders support on its own.

- **`feature:` on a journey** names the spec feature it exercises:
  `{spec, name, since}`. `content/vocab.json` `specFeatures` holds the
  allowed names: Delta protocol feature names (`PROTOCOL.md`'s table, then
  the RFC features), Iceberg format features, and Iceberg REST OpenAPI
  operationIds (from the Iceberg 1.11.0 spec UC's server builds against).
  `delta_features:` frontmatter now takes the same Delta names (closing the
  Delta plan's §12.3).
  Since ADR-0009 P2 these lists are per-spec obligations in
  `architecture/journeys/obligations/`, with roles and versions, and a
  journey's `feature:` is its `covers:` list
  ([`journey-graph.md`](./journey-graph.md) §2.1).
- **The review app groups by it.** `/plan/compat` shows a chip per spec version
  (Delta `reader 3 · writer 7`, Iceberg `v3`, Iceberg REST, …) with its
  answered share, and filters the matrix to it (`?since=`). This is
  icebergmatrix's per-version view, over tested cells.
- **The backlog is the matrix.** A journey nobody has tried renders `—` and
  counts as unknown, so answered share measures progress. Asset rollups on
  ready pages drop rows nothing answers, so tracking a journey never
  publishes a row of dashes.
- **Server gaps are evidence.** What the UC server doesn't implement is
  `missing` (or `fails`) for every client, with the R01 row as its source.
  Those cells are answered from the day they're added.

| Matrix | Tables | Journeys |
| --- | --- | --- |
| `content/delta/compatibility.yml` | `features-read`, `features-write` (embedded in `reference/090-coverage`) | one `.write` per feature, plus a `.read` per reader feature; family `feature` |
| `content/unitycatalog/compatibility.yml` | `iceberg-rest`, `iceberg-evolution`, `iceberg-v3`, `iceberg-catalog` (embedded in `reference/002-clients-and-engines`) | 47 in family `iceberg`; columns Spark, DuckDB, PyIceberg, Polars, Daft |

Baseline at this commit (cells, per table):

| Table | ✓ | ✗ | docs | — |
| --- | --- | --- | --- | --- |
| Delta features-read | 3 | 1 | 8 | 28 |
| Delta features-write | 5 | 4 | 21 | 62 |
| UC iceberg-rest | 32 | 8 | — | 45 |
| UC iceberg-evolution | — | — | — | 65 |
| UC iceberg-v3 | — | — | — | 40 |
| UC iceberg-catalog | — | 25 | — | 20 |

The first Delta ✓ cells come from the UC managed-table tutorial, which now
asserts the six features a managed table enables, the `name` mapping mode,
and row ids. The DuckDB how-to adds DuckDB's catalog-managed read and append,
on a table with column mapping off. Its negative case makes DuckDB's
column-mapping write a ✗: the commit succeeds, but the rows read back as NULL.
Whether DuckDB reads a column-mapped table that Spark wrote is open (backlog
item 1). Deletion vectors and v2 checkpoints are enabled on the tutorial's
table but not exercised: its DELETE drops a whole file, and four commits never
checkpoint.

## 3. icebergmatrix → our journeys

### Features (engine × feature)

| icebergmatrix feature | Our journey |
| --- | --- |
| Position deletes | `iceberg.merge-on-read` |
| Equality deletes | `iceberg.equality-deletes` |
| Merge-on-read / copy-on-write | `iceberg.merge-on-read`, `iceberg.copy-on-write` |
| Schema evolution | `iceberg.schema-evolve` |
| Type promotion | `iceberg.type-promotion` |
| Column default values (v3) | `iceberg.v3-default-values` |
| Table creation | `iceberg.create`, `iceberg.v3-create` |
| Hidden partitioning | `iceberg.hidden-partitioning` |
| Partition evolution | `iceberg.partition-evolve` |
| Multi-argument transforms (v3) | `iceberg.v3-multi-arg-transforms` |
| Time travel / snapshots | `iceberg.time-travel` |
| Table maintenance | `iceberg.maintain` |
| Branching and tagging | `iceberg.branch-tag` |
| Read support | `iceberg.read` |
| Write (INSERT) | `iceberg.append`, `iceberg.overwrite` |
| Write (MERGE/UPDATE/DELETE) | `iceberg.merge`, `iceberg.update`, `iceberg.delete` |
| Catalog integration, REST catalog, Unity Catalog | the whole `iceberg` family: every journey runs through UC's IRC |
| Statistics, Bloom filters and Puffin | `iceberg.statistics` |
| Variant, shredded variant (v3) | `iceberg.v3-variant` |
| Geometry / geo types (v3) | `iceberg.v3-geo` |
| Nanosecond timestamps (v3) | `iceberg.v3-timestamp-ns` |
| Lineage (v3) | `iceberg.v3-row-lineage` |
| Deletion vectors (v3) | `iceberg.v3-deletion-vectors` |
| Unknown type (v3) | not tracked: no reader task |
| AWS Glue, Snowflake Horizon, Google Lakehouse catalogs | out of scope: other catalogs |

### Catalog criteria (catalog × criterion), for UC OSS

| icebergmatrix criterion | Our journeys |
| --- | --- |
| IRC spec support | `iceberg-catalog` and `iceberg-rest` tables, row by row |
| v2 spec support | the lifecycle and evolution tables (UC creates v2 by default) |
| v3 spec support | `iceberg-v3` |
| Serves own tables via IRC | `iceberg.create` … `iceberg.drop` |
| Governance and credential vending | `iceberg.append` (vended), `iceberg.vended-credentials`, UC privilege journeys |
| Multi-engine and multi-cloud | the columns, and the env registry's storage backends |
| Managed offering, R/W foreign tables, federation broker | out of scope: not features of a self-hosted OSS server. Federation gets a journey when UC ships it. |

## 4. Open lakehouse backlog

`content/open-lakehouse/nav.yml` lists the project's pages and these slots.
None of them is Delta- or UC-specific, so each cites both matrices rather than
restating them:

| Id | Page | Draws on |
| --- | --- | --- |
| E03 | *Open table format* (exists, draft): grow it into Delta protocol versions and table features next to Iceberg format versions 1–3 | `feature.since` in both matrices |
| E05 | *The Iceberg REST catalog protocol*: endpoint groups, vended credentials, what a catalog must implement | `iceberg-catalog` |
| E06 | *Interoperating between table formats*: UniForm, IcebergCompatV2, what converts and what doesn't | `iceberg-compat-v2.write`, `iceberg.read-uniform` |
| H02 | *Choose a catalog for Delta and Iceberg tables* | both matrices, the env registry |
| R01 | *Delta and Iceberg feature crosswalk* (`private`, the working record) | each row names the Delta and Iceberg journeys |

The project has no `compatibility.yml` and no emitted site yet. Its pages
link the Delta and UC matrices.

## 5. Backlog, in order

Each item turns `—` cells into ✓ or ✗ with a script on a page that will be
`ready`. Assert failures with their error strings so CI flags new support.

1. **Delta feature reads across engines.** One script: Spark writes a table
   per reader feature (deletion vectors from a partial-file delete,
   v2 checkpoint, timestampNtz, type widening, variant, column mapping);
   deltalake (Python and Rust) and DuckDB read each. This settles most of
   `features-read` (coverage open check 4). Default lane plus the Spark lane;
   no server.
2. **Iceberg evolution on UC.** Spark on `envs/uc-aws`: schema and partition
   evolution, sort order, time travel, branches and tags, metadata tables,
   maintenance procedures, merge-on-read vs copy-on-write by table property.
   Then DuckDB, PyIceberg, Polars, and Daft read the result. This settles
   `iceberg-evolution` and the Polars and Daft read cells.
3. **Iceberg v3 spike on UC.** Create with `format-version=3` through each
   client (the server builds v2 unless asked), then run the v3 rows
   per engine. Record what fails with its error. Feeds R01 known issues.
4. **Delta feature writes in deltalake and DuckDB.** Whether their commits
   honour constraints, generated columns, row tracking, in-commit timestamps,
   and deletion vectors (coverage open checks 1 and 3).
5. **IRC catalog capabilities with clients.** Credential refresh
   (`loadCredentials`), conditional loads (`if-none-match`), metrics
   reporting, and a token through PyIceberg and Spark.
6. **UniForm through IRC**, once a managed UniForm table can be created
   (R01: IcebergCompatV2 needs deletion vectors off, and managed tables need
   them on). Flips `iceberg.read-uniform` and `iceberg-compat-v2.write`.

## 6. Watch

- The engine-support pages (`reference/engine-support`, draft in both
  projects) render per-engine reports from these tables. Their counts now
  include the backlog ("16 of 85"). Before either page goes `ready`, decide
  whether engine reports skip unanswered journeys the way asset rollups do.
- A release bump re-reads these claims like any other (`release-bump`).
  The server-gap evidence cites the R01 row, which the release review
  re-checks against `IcebergRestCatalogService.java` at the new tag.

[icm]: https://icebergmatrix.org/
[icm-src]: https://github.com/Neuw84/iceberg-matrix
