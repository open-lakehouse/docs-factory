---
title: Introducing the UC Delta API
slug: unity-catalog-delta-api
status: drafting
date: 2026-07-03
tags: [unity-catalog, delta-lake, iceberg, lakehouse]
series:
series_order:
author: Robert Pack
target: company blog
---

**TL;DR**

- The UC Delta API is a **versioned, intent-based and atomic** API surface for the Delta Ecosystem
- The wire format is **native Delta** and ispired by IRC.

## Introducing the UC Delta API

Through this API, a Delta client asks the catalog to load a table, allocate a new
one, or ratify a commit — and everything it sends and receives is native Delta.

The reason it has to be native comes down to what a catalog does for a *managed*
Delta table: it's a participant in the commit protocol, not a directory beside it.
To ratify a commit the server has to speak the same language the client writes into
the log — Delta's schema, its protocol and table features, its per-domain metadata.
So the API carries all of that as first-class shapes: the schema is Delta's own, the
protocol is a structured feature set the server advertises and checks, and updates
say only what changed rather than replacing a metadata blob wholesale. A generic
catalog can hand back a column list; only a Delta-native one can stand in the write
path and validate what lands.

The rest of this post is just the API doing that, shown on the wire.

## Start a local server

Everything below runs against a local OSS UC 0.5 server, so let's start one.
We need to define `server.properties` to configure managed tables in the server.

```properties
# server.properties
server.authorization=disable          # local only: any token (or none) is accepted
server.managed-table.enabled=true     # let the Delta API allocate + commit managed tables
storage-root.tables=file:///tmp/uc-data   # managed-table storage root (absolute file:// path)
```

```bash
mkdir -p /tmp/uc-data
docker run -d --name uc \
  -p 8080:8080 \
  -v /tmp/uc-data:/tmp/uc-data \
  -v "$PWD/server.properties:/home/unitycatalog/etc/conf/server.properties:ro" \
  unitycatalog/unitycatalog:v0.5.0
# REST API on :8080
```

:::note
UC vends the `file:///tmp/uc-data/...` locations
straight to the client, so that path has to mean the same thing inside the container
and on your host — which is why the `docker run` bind-mounts it **1:1**:
:::

With that running on `:8080`, we can get right into the fun part.

## A versioned, discoverable surface

If there is one thing we learned from open table formats, it is that
we should always design for a clear evolution path. As such you can
ask the server to advertise its version and supported endpoints.

```bash
curl -sS --fail-with-body \
  "$UC_URL/api/2.1/unity-catalog/delta/v1/config?catalog=unity&protocol-versions=1.0"
```

The server answers with the endpoint list and the protocol version it negotiated
between the client and server supported versions.

```json
{
  "endpoints": [
    "POST /v1/catalogs/{catalog}/schemas/{schema}/staging-tables",
    "POST /v1/catalogs/{catalog}/schemas/{schema}/tables",
    "GET  /v1/catalogs/{catalog}/schemas/{schema}/tables/{table}",
    "POST /v1/catalogs/{catalog}/schemas/{schema}/tables/{table}",
    "GET  /v1/catalogs/{catalog}/schemas/{schema}/tables/{table}/credentials",
    "..."
  ],
  "protocol-version": "1.0"
}
```

Load a table and the schema comes back as native Delta — the `struct`/`fields` shape
straight out of the transaction log, not a catalog-specific column model:

```json
{
  "metadata": {
    "table-type": "MANAGED",
    "table-uuid": "c389adfa-5c8f-497b-8f70-26c2cca4976d",
    "columns": {
      "type": "struct",
      "fields": [
        { "name": "id",   "type": "integer", "nullable": false, "metadata": {} },
        { "name": "name", "type": "string",  "nullable": false, "metadata": {} }
      ]
    },
    "latest-table-version": 0
  }
}
```

That schema shape is the whole point. But before picking the payload apart, it's
worth seeing the whole thing work end to end — because in practice you never make
these calls by hand.

## Create a table, end to end

Point Delta-Spark at the catalog and create, write, and read a managed Delta table.
This is the realistic path — an engine does the whole lifecycle for you. It is one
self-contained script (`snippets/read_write_delta_spark.py`, run with
`uv run read_write_delta_spark.py` — needs a JVM and the local UC server from
`docker compose up -d`), shown here as the three steps it walks through:

::::journey
### Point Spark at the UC catalog
Configure a `SparkSession` with the UC + Delta packages and point the catalog at
the local server. This is the only setup step; the rest is plain SQL.

```python file=./snippets/read_write_delta_spark.py start=start:session end=end:session
```

### Create the managed table and write rows
`CREATE` routes through `POST /staging-tables` → `POST /tables`; the `INSERT`
commits via `POST /tables/{table}`.

```python file=./snippets/read_write_delta_spark.py start=start:create end=end:create
```

:::warning
A managed `CREATE` **must** set `delta.feature.catalogManaged = 'supported'` —
exactly what the staging-tables response advertises under `required-protocol`.
Omit it and UC rejects the table.
:::

### Read it back
The `SELECT` loads via `GET /tables/{table}` and a (local, empty) credential vend.

```python file=./snippets/read_write_delta_spark.py start=start:read end=end:read
```
::::

The `SELECT` prints the two rows back:

```
+---+-----+
| id| name|
+---+-----+
|  1|alpha|
|  2| beta|
+---+-----+
```

Three SQL statements. Underneath, the engine and the catalog have a specific
conversation over the Delta API — and that conversation is the interesting part.

## How that conversation goes

Those three statements expand into a defined exchange between the client, the
catalog server, and storage. Creating the table takes two catalog calls
(`staging-tables` to allocate, then `tables` to promote) around a first commit the
client writes to storage itself; the `INSERT` is a load → stage → ratify → publish
cycle. The Unity Catalog [managed-tables spec][ManagedTablesSpec] defines it; here it
is end to end:

![Sequence diagram: the UC Delta API managed-table create-and-commit flow between a Delta client, the Unity Catalog server, and cloud storage — GET /config, POST staging-tables, write 0.json, POST tables to promote, then loadTable, write a staged commit, POST add-commit guarded by assert-table-uuid/assert-etag, and publish.](./assets/managedTableFlow.png "likec4=ucDeltaApi_managedTableFlow")

The next two sections pick two moments out of this flow: what the catalog hands back
as schema, and the single guarded call that ratifies a commit.

## What the schema carries

Because the wire format is Delta's own, the API carries Delta's features directly,
with nothing flattened. You can see it the moment a table is allocated: `POST
…/staging-tables` responds with the exact protocol the table will run under —

```json
{
  "required-protocol": {
    "min-reader-version": 3,
    "min-writer-version": 7,
    "reader-features": ["catalogManaged", "v2Checkpoint", "deletionVectors"],
    "writer-features": ["catalogManaged", "v2Checkpoint", "deletionVectors",
                        "inCommitTimestamp"]
  },
  "suggested-protocol": {
    "reader-features": ["columnMapping"],
    "writer-features": ["columnMapping", "domainMetadata", "rowTracking"]
  }
}
```

And in the per-column metadata, where column-mapping ids ride along in each field —

```json
{
  "name": "id",
  "type": "long",
  "nullable": true,
  "metadata": {
    "delta.columnMapping.id": 1,
    "delta.columnMapping.physicalName": "col-fcddc5e6-7710-46ca-a0df-58b6fc55b42f"
  }
}
```

The catalog is speaking Delta. That is the feature.

## One endpoint, atomic updates

Changes go through a single overloaded endpoint: `POST …/tables/{table}`. The body
is an intent list (`updates`) guarded by preconditions (`requirements`) — the server
checks the guard and applies the intents atomically. Here is a real commit body,
captured from Delta-Spark's traffic during an `INSERT`:

```json
{
  "requirements": [
    { "type": "assert-table-uuid",
      "uuid": "1f47e3b8-7fb8-413c-9d9d-20f2ab75b908" }
  ],
  "updates": [
    { "action": "add-commit",
      "commit": {
        "version": 1,
        "file-name": "00000000000000000001.63e70f6f-....json",
        "file-size": 1773
      } }
  ]
}
```

The client writes the Delta commit file first, then this RPC ratifies it — Delta's
client-writes-then-catalog-ratifies flow, guarded and validated on the server.

One rule worth stating plainly, because the examples show it: creating a table is
**two** RPCs — `POST …/staging-tables` to allocate, then `POST …/tables` to register
the schema and protocol — while committing to an existing table is **one**.

## A second engine reads the same table

Here is the payoff. Spark wrote `unity.default.events` earlier; nothing about that
table is Spark-specific — it is a Delta table in a Delta catalog. So a completely
different engine reads it back over the same catalog, against the same local server,
no cloud creds. Again one self-contained script (`snippets/read_delta_duckdb.py`, run
with `uv run read_delta_duckdb.py` after the Spark example has created the table),
in three steps:

::::journey
### Install the Delta + Unity Catalog extensions
`delta` ships in the stable core repo; `unity_catalog` is still in active
development, so it comes from `core_nightly`.

```python file=./snippets/read_delta_duckdb.py start=start:install end=end:install
```

### Point DuckDB at the UC catalog
A UC secret carries the endpoint + token, then `ATTACH` mounts the catalog.

```python file=./snippets/read_delta_duckdb.py start=start:attach end=end:attach
```

### Read the Spark-written table
DuckDB resolves the table through `GET /delta/v1/.../tables/{table}` and scans the
Delta files directly — the same table Spark created.

```python file=./snippets/read_delta_duckdb.py start=start:read end=end:read
```
::::

Same rows, a different engine, one catalog:

```
read back through the UC Delta API, from DuckDB:
[(1, 'alpha'), (2, 'beta')]
```

That is the reason a Delta-native catalog API is worth having: any Delta engine can
speak it.

## Wrap-up

The UC Delta API is a versioned, discoverable, Delta-native catalog surface: it
carries Delta's schema, protocol, and intent-based commits on the wire without
flattening any of them. The proof is that two engines read one managed table over
one catalog with nothing but a local server.

If you want to see it yourself: stand up OSS UC 0.5, run `GET /delta/v1/config`, and
walk the create → commit → load lifecycle. Point your own Delta engine at it. And if
you are building a client, read [`api/delta.yaml`][delta-yaml] and the
[managed-tables spec][ManagedTablesSpec].
