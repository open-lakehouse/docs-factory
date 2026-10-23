# One journey graph for the estate

**Status:** proposal. Implements [ADR-0009](../../architecture/adr/ADR-0009-journeys-as-path-patterns.md)
in phases (§6); nothing below is built yet.
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

## 1. Where it stands

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

## 2. Target layout

```
architecture/journeys/
  obligations/<specId>.yml      what each spec asks of each role
  paths.yml                     named role → contract patterns
  journeys/<area>.yml           the journeys, one file per area (table, iceberg, namespace, volume, function, view, …)
  interfaces.yml                engine · language bindings
  evidence.yml                  cells no script proves; facts about one implementation
  aliases.yml                   old project-local ids → new ids
content/<project>/compatibility.yml
  spec, tabs, tables            the project's projection
```

`docsnip compat` loads `architecture/journeys/` once, then each project's
projection, and writes `content/<project>/compatibility.json` as today.
`docsnip check` validates every id against `architecture/dist/model.json`.

### 2.1 Obligations

```yaml
# architecture/journeys/obligations/deltaSpec.yml
spec: deltaSpec
source: https://github.com/delta-io/delta/blob/master/PROTOCOL.md
roles: [reader, writer]
obligations:
  deletionVectors:
    roles: [reader, writer]
    since: "reader 3 · writer 7"
    level: optional
  appendOnly:
    roles: [writer]
    since: "writer 2"
    level: optional
```

`icebergRestSpec.yml` and the UC REST spec's file come from their OpenAPI
operationIds at the release tag, with roles `client` and `server`.
`unityCatalogDeltaApiSpec.yml` lists the steps of `ManagedDeltaTablesSpec.md`.
An obligation id is `<specId>:<name>`.

### 2.2 Paths

```yaml
# architecture/journeys/paths.yml
by-path:
  roles:
    client: { implements: [deltaSpec] }
uc-api:
  roles:
    client: { consumes: [unityCatalogSpec] }
    catalog: { implements: [unityCatalogSpec] }
uc-external:
  roles:
    client: { consumes: [unityCatalogSpec], implements: [deltaSpec] }
    catalog: { implements: [unityCatalogSpec] }
uc-managed:
  roles:
    client: { consumes: [unityCatalogSpec, unityCatalogDeltaApiSpec], implements: [deltaSpec] }
    catalog: { implements: [unityCatalogSpec, unityCatalogDeltaApiSpec] }
  covers: [deltaSpec:catalogManaged]
iceberg-rest:
  roles:
    client: { consumes: [icebergRestSpec], implements: [icebergSpec] }
    catalog: { implements: [icebergRestSpec] }
```

`roles` replaces `requires`. ADR-0005 used `requires` for an edge kind that
was later removed. A journey can add a role, such as `storage: { implements:
[s3Spec] }` for vended credentials, but it can't replace the path's roles.

### 2.3 Journeys

```yaml
# architecture/journeys/journeys/table.yml
table.append:
  task: append
  asset: lakehouse.table
  title: Append rows
  summary: Add rows to a table without touching the rows already there.
  paths:
    by-path: {}
    uc-external: { title: Append to an external table }
    uc-managed: { title: Append to a managed table }
```

A journey and a path together make a cell's row key, written
`table.append@uc-managed`. Declaring the paths inside one journey keeps a
task's wording in one place, and per-path `title` and `summary` overrides keep
today's row labels. `covers` sits on the journey or on one path entry.

### 2.4 Interfaces, claims, evidence

`interfaces.yml` holds today's interface entries (`label`, `package`, `model`,
`integrations`, `via`) without `pin`. A projection's `pins:` maps an interface
to its release-manifest key, and a claim resolves its pin through the claiming
script's project. A claim names a global interface and a row key:

```python
# claims.spark-sql = [
#   { journey = "table.append@uc-managed", region = "write-rows", api = "INSERT INTO" },
# ]
```

The `"delta:spark-sql"` form and the "through Unity Catalog" notes go away.
Evidence keeps its shape, keyed by row keys. One new form records a fact about
one implementation:

```yaml
- implementation: unityCatalogServer
  obligations: [icebergRestSpec:registerTable]
  outcome: missing
  source: unitycatalog:reference/features-and-limitations#not-in-unity-catalog-oss
```

Client cells on a path whose `catalog` role the script's environment binds to
that implementation render as blocked, with the server fact as the reason.

### 2.5 Projections

```yaml
# content/delta/compatibility.yml
spec: deltaSpec
tabs: [spark-sql, spark-python, spark-scala, spark-java, delta-rs-python, delta-rs-rust, duckdb-sql, duckdb-python]
pins: { spark-sql: pyspark, delta-rs-python: deltalake, delta-rs-rust: deltalake-rs }
tables:
  create-and-write:
    title: Create and write
    columns: [spark-sql, spark-python, delta-rs-python, delta-rs-rust, duckdb-sql]
    rows: [table.create@by-path, table.append@by-path, …]
  with-unity-catalog:
    title: Delta tables in Unity Catalog
    columns: [spark-sql, delta-rs-python, duckdb-sql]
    select: { asset: lakehouse.table, paths: [uc-external, uc-managed] }
```

A `select:` row set is ordered by the catalog's file order and by path order.
`<!-- compat:asset:<id> -->` becomes `select: { asset: <id> }` with the
current column narrowing. `content/open-lakehouse` gets a projection without
owning any journey. Its format crosswalk becomes a table of the obligations
that Delta and Iceberg rows both cover.

## 3. Coverage from the graph

For an implementation `I` and a spec `S` reached through `I -[implements|consumes]-> S`
or `I -[integrates]-> X -[implements|consumes]-> S`, the expected set is
`S`'s obligations for `I`'s role. An API role follows from the verb (`consumes`
makes a client, `implements` a server). A format role is `reader` and `writer`
unless evidence narrows it. Each expected obligation is in one of three states:

| State | Meaning | Acted on by |
| --- | --- | --- |
| untracked | no journey covers it | add a journey (authoring) |
| unproven | a journey covers it, but no ready claim or evidence answers it | write a script (testing) |
| answered | ✓, ✗, or blocked, from a claim or evidence | — |

`compat.diagnostics()` already reports model gaps against claims. This report
works the other way, from the model's edges to the obligations they imply. Its
results go into `compatibility.json` under `coverage`. `/plan/compat` uses them
as the denominator of its spec-version chips. `docsnip query` answers "what
does DuckDB owe Delta readers" from the same data.

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
  `aliases.yml` resolves the stored ids. The DB isn't released, so nothing else
  migrates. The proto comment that says a journey lands in
  `content/<project>/compatibility.yml` changes with P1.
- **Tab order is per project.** `tabs.py` checks page tab groups against the
  interface order, so each projection keeps `tabs:`.
- **Skills write journeys.** `review-feedback`, `docs-write`, and `docs-query`
  name `content/<project>/compatibility.yml` as the place to add or find a
  journey, and P1 updates them.
- **`compatibility.json` keeps its version-2 shape through P1.** New fields
  (`path`, `task`, `covers`, `coverage`) are additive. A journey's JSON `id` is
  its row key.

## 6. Phases

Each phase is its own PR, and each leaves `docsnip check` green.

| Phase | Change | Done when |
| --- | --- | --- |
| **P0** | Exact verbs, in place. Delta `defaults` client `implements: [deltaSpec]`. UC `managed` adds `unityCatalogDeltaApiSpec` and `deltaSpec`, `iceberg` adds `icebergSpec`. `compat.py` checks each role's own verb, not the `_SPEC_EDGES` union. Fix the model gaps this surfaces (`polars` and `daft` `integrates` `pyIceberg`, a Delta edge for `daft`) through `update-architecture`. | Rendered tables are unchanged. `compatibility.json` differs only in `diagnostics` and `verifiedEdges`. |
| **P1** | `architecture/journeys/` with paths, journeys, interfaces, evidence, and aliases. The loader reads the global files plus the projections. Duplicates merge. Old ids resolve through aliases with a warning, then a one-shot script rewrites the claims. | The set of (interface, row key, outcome) triples equals the pre-migration set mapped through aliases. `bun test src/content-core` passes, and `just uc-docs` / `just delta-docs` render the same engine reports. |
| **P2** | `obligations/*.yml` replaces `specFeatures`. `feature:` becomes `covers:` (a list). The coverage report. | `coverage` is in `compatibility.json`, and its numbers are in the PR description. |
| **P3** | Implementation facts and blocked cells. The six UC Iceberg REST server entries become implementation facts. | The `iceberg-catalog` table renders the same outcomes from one fact per endpoint. |
| **P4** | `select:` rows. Delta's "with Unity Catalog" table. The open-lakehouse format crosswalk from shared `covers:`. | `catalog.unity` is gone, and the crosswalk page renders from data. |
| **P5** | Upstream conformance suites (the Iceberg REST Compatibility Kit, Delta Acceptance Testing) as evidence for obligations. | Optional. |

## 7. Open questions

- **Row-key syntax.** `table.append@uc-managed` reads well in claims. The
  alternative keeps dotted ids per path (`managed.append`) with `path` as a
  field, which means fewer renames but loses the task-to-path link in the id.
- **Narrowing format roles.** `duckdbDelta`'s title says it "reads Delta tables
  and appends to them". Evidence could mark the writer obligations it doesn't
  attempt, or the model could carry reader and writer as two edges or a tag.
  Evidence is cheaper. The model is queryable.
- **`operatesOn` per path.** Today's asset-breadth check ignores paths. Polars
  acts on tables by path but not as catalog-managed ones. The path's roles
  already express that, so `operatesOn` stays coarse unless a view needs it.
- **UC REST obligations.** Generating them from the server's OpenAPI document
  at the release tag adds a step to `just bump-uc` and to the release review.
