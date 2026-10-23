# ADR-0009: Journeys are tasks through contract paths, defined once for the estate

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-10-23 |
| Supersedes | — |
| Superseded by | — |

## Context

A journey is what a reader sets out to do, such as "append to a managed
table". Scripts claim journeys per interface, and compatibility tables render
the claims. Journeys grew up per project, in `content/unitycatalog/compatibility.yml`
(125 journeys) and `content/delta/compatibility.yml` (85). ADR-0008 gave the
model one meaning per edge kind; the journey layer still predates it.

- **One task, several ids.** The managed-table tutorial's `write-rows` region
  claims `managed.read` and `managed.append` for UC's Spark column, and
  `read.scan`, `write.append`, `catalog-managed.read`, and
  `catalog-managed.write` for Delta's (`claims."delta:spark-sql"`). That's
  two tasks (read and append) claimed six times. The only thing telling the Delta rows apart is the free-text note
  "through Unity Catalog", and Delta's `catalog.unity` row stands in for UC's
  whole table matrix. Interfaces are duplicated the same way (`spark-sql`,
  `delta-rs-python`, DuckDB).
- **Role verbs carry no meaning.** Delta journeys require a client that
  `consumes` `deltaSpec`. ADR-0008 says formats are implemented. The check
  accepts either verb, so the mistake is invisible.
- **Requirements lag the model.** Catalog-managed journeys don't name
  `unityCatalogDeltaApiSpec`, Iceberg REST journeys don't name `icebergSpec`,
  and no table journey names its table format.
- **`family` holds three axes at once:** the asset kind, the access path (by
  path, through the UC API, as a catalog-managed table, through Iceberg REST),
  and the requirement bundle.
- **Specs aren't the denominator.** Spec features are a flat list of names with
  no role (Delta reader or writer, API client or server), no version, and no
  level. Coverage is the answered share of the rows someone chose to author.
  Nothing says what a client of a spec is expected to do.
- **Facts about one implementation are repeated per client.** A missing Iceberg
  REST endpoint on the Unity Catalog server is recorded as `missing` for each of
  five clients.

Where the project is going makes this worse. Delta docs that cover integration
with Unity Catalog, lakehouse-wide pages, and one page rendered into several
sites all need the same journey to mean the same thing everywhere.

## Considered Options

- **Keep per-project matrices and link them with cross-project claims.** This
  is the status quo. Every shared task stays duplicated, and the claim count
  grows with the number of projects.
- **Model journeys as LikeC4 elements or edges.** One source of truth, but a
  journey isn't an edge (see Decision 1), and hundreds of journeys with
  structured fields don't fit the DSL or its views.
- **One estate-wide journey catalog beside the model, projected into projects
  (chosen).** Journeys, paths, spec obligations, interfaces, and evidence are
  defined once and validated against `model.json`. Each project keeps only its
  tables.

## Decision

**1. A journey is a task on an asset kind through a path.** One task through
one path is one journey, and its id is unique across the estate. A journey is
not an edge. Every journey needs at least one implementation, the spec it
speaks, and the asset kind it acts on. A multi-party journey binds several
roles (client, catalog, storage), and many journeys share one pattern. Edges
are the necessary condition: the model says the journey can work. A claim is
the evidence that it does. The model never creates a journey or a green cell.

**2. A path is a named pattern of roles, and each role uses the exact ADR-0008
verb.** A client `implements` the format it reads or writes and `consumes` the
API it calls. A provider `implements` the spec it serves, or `realizes` a
capability or concern. Paths are defined once: `by-path`, `uc-api`,
`uc-external`, `uc-managed`, and `iceberg-rest` cover the journeys tracked
today. A path can cover spec obligations of its own. `uc-managed` covers Delta
`catalogManaged`, so every journey through it exercises the feature without
another claim.

**3. Specs define obligations; journeys cover them.** Each open specification
lists what it asks of each role, keyed by its model id. Each entry has a role
(`reader`/`writer` for formats, `client`/`server` for APIs), the version that
added it, and a `required` or `optional` level, all taken from the spec itself.
A journey covers zero or more obligations. An implementation's expected
coverage is the obligations of the specs its edges reach, directly or through
`integrates`.

**4. A fact about one implementation is recorded once, on that
implementation.** A server that doesn't serve an obligation is recorded as
server × obligation. Cells for clients on a path bound to that server derive as
"blocked by the server".

**5. Interfaces are defined once.** An interface is one engine through one
language binding, bound to a model implementation and its integrations. Its
version comes from the claiming script's project release.

**6. Journeys and obligations are lakehouse fact, so they live in
`architecture/journeys/`.** Claims stay in the tested scripts that prove them.
The tables a page embeds, and their row and column order, are editorial and
stay in `content/<project>/compatibility.yml`. A table row can be listed or
selected by asset, path, or spec.

## Consequences

### Positive

- A task done once is claimed once. A table on any site can show the journey,
  including Delta docs showing the Unity Catalog paths.
- Coverage has a real denominator: "how many of Delta's reader obligations
  has DuckDB answered" is computed from the graph, not from rows someone
  picked.
- The role verbs check something, so the model and the journeys hold each other
  to ADR-0008.
- Server gaps become one fact each, and a new release that adds an endpoint
  flips every derived cell at once.

### Negative / Trade-offs

- Every journey id, every claim, the review app's JOURNEY content requests, and
  the `compatibility.json` consumers have to migrate. An alias map keeps the old
  ids resolving until the claims are rewritten.
- Obligations are a second inventory to curate. Where a spec ships an OpenAPI
  document they're generated, but Delta and Iceberg format features are curated
  from the protocol text.
- Content authors edit two places when they add a journey: the catalog for the
  definition and the project table for its row.
- The stricter verb check surfaces model gaps (for example, `polars` and `daft`
  reach Iceberg REST through PyIceberg, but no `integrates` edge records it).
  They get fixed in the model, not waived.
