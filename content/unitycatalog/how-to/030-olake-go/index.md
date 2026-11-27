---
title: Replicate a database into Iceberg tables with OLake Go
summary: Point OLake Go's Iceberg REST writer at Unity Catalog's Iceberg REST API, then replicate a database into managed Iceberg tables the catalog owns.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - icebergRestSpec
  - icebergSpec
  - s3Spec
status: draft
---

[OLake Go](https://olake.io/) replicates an operational database into
[Apache Iceberg](model:icebergSpec) tables that
[Unity Catalog](model:unityCatalogServer) governs, starting with a full load
and continuing with change data capture. It has no Unity Catalog connector of
its own: its Iceberg writer speaks the
[Iceberg REST Catalog](model:icebergRestSpec) API, and the `unity` setting it
takes is a preset of that writer. Its sources are PostgreSQL, MySQL, Oracle,
SQL Server, IBM Db2, MongoDB, Amazon S3, and Apache Kafka.

:::prerequisites
- A catalog with managed storage on S3, called `retail` in these examples.
  OLake Go sends no table `location`, so the server owns every table it writes
  and needs somewhere to put it.
- Two schemas in that catalog, both of which OLake Go creates if they don't
  already exist: one to hold the replicated tables, called `sales` here, so
  they land in `retail.sales`, and one called `test_olake`, where OLake Go
  writes a probe table on every run.
- A source OLake Go can reach, with the replication prerequisites its connector
  documents.
- [OLake Go](https://olake.io/docs/install/docker-cli/), which runs as a
  container image per source.
:::

## Write the destination configuration

OLake Go takes its writer settings in a `destination.json`. Set
`catalog_type` to `unity` and point `rest_catalog_url` at the server's Iceberg
REST endpoint:

```json
{
  "type": "ICEBERG",
  "writer": {
    "catalog_type": "unity",
    "catalog_name": "olake_iceberg",
    "rest_catalog_url": "https://<DATABRICK_WORKSPACE_URL>/api/2.1/unity-catalog/iceberg-rest",
    "iceberg_s3_path": "<CATALOG_NAME>",
    "rest_auth_type": "personal access token",
    "token": "<DATABRICK_USER_PERSONAL_ACCESS_TOKEN>",
    "arrow_writes": false
  }
}
```

What each field holds against this server:

| Field | What it holds here |
| --- | --- |
| `catalog_type` | `unity`, OLake Go's type for Unity Catalog. It reaches the server through the Iceberg REST Catalog API. |
| `catalog_name` | OLake Go's own name for the catalog. Defaults to `olake_iceberg` when empty. It does not have to match the Unity Catalog catalog. |
| `rest_catalog_url` | Databricks workspace URL followed by the Unity Catalog Iceberg REST path, e.g. `https://<workspace-url>/api/2.1/unity-catalog/iceberg-rest`. |
| `iceberg_s3_path` | **The Unity Catalog catalog name**, such as `retail`, not a bucket path. OLake Go sends it as the Iceberg `warehouse`, which the server resolves to a catalog. |
| `rest_auth_type` | One of the four authentication types OLake Go supports for Unity Catalog: `personal access token`, `oauth2 m2m`, `oauth2 u2m`, or `token federation`. |
| `token` | The credential itself. OLake Go sends it as a bearer token in the `Authorization` header. |
| `arrow_writes` | Whether to use the Arrow-based writer. Defaults to `false`. |

`iceberg_s3_path` is the field most often filled in wrongly. The server reads
it as the `warehouse` query parameter and answers `404` to any value that
isn't one of its catalog names, an `s3://` URL included.

OLake Go writes the Iceberg data files with the keys above rather than the
short-lived credentials the server vends to readers, so those keys need write
access to the catalog's storage location directly.

## Select the streams to replicate

Put the source's connection settings in a `source.json`, as its connector page
describes (for instance,
[PostgreSQL](https://olake.io/docs/connectors/postgres)) and the destination
above in a `destination.json`, both in one folder. OLake Go reads and writes
that folder as `/mnt/config`, so mount it by its full path. Then list what the
source offers:

```bash
docker run --pull=always \
  -v "<PATH_TO_CONFIG_FOLDER>:/mnt/config" \
  olakego/source-postgres:latest \
  discover \
  --config /mnt/config/source.json
```

Replace `source-postgres` with the image for your source: `source-mysql`,
`source-oracle`, `source-mssql`, `source-db2`, `source-mongodb`, `source-s3`,
or `source-kafka`.

The command writes `available_streams.json`, `selected_streams.json`, and
`streams.json` into that folder. The only file that needs to be updated is
`selected_streams.json`. Reduce `selected_streams.json` to the tables you want
to sync.

## Run the sync

```bash
docker run --pull=always \
  -v "<PATH_TO_CONFIG_FOLDER>:/mnt/config" \
  olakego/source-postgres:latest \
  sync \
  --config /mnt/config/source.json \
  --selected-streams /mnt/config/selected_streams.json \
  --available-streams /mnt/config/available_streams.json \
  --destination /mnt/config/destination.json
```

OLake Go writes each selected stream to its own Iceberg table, commits it
through the REST catalog, and keeps its read position in a `state.json`, so
the next run continues from there instead of loading the source again. The
tables it writes read like any other Iceberg table in the catalog.

OLake Go also ships a web UI that holds the same source and destination
settings; its
[quickstart](https://olake.io/docs/getting-started/quickstart/) covers it.

## Next steps

- [OLake Go's Iceberg REST catalog writer](https://olake.io/docs/writers/iceberg/catalog/rest/?rest-catalog=unity)
  documents every writer setting.
- [OLake Go's connectors](https://olake.io/docs/connectors/postgres) document
  each source's own settings and replication prerequisites.
