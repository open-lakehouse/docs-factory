---
title: Find an integration for your tool
summary: Find which engines and tools connect to Unity Catalog OSS, through which interface, who maintains each integration, and how to check one before you rely on it.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - icebergRestSpec
  - deltaSpec
status: draft
---

Many engines and tools outside these docs connect to a
[Unity Catalog](model:unityCatalogServer) server. This page lists the ones the
earlier Unity Catalog docs covered, says how each one connects, and links the
docs of the project that maintains it. Where these docs have a tested guide, the
row links it instead.

## How a tool connects

A tool reaches Unity Catalog through one of three interfaces. The interface
decides which tables the tool can see:

- **The Unity Catalog REST API.** The tool looks tables up by name and reads
  their [Delta Lake](model:deltaSpec) files, usually with storage credentials
  the server vends. Spark, DuckDB, Daft, and most of the tools below work this
  way.
- **The Iceberg REST catalog.** The server also serves the
  [Iceberg REST Catalog](model:icebergRestSpec) API, at
  `/api/2.1/unity-catalog/iceberg`. Any Iceberg REST client can read the Delta
  tables that have Iceberg metadata (UniForm) through it, without a Unity
  Catalog-specific connector.
- **Table files registered by path.** A tool that writes Delta metadata, such
  as Apache XTable, doesn't talk to the server at all. You register the table
  it wrote as an external table.

## Integrations

The **Status** column records the project's state on the date in
**Checked**: *maintained* means the project has released recently and still
documents the integration, *unverified* means its documentation couldn't be
confirmed, and *archived* means the project no longer ships.

| Tool | Interface | Maintained by | Docs | Status | Checked |
| --- | --- | --- | --- | --- | --- |
| Apache Spark | Unity Catalog REST | Unity Catalog | [Use Spark with Unity Catalog](../configure-spark/index.md) | Tested here | 2026-10-25 |
| DuckDB | Unity Catalog REST | DuckDB | [Use DuckDB with Unity Catalog](../duckdb/index.md) | Tested here | 2026-10-25 |
| Daft | Unity Catalog REST | Eventual | [Python DataFrame libraries](../python-dataframes/index.md); [Daft's guide](https://docs.daft.ai/en/stable/connectors/unity_catalog/) | Tested here | 2026-10-25 |
| Trino | Iceberg REST | Trino | [Trino Iceberg connector, REST catalog](https://trino.io/docs/current/object-storage/metastores.html) | Maintained | 2026-10-25 |
| Spice | Unity Catalog REST | Spice AI | [Unity Catalog catalog connector](https://spiceai.org/docs/components/catalogs/unity-catalog) | Maintained | 2026-10-25 |
| PuppyGraph | Unity Catalog REST | PuppyGraph | [Querying Unity Catalog data as a graph](https://docs.puppygraph.com/getting-started/querying-unity-catalog-data-as-a-graph/) | Maintained | 2026-10-25 |
| Apache XTable | Registered by path | Apache XTable | [Unity Catalog](https://xtable.apache.org/docs/unity-catalog/) | Maintained | 2026-10-25 |
| CelerData | Unity Catalog REST | CelerData | [Earlier Unity Catalog guide](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/docs/integrations/unity-catalog-celerdata.md) | Unverified | 2026-10-25 |
| Kuzu | Unity Catalog REST | None | [Archived repository](https://github.com/kuzudb/kuzu) | Archived | 2026-10-25 |

Notes on individual rows:

- **Trino** reads through the Iceberg REST catalog only, so it sees only the
  tables with Iceberg metadata. Set `iceberg.rest-catalog.uri` to the server's
  `/api/2.1/unity-catalog/iceberg` endpoint.
- **Spice** queries Delta tables. Set its `unity_catalog_credential_vending`
  parameter to `enabled` to use the credentials the server vends instead of
  object store keys of its own.
- **Apache XTable**'s Unity Catalog guide registers a synced table in
  Databricks Unity Catalog. For an OSS server, register the Delta table XTable
  writes as in [Register an external Delta table](../register-external-table/index.md).
- **CelerData**'s documentation site now redirects to a PhoenixData-branded
  site, which documents a `unity` metastore type for its Delta Lake catalog.
  Whether that is the same product, and whether it still connects to an OSS
  server, couldn't be confirmed. Open-source StarRocks doesn't document a
  Unity Catalog metastore.
- **Kuzu**'s repository was archived on 2025-10-10, so its `unity_catalog`
  extension gets no further releases.

## Check an integration before you rely on it

An integration that worked against one Unity Catalog release can break on the
next. Before you build on one:

1. Check the interface it uses. A tool on the Iceberg REST catalog sees only
   tables with Iceberg metadata. A tool on the Unity Catalog REST API sees
   every table but may read only Delta.
2. Check whether it writes. Several integrations here only read. Writing to a
   catalog-managed table requires the client to commit through the server; see
   [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md).
3. Check how it gets storage access. A tool that takes the server's vended
   credentials needs no keys of its own; one that doesn't needs read access to
   the bucket.
4. Run the provider's own example against your server's release before you
   depend on it.
