# One journey graph for the estate

**Status:** P0–P4 (#311–#315) and P4b are built: the catalog in
`architecture/journeys/`, the per-project projections with selected rows and
rollup columns, the spec obligations, the coverage report, server facts, and
the format crosswalk (§2–§3 describe them as built). P5 is a proposal. Implements [ADR-0009](../../architecture/adr/ADR-0009-journeys-as-path-patterns.md).
**Scope:** `content/*/compatibility.yml`, `content/vocab.json` `specFeatures`,
`tools/docsnip` (`compat.py`, `scriptmeta.py`, `query.py`, `tabs.py`), the
`compatibility.json` consumers in `site/` and `emit/`, and the review app's
JOURNEY content requests.
**Supersedes:** the `specFeatures` paragraph of
[`format-compatibility-plan.md`](./format-compatibility-plan.md) §2, once P2
lands.

ADR-0009 decides what a journey is and where its facts live. This document
covers how the factory gets there: the files, their schemas, the coverage
report, and the migration.

## 1. Where it stood (before P0)

| | UC | Delta |
| --- | --- | --- |
| Journeys | 125 in 12 families | 85, default family plus `feature` |
| Interfaces | 14 | 8 |
| Shared with the other project | none by id | none by id |

Across both projects there are 316 claims. No journey id appears in both
files, but many tasks do:

| Task | UC id | Delta id |
| --- | --- | --- |
| Read a catalog-managed table | `managed.read` | `catalog-managed.read`, and `read.scan` noted "through Unity Catalog" |
| Append to one | `managed.append` | `catalog-managed.write`, `write.append` noted "through Unity Catalog" |
| Read an earlier version | `managed.time-travel` | `read.version` noted "through Unity Catalog" |
| Change rows | `managed.update`, `managed.delete` | `dml.update`, `dml.delete` noted "through Unity Catalog" |
| Use Unity Catalog at all | the whole `table-operations` table | `catalog.unity` |

UC scripts reach the Delta rows through `claims."delta:<interface>"`, and
six scripts do. The free-text `note` carries the access path.

Other gaps, by file:

- `content/delta/compatibility.yml` `defaults`: the client `consumes`
  `deltaSpec`. ADR-0008 says formats are implemented. `compat.py`
  `_SPEC_EDGES` accepts either verb, so the check passes.
- `content/unitycatalog/compatibility.yml` `families`: `managed` shares the
  `&uc` requirements with `table` and `external`. None names
  `unityCatalogDeltaApiSpec` or `deltaSpec`, and `iceberg` names no
  `icebergSpec`.
- `content/vocab.json` `specFeatures`: three flat name lists. `since` is
  repeated per journey, and a journey has at most one `feature`.
- UC `evidence`: six entries list all five Iceberg REST clients as `missing`
  for endpoints the server doesn't have.

## 2. Layout

```
architecture/journeys/
  obligations/<specId>.yml      what each spec asks of each role (P2)
  paths.yml                     named role → contract patterns
  journeys/<area>.yml           the journeys, one file per area (table, iceberg, namespace, volume, function, view, …)
  interfaces.yml                engine · language bindings
  evidence.yml                  cells no script proves; facts about one implementation
  aliases.yml                   old project-local ids → new ids
content/<project>/compatibility.yml
  spec, interfaces, tables      the project's projection: interfaces in tab order, tables
```

`docsnip compat` loads `architecture/journeys/` once, then each project's
projection, and writes `content/<project>/compatibility.json` as today.
It also writes the catalog itself, resolved, to `architecture/dist/journeys.json`
for the review app's Model section: each path with the implementations the model
lets play each role (and the integrations they need), each obligation with the
journeys covering it per role, each server fact with the cells it blocks in every
project, and the equivalences with their journeys. Like `compatibility.json` it's
committed, so the site builds without uv, and `docsnip check` fails when it's stale.
`docsnip check` validates every id against `architecture/dist/model.json`.

### 2.1 Obligations (built)

```yaml
# architecture/journeys/obligations/deltaSpec.yml
spec: deltaSpec
source: https://github.com/delta-io/delta/blob/master/PROTOCOL.md
roles: [reader, writer]
obligations:
  appendOnly: { roles: [writer], since: "writer 2" }
  deletionVectors: { since: "reader 3 · writer 7" }
```

P2 moved `vocab.json` `specFeatures` into three files: `deltaSpec.yml` (23
table features), `icebergSpec.yml` (18 format features), and
`icebergRestSpec.yml` (25 operationIds). A file's `roles` are the roles a
client takes (`reader`/`writer` for a table format, `client` for an API), and
an obligation binds all of them unless it lists its own: a Delta writer
feature binds `writer`, a reader-writer feature both. `since` moved from the
journeys onto the obligation. `delta_features:` frontmatter reads the Delta
names from here.

A journey's `covers` lists `<spec>:<name>[:<role>]`. The role is required
where the obligation binds more than one: `deletion-vectors.read` covers
`deltaSpec:deletionVectors:reader`, and `iceberg.v3-deletion-vectors` covers
`icebergSpec:deletion-vectors` as writer and reader. The artifact keeps
`feature` (the first obligation, with its `since`) for the review app's
grouping, and adds `covers`. P2 also gave the Iceberg REST table and namespace
journeys the operations they plainly call (`iceberg.read` covers `loadTable`,
writes cover `updateTable`).

Deferred: a `level` (required or optional) until a spec states one per
obligation; server roles for the API specs (P3); path-level `covers`, because
a path can't say which role a journey takes (`uc-managed` is read by
`managed.read` and written by `managed.append`); and files for the Unity
Catalog REST and Delta API specs.

### 2.2 Paths (built)

`architecture/journeys/paths.yml` names six paths: `by-path`, `uc-api`,
`uc-external`, `uc-managed`, `iceberg-rest-api` (namespaces, credentials, and
tokens through Iceberg REST, with no table format), and `iceberg-rest`. Each
role uses the exact ADR-0008 verb:

```yaml
uc-managed:
  roles:
    client:
      consumes: [unityCatalogSpec, unityCatalogDeltaApiSpec]
      implements: [deltaSpec]
    catalog: { implements: [unityCatalogSpec, unityCatalogDeltaApiSpec] }
```

`roles` replaces `requires`. ADR-0005 used `requires` for an edge kind that
was later removed. A journey's own `roles` add a role or a contract to its
path's, but can't remove one. A read with vended credentials adds `storage: {
implements: [s3Spec] }`, and joining Delta and Iceberg tables adds the Unity
Catalog side to `iceberg-rest`. The artifact's `requires` is the resolved union.
Paths cover no obligations (§2.1).

### 2.3 Journeys (built)

```yaml
# architecture/journeys/journeys/table.yml
managed.append:
  title: Append to a managed table
  summary: Append rows to a catalog-managed table, with the catalog accepting the commit.
  asset: lakehouse.table
  path: uc-managed
  feature: { spec: deltaSpec, name: catalogManaged, since: "reader 3 · writer 7" }
```

A journey is flat: one id, one `path`, one `asset`, all explicit. The id stays
the row key, so the existing `<area>.<task>` ids, claims, and review-app
request ids keep working, and §7's row-key question is settled for now. Areas
are files (`table`, `table-features`, `iceberg`, `namespace`, `volume`,
`storage`, `function`, `view`), and an id is unique across them.

P1 merged the two journeys that are the same task on the same path:
`catalog-managed.read` became `managed.read`, and `catalog-managed.write`
became `managed.append`, carrying Delta's `catalogManaged` feature.
`aliases.yml` keeps the old ids.

P4 settled the Delta rows that UC scripts proved "through Unity Catalog". A
commit through a catalog-managed table goes through the catalog, not the
filesystem, so it doesn't prove the `by-path` task. The core operations moved
to the matching `managed.*` journeys: create, CTAS, append, overwrite,
replace-where, dynamic partitions, read, time travel, update, and delete.
Delta's "Delta tables in Unity Catalog" table shows them. The Delta `by-path`
cells that only UC proved fell back to Delta's own draft proofs, upstream
docs, or unknown. Claims on the table-feature journeys stayed, because a
feature is a format obligation whatever the path. So did claims on operations
with no Unity Catalog journey (history, detail, restore, schema overwrite,
column changes, properties), which keep their "through Unity Catalog" note.
`catalog.unity` dissolved into the new table.

### 2.4 Interfaces, claims, evidence (built)

`interfaces.yml` holds each interface once (`label`, `pin`, `package`,
`model`, `integrations`, `via`). `pin` is a key in each project's
`release.yml`, so one interface shows each project's version: UC's Spark
columns read 4.1 and Delta's read 4.2. Delta's Spark interfaces are now
`apacheSpark` with the `deltaSpark` integration, like UC's, so Delta's engine
report is `compat:engine:apacheSpark`.

UC's columns are engine-level (`spark`, `duckdb`) and Delta's are engine ·
language (`spark-sql`, `duckdb-sql`). Since P4, an engine-level interface is a
`rollup` of its language interfaces, and its cell is the best ready cell among
them: SQL working beats Python failing. Scripts claim the language their page
shows, so one claim fills both UC's Spark column and Delta's Spark · SQL
column. A claim on a rollup is an error. Every UC `spark` and `duckdb` claim
showed SQL, so they became `spark-sql` and `duckdb-sql`. The Spark and DuckDB
language interfaces carry their engine's integrations, Iceberg included.
`spark-4.2` stays its own interface: it's a version line, not a language.

A claim names an interface and a journey, with no project:

```python
# claims.spark-sql = [
#   { journey = "managed.append", region = "write-rows", api = "INSERT INTO" },
# ]
```

It counts in every project that lists the interface and shows the journey on
a table, and its package pin is checked against the claiming project's scripts.
`claims."delta:spark-sql"` is an error. Evidence keeps its shape in
`evidence.yml`, and a `source` names its project
(`unitycatalog:reference/features-and-limitations#…`) or is a URL.

P3 added facts about one implementation, in the same file:

```yaml
- implementation: unityCatalogServer
  obligations: [icebergRestSpec:registerTable]
  outcome: missing
  why: The server has no `registerTable` endpoint.
  source: unitycatalog:reference/features-and-limitations#not-in-unity-catalog-oss
```

A projection's `providers` binds the implementation each provider role plays
in its cells. Unity Catalog binds `catalog: unityCatalogServer`, the server
its environments run, and Delta binds none. The loader turns each bound fact
into evidence. Every journey in the matrix that covers one of the fact's
obligations, through a role the provider plays that must implement the
obligation's spec, gets the fact's outcome for every interface whose model
reaches that spec. Explicit evidence and claims still come first, and a ready
claim that the journey works contradicts the fact (an error). A fact that
blocks nothing anywhere is an error too. Tables render a blocked cell as the
same ✗, the artifact's evidence carries `implementation`, the review app
labels it "blocked by" the server, and coverage counts it as `blocked`.

The six per-client UC Iceberg REST server entries became five facts:
`registerTable`, `commitTransaction`, the view operations, scan planning, and
`signRequest`. Renaming a table into another namespace stays a per-client
entry, because the server serves `renameTable` and only rejects that one use.
Binding providers from the environment registry instead of the projection, so
a project with several servers gets a cell per server, is left open.

### 2.5 Projections (built)

```yaml
# content/delta/compatibility.yml
spec: deltaSpec
interfaces: [spark-sql, spark-python, spark-scala, spark-java, delta-rs-python, delta-rs-rust, duckdb-sql, duckdb-python]
tables:
  create-and-write:
    title: Create and write
    columns: [spark-sql, spark-python, delta-rs-python, delta-rs-rust, duckdb-sql]
    rows: [create.table, write.append, …]
  unity-catalog:
    title: Delta tables in Unity Catalog
    columns: [spark-sql, spark-python, delta-rs-python, delta-rs-rust, duckdb-sql]
    select: { asset: lakehouse.table, paths: [uc-external, uc-managed] }
```

A table lists its `rows` or `select`s them, not both. A select matches every
key it gives (`asset`, and `paths` as any of the listed), in catalog order: the
area files sorted by name, then file order. `<!-- compat:asset:<id> -->` keeps
its own rollup for now. `content/open-lakehouse` can get a projection without
owning any journey.

### 2.6 Equivalences and the crosswalk (built)

`architecture/journeys/equivalences.yml` records what table formats do alike:
each entry has a title, a side per spec, and how they differ. A side names
the obligations it uses and adds `journeys` that cover no obligation, such as
Delta's version reads, which are core protocol. Its `text` replaces the
obligation names where the spec's own words say more ("v2 position deletes;
v3 deletion vectors") or says what the spec has instead ("None").
`<!-- compat:crosswalk -->` renders it with no project matrix: a column per
spec, each side listing the journeys that cover its obligations, so a journey
that gains a `covers` joins its row. The open-lakehouse crosswalk page (R01,
`private`) is generated from it and keeps its 16 rows. Still open: engine
support per side (which needs a project's cells) and a check for obligations
that pair with nothing.

## 3. Coverage from the graph (built)

`compat.coverage()` runs per project, for each interface that is a table
column. The interface reaches a spec through an `implements` or `consumes`
edge of its model or of an integration. Every obligation of that spec is
expected once per role it binds, so the spec sets the total. Each one's state
is the best ready cell among the journeys covering it that a table shows in
that column:

| State | Meaning | Acted on by |
| --- | --- | --- |
| untracked | no journey a table shows in this column covers it | add a journey or a row (authoring) |
| unknown | covered, but no ready claim or evidence answers it | write a script (testing) |
| tested, documented, fails, missing | answered by a claim or evidence | — |

An interface no table shows with any journey on a spec has no entry for it.
That leaves out Delta's Spark · Python beside the one Spark feature column,
and UC's Spark 4.2 line. The results are `coverage` in each
`compatibility.json`, and `uv run docsnip compat --coverage` prints one line
per project, interface, spec, and role. At P2:

| Project · interface | Spec · role | Answered |
| --- | --- | --- |
| Delta · Spark · SQL | Delta reader | 6 of 10 |
| Delta · Spark · SQL | Delta writer | 19 of 23 |
| Delta · DuckDB · SQL | Delta reader | 5 of 10 |
| Delta · delta-rs · Rust | Delta writer | 1 of 23 |
| UC · Spark | Iceberg REST client | 14 of 25 (7 untracked) |
| UC · Spark | Delta writer | 1 of 23 (22 untracked: UC tracks only `catalogManaged`) |

`compat.diagnostics()` reports model gaps against claims. This report works
the other way, from the model's edges to the obligations they imply. Still
to come: `/plan/compat` showing it as the denominator of its spec-version
chips, `docsnip query` answering "what does DuckDB owe Delta readers", and
a server-side report of what a bound server serves of its specs.
Server facts (P3) count as `blocked`: at P3, Spark, DuckDB, and PyIceberg have
6 of their 25 Iceberg REST client obligations blocked by the UC server and no
✗ of their own.

## 4. One page, several sites

Journeys are estate-wide, so a compatibility table doesn't care which site
renders it. A cell links to the page that proves it, and the emitter decides
whether that link is local or goes to another site, the same way `model:`
links resolve today. Sharing a whole page between sites (nav entries that
point into another project) is a separate change. It needs the canonical-URL
rule from [`multi-domain-single-deployment.md`](./multi-domain-single-deployment.md)
§3, and it doesn't block anything here.

## 5. Migration constraints

- **The review DB stores journey ids.** A JOURNEY content request stores a
  table id and, when done, a journey id
  (`proto/docs_factory/review/v1/messages.proto`, `CONTENT_REQUEST_KIND_JOURNEY`).
  `aliases.yml` resolves the stored ids. The DB isn't released and no journey
  carried a `request:` when P1 renamed two, so nothing else migrated. P1
  updated the proto comments.
- **Tab order is per project.** `tabs.py` checks page tab groups against the
  interface order, so each projection's `interfaces:` list is in tab order.
- **Skills write journeys.** P1 pointed `review-feedback`, `docs-write`, and
  `docs-review` at `architecture/journeys/`, and the review-feedback MCP's
  request instructions with them.
- **`compatibility.json` is version 3.** P1 replaced a journey's `family` with
  its `path`. Other new fields (`covers`, `coverage`) are additive. A journey's
  JSON `id` is its row key.

## 6. Phases

Each phase is its own PR, and each leaves `docsnip check` green.

| Phase | Change | Done when |
| --- | --- | --- |
| **P0** (#311) | Exact verbs, in place. Delta `defaults` client `implements: [deltaSpec]`. UC `managed` adds `unityCatalogDeltaApiSpec` and `deltaSpec`, `iceberg` adds `icebergSpec`. `compat.py` checks each role's own verb, not the `_SPEC_EDGES` union. Fix the model gaps this surfaces (`polars` and `daft` `integrates` `pyIceberg`, a Delta edge for `daft`) through `update-architecture`. | Rendered tables are unchanged. `compatibility.json` differs only in `diagnostics` and `verifiedEdges`. |
| **P1** (built) | `architecture/journeys/` with paths, journeys, interfaces, evidence, and aliases. The loader reads the global files plus the projections. Duplicates merge. Old ids resolve through aliases with a warning, then a one-shot script rewrites the claims. | The set of (interface, row key, outcome) triples equals the pre-migration set mapped through aliases. `bun test src/content-core` passes, and `just uc-docs` / `just delta-docs` render the same engine reports. |
| **P2** (#313) | `obligations/*.yml` replaces `specFeatures`. `feature:` becomes `covers:` (a list). The coverage report. | `coverage` is in `compatibility.json`, and its numbers are in the PR description. |
| **P3** (built) | Implementation facts and blocked cells. The six UC Iceberg REST server entries become implementation facts. | The `iceberg-catalog` table renders the same outcomes from one fact per endpoint. |
| **P4** (built) | `select:` rows, rollup interfaces, Delta's "Delta tables in Unity Catalog" table, the core-operation claims moved off Delta's `by-path` rows. | `catalog.unity` is gone; UC's table cells are unchanged. |
| **P4b** (built) | Obligation equivalences across specs, and the open-lakehouse format crosswalk rendered from them. | The crosswalk page renders from data. |
| **P5** | Upstream conformance suites (the Iceberg REST Compatibility Kit, Delta Acceptance Testing) as evidence for obligations. | Optional. |

## 7. Open questions

- **Row-key syntax.** P1 kept dotted ids with `path` as a field (§2.3).
  `table.append@uc-managed` would link a task's paths in the id, at the price
  of renaming every id. P4 grouped a task's paths by `select:` instead, so
  the question stays open until a view needs one row per task.
- **Narrowing format roles.** `duckdbDelta`'s title says it "reads Delta tables
  and appends to them". Evidence could mark the writer obligations it doesn't
  attempt, or the model could carry reader and writer as two edges or a tag.
  Evidence is cheaper. The model is queryable.
- **`operatesOn` per path.** Today's asset-breadth check ignores paths. Polars
  acts on tables by path but not as catalog-managed ones. The path's roles
  already express that, so `operatesOn` stays coarse unless a view needs it.
- **UC REST obligations.** Generating them from the server's OpenAPI document
  at the release tag adds a step to `just bump-uc` and to the release review.
