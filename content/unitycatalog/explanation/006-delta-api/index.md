---
title: The Unity Catalog Delta API
summary: Unity Catalog's Delta API applies requirements and updates all or nothing, and carries Delta's own schema and table features on the wire.
diataxis: explanation
project: unitycatalog
references:
  - unityCatalogServer
  - unityCatalogSpec
  - deltaSpec
  - deltaSpark
  - lakehouse.table
  - lakehouse.credentialIssuer
status: draft
---

The *Delta API* is a versioned REST interface that
[Unity Catalog](model:unityCatalogServer) serves under
`/api/2.1/unity-catalog/delta/v1/`, next to the Unity Catalog REST API's
`/tables` endpoints. [Delta](model:deltaSpec) clients speak it: Spark through
the Unity Catalog connector and [Delta Spark](model:deltaSpark), and DuckDB
through its `unity_catalog` extension. A client uses it to stage, create,
load, and commit to a catalog-managed Delta table.
[External tables and catalog-managed Delta tables](../external-and-managed-tables/index.md)
walks through that lifecycle. This page explains why each part of the API is
designed the way it is.

This page's script, `delta_api_semantics.py`, sends the requests shown here
to a server and checks the responses the page describes.

## One endpoint takes requirements and updates

A commit proposal and every metadata change to a table go to one endpoint,
`POST …/tables/{table}`, as a list of preconditions (`requirements`) and a
list of intents (`updates`). Dropping and renaming a table have endpoints of
their own. The server checks every requirement, then applies every update, or
applies none.
A request that sets a comment and a property looks like this:

```json file=./snippets/update-request.json title="update-request.json"
```

The same envelope carries a new commit (`add-commit`), a schema change, a
protocol upgrade, and a property change. They can share one request, so a
change and the commit that writes it land together or not at all.

All or nothing extends to a request the server rejects as malformed. A
request may carry at most one action of each type, and at most one
requirement of each type. A `set-properties` and a `remove-properties` that
touch the same key are rejected rather than applied in order. The order of
entries in either list carries no meaning, because the server applies actions
in a fixed order of its own
([spec](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/spec/protocols/ManagedDeltaTablesSpec.md#write-a-commit)).
When the server rejects one, none of its valid updates apply either, and the
table's etag stays the same.

## Negotiation comes first

Before any other request, a client asks `GET /delta/v1/config` with a
`catalog` and the `protocol-versions` it supports. Both parameters are
required, and a missing one is a 400. The answer names a protocol version
and the endpoints the server offers for it:

```json file=./snippets/config-response.json title="config-response.json (condensed)"
```

The endpoints come back as strings, and clients route by them instead of
building paths. The strings carry the resolved catalog name, `warehouse`
here, while the schema and table segments stay templates. That design leaves
room to change the API:

- The version lives in each returned path (`/v1/…`), so a later protocol
  version can lay out its paths however it needs.
- A server may list endpoints beyond the specification's. Clients ignore
  strings they don't recognize, so a new endpoint doesn't break an old
  client.
- The
  [specification](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/spec/protocols/ManagedDeltaTablesSpec.md#get-configuration)
  treats a 404 on `config` as a server that doesn't support the protocol, and
  tells the client to fall back to the Unity Catalog table APIs. An unknown
  catalog is also a 404. Its error type, `NoSuchCatalogException`, tells the
  two apart.

The specification defines a negotiation: the client offers the highest
version it supports per major version, and the server picks the highest
version both support. The Unity Catalog server doesn't negotiate. It ignores
`protocol-versions` and answers `1.0` whatever the client offers, even
`2.0` alone. Check that the returned `protocol-version` is one you offered.
Treat any other answer as an unsupported server, as the specification does
for a 400.

<!-- R01 known issues, Delta API: /delta/v1/config ignores protocol-versions. -->

`config` covers the protocol version and its endpoints, not table features.
The catalog states those when a table is staged.

## The catalog sets table features at staging

When a client stages a table, the catalog states the Delta protocol the table
must use: a required protocol and properties, and a suggested protocol and
properties. Condensed, the server's answer reads:

```json file=./snippets/staging-response.json title="staging-response.json (condensed)"
```

The required protocol is reader version 3 and writer version 7. Its reader
and writer features are `catalogManaged`, `v2Checkpoint`,
`vacuumProtocolCheck`, and `deletionVectors`, and the writer features add
`inCommitTimestamp`. The required properties include
`io.unitycatalog.tableId`, which equals the staging table's ID.

A `null` value means the engine generates the value. The catalog asks for
column mapping in `name` mode but leaves `delta.columnMapping.maxColumnId` to
the engine that assigns the column IDs. The catalog names the property, and
the engine, which knows the schema, fills it in.

The response is authoritative. The specification's
[list of features](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/spec/protocols/ManagedDeltaTablesSpec.md#reference-table-features-and-properties-for-unity-catalog-managed-tables)
is a non-normative reference, and the specification lets a catalog grow or
shrink the set. Clients read the response fields rather than hard-coding a
list. A catalog that serves a stateful compaction service, for example, may
require `domainMetadata` so that the service's state is kept with the table.
Unity Catalog OSS ships a fixed set, defined in
[`UcManagedDeltaContract.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/delta/UcManagedDeltaContract.java).
When the client then
creates the table, the server checks the declared protocol and properties
against the managed-table contract.

The staging response also carries one `READ_WRITE` credential whose prefix is
the table's location, so the engine can write version 0 without standing
access to the bucket. [Credential vending](../credential-vending/index.md)
explains that trust boundary.

## Optimistic concurrency with assert-table-uuid and assert-etag

The API doesn't lock tables. A writer loads the table, prepares its change,
and states in `requirements` what it assumed when it loaded:

- **`assert-table-uuid`** is required on every request. A request without it
  is a 400 (`assert-table-uuid requirement is required`). Names get reused:
  a table can be dropped and created again under the same name. UUIDs don't,
  so the assertion stops a change meant for the old table from landing on
  the new one.
- **`assert-etag`** is optional. The etag is an opaque token from `loadTable`.
  If the table has changed since, the server answers 409
  `UpdateRequirementConflictException` and applies nothing:

  ```json file=./snippets/conflict-response.json title="conflict-response.json"
  ```

An `add-commit` for version `v` also asserts, without saying so, that the
table is at version `v-1`. Commits go in order, one version at a time: after
a Spark `INSERT`, the table's latest version is one higher, and its newest
commit carries that version. When another writer has already taken the
version, the
[specification](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/spec/protocols/ManagedDeltaTablesSpec.md#write-a-commit)
defines a second 409, `CommitVersionConflictException`. So a 409 comes in two
kinds: the version was taken, or a requirement failed. Either way, the change
didn't land.

### Retry or rebase

The two kinds of failure call for different responses. The specification's
[commit recovery](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/spec/protocols/ManagedDeltaTablesSpec.md#commit-recovery)
rules say:

- **On a 5xx or a timeout, resend the identical request.** The outcome is
  unknown, and the server deduplicates a retry by the staged commit's file
  name. A byte-for-byte retry resolves to what happened the first time.
- **Rebase only once you know the attempt didn't land.** A 409 tells you, and
  so does a reload that shows another writer's commit at the proposed
  version. Rebasing means building the commit again against the reloaded
  state, with a new commit file. Rebasing while the outcome is unknown can
  commit the same change twice.
- **Abort if the reloaded UUID differs.** The table was dropped and created
  again under the same name, so the change no longer has a target.

## Metadata changes travel with add-commit

A catalog-managed table has two views of its metadata: the catalog's record
and the Delta log. The API keeps them in lockstep with one rule. A change that
the Delta log also represents, such as the schema, the protocol, or a
`delta.*` property, goes in the same request as the `add-commit` whose commit
file writes it. A change that lives only in the catalog, such as the table
comment, may go alone. Engines follow the rule: after a Spark
`ALTER TABLE … ADD COLUMNS`, the table's version is one higher, and both the
Delta API and the Unity Catalog REST API list the new column.

The rule falls on the client. The specification doesn't require the server to
inspect staged commit files
([spec](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/spec/protocols/ManagedDeltaTablesSpec.md#catalog-and-log-consistency)),
so clients can't rely on it to check that declared metadata matches the commit
file, and they own the consistency of the two views. If the
two views diverge anyway, the Delta log wins for snapshots: engines rebuild
the table from its commits, and the catalog's record serves discovery.

:::warning
The server accepts a log-represented change with no commit. A `set-properties`
that turns `delta.enableDeletionVectors` off on a managed table succeeds
without a new version, and the Delta log keeps the old value. The
specification calls such a request a client error. Don't rely on the server to
catch it: send log-represented changes only with the `add-commit` that writes
them.
:::

<!-- R01 known issues, Delta API: log-represented set-properties without add-commit is accepted. -->

An external table has no `add-commit`, because the catalog doesn't accept its
commits. Its sync is metadata-only: the client sends what it reads from the
Delta log to the catalog's record, as in
[Sync the catalog's record](../../how-to/change-table-schema/index.md#sync-the-catalogs-record).

## Delta's own schema on the wire

The Delta API sends a table's columns as a Delta struct type, the same shape
as `metaData.schemaString` in the Delta log. Column-mapping metadata travels
with each field:

```json file=./snippets/columns-response.json title="columns-response.json (one field)"
```

The protocol travels the same way, as reader and writer features. Nothing is
translated: an engine gets the schema in the shape it writes to the log, with
the column IDs and physical names it assigned.

Compare the Unity Catalog REST API, which describes each column as a
`ColumnInfo` with `type_name`, `type_text`, and `type_json`. That shape serves
every format the catalog registers. The Delta API serves only Delta tables, so
it uses Delta's own shapes.

## Further reading

- [External tables and catalog-managed Delta tables](../external-and-managed-tables/index.md)
  walks through the lifecycle of a catalog-managed table.
- [Credential vending](../credential-vending/index.md) explains the
  credentials the staging and table responses carry.
- [Manage schemas and properties](../../how-to/change-table-schema/index.md)
  uses the Delta API to sync an external table's record.
- The [managed Delta tables specification](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/spec/protocols/ManagedDeltaTablesSpec.md)
  defines the protocol, and the
  [Delta API definition](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/api/delta.yaml)
  defines every endpoint and field.
- The [Delta protocol](https://github.com/delta-io/delta/blob/v4.3.1/PROTOCOL.md#catalog-managed-tables)
  defines catalog-managed tables from the table's side.
