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
earlier Unity Catalog docs covered and the ones whose maintainers document a
connection to an open-source server. It says how each one connects and links
the docs of the project that maintains it. Where these docs have a tested
guide, the row links it instead. A separate table lists the tools whose
maintainers document only Databricks Unity Catalog.

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
| Polars | Unity Catalog REST | Polars | [Python DataFrame libraries](../python-dataframes/index.md); [`polars.Catalog`](https://docs.pola.rs/api/python/stable/reference/catalog/api/polars.Catalog.html) | Tested here | 2026-10-25 |
| delta-rs (`deltalake`) | Unity Catalog REST | Delta Lake | [Python DataFrame libraries](../python-dataframes/index.md); [Load table from Unity Catalog](https://delta-io.github.io/delta-rs/latest/usage/loading-table/) | Tested here | 2026-10-25 |
| PyIceberg | Iceberg REST | Apache Iceberg | [Use Iceberg REST clients with Unity Catalog](../iceberg-rest/index.md) | Tested here | 2026-10-25 |
| MLflow | Unity Catalog REST | MLflow | [Manage registered models](../manage-models/index.md) | Tested here | 2026-10-25 |
| LangChain | Unity Catalog REST | Unity Catalog | [Use catalog functions as LangChain tools](../langchain-tools/index.md) | Tested here | 2026-10-25 |
| obstore | Unity Catalog REST | Development Seed | [Use Unity Catalog credentials with obstore](../obstore-credentials/index.md) | Tested here | 2026-10-25 |
| marimo | Unity Catalog REST, through obstore | marimo | [Use volumes as marimo remote storage](../marimo-remote-storage/index.md) | Tested here | 2026-10-25 |
| Trino | Iceberg REST | Trino | [Trino Iceberg connector, REST catalog](https://trino.io/docs/current/object-storage/metastores.html) | Maintained | 2026-10-25 |
| Spice | Unity Catalog REST | Spice AI | [Unity Catalog catalog connector](https://spiceai.org/docs/components/catalogs/unity-catalog) | Maintained | 2026-10-25 |
| PuppyGraph | Unity Catalog REST | PuppyGraph | [Querying Unity Catalog data as a graph](https://docs.puppygraph.com/getting-started/querying-unity-catalog-data-as-a-graph/) | Maintained | 2026-10-25 |
| Apache XTable | Registered by path | Apache XTable | [Unity Catalog](https://xtable.apache.org/docs/unity-catalog/) | Maintained | 2026-10-25 |
| Sail | Unity Catalog REST | LakeSail | [Unity Catalog](https://docs.lakesail.com/sail/latest/guide/catalog/unity.html) | Maintained | 2026-10-25 |
| Ladybug | Unity Catalog REST | LadybugDB | [Unity Catalog extension](https://docs.ladybugdb.com/extensions/attach/unity/) | Maintained | 2026-10-25 |
| Lance Namespace | Unity Catalog REST | Lance | [Unity Catalog](https://lance.org/format/namespace/supported-catalogs/unity/) | Maintained | 2026-10-25 |
| CelerData | Unity Catalog REST | CelerData | [Earlier Unity Catalog guide](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/docs/integrations/unity-catalog-celerdata.md) | Unverified | 2026-10-25 |
| Kuzu | Unity Catalog REST | None | [Archived repository](https://github.com/kuzudb/kuzu) | Archived | 2026-10-25 |

Notes on individual rows:

- **Trino** reads through the Iceberg REST catalog only, so it sees only the
  tables with Iceberg metadata. Set `iceberg.rest-catalog.uri` to the server's
  `/api/2.1/unity-catalog/iceberg` endpoint.
- **delta-rs** opens a table by name from a `uc://<catalog>.<schema>.<table>`
  URL. pandas reads Unity Catalog tables through it.
- **LangChain** gets catalog functions as tools from the
  `unitycatalog-langchain` package, which the Unity Catalog project maintains.
- **obstore** reads and writes storage, not tables, and never calls the server
  itself. Your code asks the server for temporary credentials and hands them to
  obstore through a credential provider, which obstore calls again before they
  expire.
- **marimo** shows any obstore store a notebook defines in its Remote Storage
  panel, so a store over a volume lets you browse and download the volume's
  files there.
- **Spice** queries Delta tables. Set its `unity_catalog_credential_vending`
  parameter to `enabled` to use the credentials the server vends instead of
  object store keys of its own.
- **Apache XTable**'s Unity Catalog guide registers a synced table in
  Databricks Unity Catalog. For an OSS server, register the Delta table XTable
  writes as in [Register an external Delta table](../register-external-table/index.md).
- **Sail** connects to `http://localhost:8080/api/2.1/unity-catalog` unless
  you set its `uri` option.
- **Ladybug** scans and copies Delta tables from one catalog's default schema.
- **Lance Namespace** stores Lance tables in Unity Catalog as external tables
  with the table property `table_type` set to `lance`.
- **CelerData**'s documentation site now redirects to a PhoenixData-branded
  site, which documents a `unity` metastore type for its Delta Lake catalog.
  Whether that is the same product, and whether it still connects to an OSS
  server, couldn't be confirmed. Open-source StarRocks doesn't document a
  Unity Catalog metastore.
- **Kuzu**'s repository was archived on 2025-10-10, so its `unity_catalog`
  extension gets no further releases. Ladybug, listed above, carries a
  `unity_catalog` extension of its own.

### Documented for Databricks Unity Catalog only

These tools' maintainers document a connection to Databricks Unity Catalog,
not to an open-source server. Nobody has checked them against an OSS server,
so don't assume they work with one. The interface is the one the provider's
guide uses.

| Tool | Interface | Maintained by | Docs | Checked |
| --- | --- | --- | --- | --- |
| ClickHouse | Unity Catalog REST; Iceberg REST | ClickHouse | [Unity Catalog](https://clickhouse.com/docs/guides/use-cases/data-warehousing/unity-catalog) | 2026-10-25 |
| Dremio Enterprise | Iceberg REST | Dremio | [Unity Catalog](https://docs.dremio.com/current/data-sources/lakehouse-catalogs/unity/) | 2026-10-25 |
| Apache Doris | Iceberg REST | Apache Doris | [Integration with Databricks Unity Catalog](https://doris.apache.org/docs/lakehouse/best-practices/doris-unity-catalog) | 2026-10-25 |
| Snowflake | Iceberg REST | Snowflake | [Configure a catalog integration for Unity Catalog](https://docs.snowflake.com/en/user-guide/tables-iceberg-configure-catalog-integration-rest-unity) | 2026-10-25 |
| lakeFS Enterprise | Registered by path | lakeFS | [Using lakeFS with Unity Catalog](https://docs.lakefs.io/integrations/unity-catalog/) | 2026-10-25 |
| Ray | Unity Catalog REST | Ray | [`ray.data.read_unity_catalog`](https://docs.ray.io/en/latest/data/api/doc/ray.data.read_unity_catalog.html) | 2026-10-25 |

- **ClickHouse** reads Delta tables through the Unity Catalog REST API and
  Iceberg tables through the Iceberg REST endpoint. Its guide marks the
  integration experimental, behind the `allow_experimental_database_unity_catalog`
  setting.
- **Dremio** reads Delta tables through their UniForm Iceberg metadata, in its
  Enterprise edition.
- **Snowflake** attaches the catalog as a catalog-linked database after you
  create the catalog integration.
- **lakeFS** exports a Delta table from a lakeFS branch and registers it as a
  read-only external table, in its Enterprise edition.
- **Ray** loads a table into a Ray Dataset with the storage credentials the
  catalog vends.

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
