---
title: Features, scope, and limitations
summary: What the Unity Catalog OSS server implements per resource and API, its known issues, and the features it doesn't include.
diataxis: reference
project: unitycatalog
references:
  - unityCatalogOSS
status: private
---

The open source Unity Catalog server implements catalogs, schemas, external
and managed tables, views, volumes, functions, registered models, AWS storage
credentials, credential vending, and token-based authorization. This reference
lists what release **0.7.0** implements per resource and API, its known issues,
and what it doesn't include. Each row links to the source that establishes
it. For what the features mean, see
[What is Unity Catalog OSS?](../../explanation/what-is-unity-catalog.md).

Status values:

- **Implemented**: the server provides the API and stores or enforces it.
- **Partial**: implemented with the restriction given in the row.
- **Stored only**: the server accepts and stores the object, and an engine
  interprets it.
- **Not implemented**: no API or behavior in the server.

Paths below are relative to the
[`v0.7.0` source tree](https://github.com/unitycatalog/unitycatalog/tree/v0.7.0).

## Namespace and assets

| Feature | Status | Details | Source |
| --- | --- | --- | --- |
| Catalogs | Implemented | Create, list, get, update (comment, properties, rename), delete; forced delete removes contents. | `api/all.yaml` `/catalogs` |
| Schemas | Implemented | Same operations as catalogs, scoped to one catalog. | `api/all.yaml` `/schemas` |
| External tables | Implemented | Register a table at a location you supply. Formats: `DELTA`, `PARQUET`, `CSV`, `JSON`, `AVRO`, `ORC`, `TEXT`. Registration does not create or check data files. | `api/all.yaml` `TableType`, `DataSourceFormat` |
| Managed Delta tables | Implemented | The server allocates storage under a catalog or schema storage root and coordinates commits through the Delta API. Enabled by default (`server.managed-table.enabled=true`). Delta only. An external table can't use a path under the managed `__unitystorage` prefix: the create fails with `contains managed storage prefix __unitystorage`. | `ServerProperties.java`, `api/delta.yaml` |
| Table updates | Partial | The UC REST API's tables API (`/tables`) has no update, so the `uc` CLI and the Python SDK, which wrap it, can't change a table. Changes to a Delta table's schema and properties are commits through the Delta API, which also provides rename. | `api/all.yaml` `/tables/{full_name}`, `api/delta.yaml` |
| SQL views | Stored only | `VIEW` table type with a stored definition and optional dependencies. The engine runs the query. | `api/all.yaml` `TableType` |
| Metric views | Stored only | `METRIC_VIEW` table type with a stored YAML definition, its columns, and at least one dependency. The server doesn't parse the YAML; Spark 4.2 with the connector computes it. No update: drop and recreate to change one. See [Manage metric views](../../how-to/metric-views/index.md). | `api/all.yaml` `TableType`, `docs/usage/metric-views.md` |
| Streaming tables, materialized views | Not implemented | Listed in the `TableType` enum and marked "not yet fully implemented". | `api/all.yaml` `TableType` |
| Volumes | Implemented | Managed and external volumes: create, list, get, update, delete. Deleting a managed volume deletes its files after `server.storage-cleanup.initial-delay` (7 days by default). | `api/all.yaml` `/volumes` |
| Functions | Partial | Create, list, get, delete. No update: replace a function by deleting and recreating it. Functions run in the caller's environment, never on the server. | `api/all.yaml` `/functions` |
| Registered models and versions | Implemented | Models: create, list, get, update, delete. Versions: create, list, get, update, finalize, delete. | `api/all.yaml` `/models` |
| Model aliases and stages | Not implemented | No alias or stage fields on models or versions. | `api/all.yaml` `/models` |
| Metastore summary | Implemented | `GET /metastore_summary` returns the metastore ID. | `api/all.yaml` |

## Storage and credentials

| Feature | Status | Details | Source |
| --- | --- | --- | --- |
| Storage credentials | Partial | AWS IAM roles only. Azure and GCP credential types are not implemented. | `api/all.yaml` `CreateCredentialRequest`, `CredentialService.java` |
| External locations | Implemented | Create, list, get, update, delete; each binds a path to a storage credential. | `api/all.yaml` `/external-locations` |
| Catalog and schema storage roots | Implemented | `storage_root` on a catalog or schema allocates managed tables and volumes; the schema's root wins. Replaces the deprecated `storage-root.*` server settings. | `ServerProperties.java` |
| Credential vending | Implemented | Temporary credentials for a table, volume, model version, or path. | `api/all.yaml` `/temporary-*-credentials`, `api/delta.yaml` |
| Per-bucket cloud settings | Implemented | Server-wide indexed settings for S3 (`s3.*`), ADLS (`adls.*`), and GCS (`gcs.*`) vending. | `etc/conf/server.properties` |

## APIs

| API | Status | Details | Source |
| --- | --- | --- | --- |
| Unity Catalog REST API | Implemented | Base path `/api/2.1/unity-catalog/`. | `api/all.yaml` |
| Delta API | Implemented | `/api/2.1/unity-catalog/delta/v1/`: configuration, staging, create, load, commit, rename, delete, table and path credentials. The earlier `/delta/preview/commits` endpoints remain. | `api/delta.yaml`, `api/all.yaml` |
| Iceberg REST API | Implemented | At `/api/2.1/unity-catalog/iceberg/`: Iceberg REST clients create, write, read, rename, and drop Iceberg tables, with vended credentials, and read Delta tables with Iceberg metadata (UniForm). Native Iceberg tables are on by default; `server.iceberg-table.enabled=false` turns creates and commits off. See [Use Iceberg REST clients with Unity Catalog](../../how-to/iceberg-rest/index.md). | `IcebergRestCatalogService.java`, `etc/conf/server.properties` |

## Identity and access

| Feature | Status | Details | Source |
| --- | --- | --- | --- |
| Authorization | Implemented, off by default | `server.authorization=enable` turns on authentication and privilege checks. | `etc/conf/server.properties` |
| External identity providers | Implemented | Token exchange for tokens from allowed issuers (`server.allowed-issuers`) and audiences (`server.audiences`). Both are required when authorization is enabled. | `etc/conf/server.properties` |
| Token lifetime | Implemented | `server.access-token-timeout` (default `PT24H`), `server.cookie-timeout` (default `P5D`). | `etc/conf/server.properties` |
| Users | Implemented | SCIM 2 Users and `/Me`. | `Scim2UserService.java`, `Scim2SelfService.java` |
| Groups | Not implemented | No SCIM Groups; privileges are granted to users. | `server/src/main/java/io/unitycatalog/server/service/` (no group service) |
| Ownership and privileges | Implemented | Grant and revoke through `/permissions`. Privileges: `CREATE CATALOG`, `USE CATALOG`, `CREATE SCHEMA`, `USE SCHEMA`, `CREATE TABLE`, `SELECT`, `MODIFY`, `CREATE FUNCTION`, `EXECUTE`, `CREATE VOLUME`, `READ VOLUME`, `CREATE MODEL`, `CREATE EXTERNAL LOCATION`, `READ FILES`, `WRITE FILES`, `CREATE EXTERNAL TABLE`, `CREATE EXTERNAL VOLUME`, `CREATE MANAGED STORAGE`, `CREATE STORAGE CREDENTIAL`. | `api/all.yaml` `Privilege` |

## Deployment

| Feature | Status | Details | Source |
| --- | --- | --- | --- |
| Container image | Implemented | `unitycatalog/unitycatalog:v0.7.0`; includes the `uc` CLI and the sample catalog `unity`. | `Dockerfile` |
| Metadata database | Implemented | H2 by default (in the container, lost with it); PostgreSQL and MySQL through Hibernate settings. The image bundles the PostgreSQL JDBC driver; see [Configure PostgreSQL](../../how-to/configure-backend-db/index.md). | `etc/conf/hibernate.properties`, `etc/db/*-example.yml`, `PostgresDeltaCommitsCRUDTest.java`, `MySQLDeltaCommitsCRUDTest.java` |
| Web UI | Implemented | A separate React application. | `ui/` |
| Helm chart | Implemented | Kubernetes chart. Its replica count is not a high-availability guarantee. | `helm/` |
| Health and metrics endpoints | Implemented | `bin/start-uc-server --obs-port <port>` serves `/livez`, `/readyz`, and Prometheus `/metrics` on a separate port. Off unless the flag is set. | `UnityCatalogServer.java` |

## Known issues

Behavior verified against the server and the client versions these docs
pin. **Affects** lists the server releases an issue is verified in. The pages
that cover each task link here.

### Server

| Issue | Affects | What you see | Workaround |
| --- | --- | --- | --- |
| Storage roots outside an external location, with authorization disabled | 0.6.0, 0.7.0 | The server accepts the root, then fails credential requests for its objects with `FAILED_PRECONDITION` (`S3 bucket configuration not found.`). With authorization enabled, creating the catalog or schema is denied. | Check each root against `external_location list` first. |
| Force-deleting a storage credential that an external location uses | 0.6.0 | Every list of external locations fails with HTTP 500 `Credential not found`. | Force-delete the location by name: `uc external_location delete --name <name> --force true`. |
| Changing an external location's URL | 0.6.0 | Tables, volumes, and storage roots under the old URL lose their credential; vending fails with `FAILED_PRECONDITION`. | Create the new location next to the old one and move the data first. |
| Schema updates | 0.6.0 | Any principal with `USE CATALOG` and `USE SCHEMA` can update or rename a schema, not only its owner. | Grant those privileges with that in mind. |
| The upstream image on Linux, with a bind-mounted folder | 0.6.0, 0.7.0 | The server runs as uid 100, so it can't write into folders your user created there, and dropping a managed table leaves the files your engine wrote. | Use the [local environment](../../how-to/run-local-server/index.md), which runs the server as the owner of its folder. |
| CLI help for `credential` and `external_location` | 0.6.0, 0.7.0 | `--help` crashes with a `NullPointerException`. The commands work. | See the flags in [Configure AWS storage credentials](../../how-to/configure-aws-storage/index.md#view-storage-credentials-and-external-locations). |

Fixed in 0.7.0, for readers upgrading from 0.6.0:

- Getting a volume that doesn't exist returns 404 `NOT_FOUND`, and the Python
  SDK raises `NotFoundException`.
- Dropping a managed table or volume no longer drops its files on a best-effort
  basis. A background worker deletes them after
  `server.storage-cleanup.initial-delay` and retries failed attempts.
- Vended S3 credentials include the KMS actions that SSE-KMS buckets need
  ([#1774](https://github.com/unitycatalog/unitycatalog/pull/1774)).

### Clients and engines

| Client | Issue | What you see |
| --- | --- | --- |
| Polars, Daft, pandas (`deltalake`) | Catalog-managed tables | `Max catalog version is required when loading a catalog-managed table`. Use Spark or DuckDB; see [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md). |
| Daft 0.7.25 | Installing `daft[unity]` | `ModuleNotFoundError: No module named 'tenacity'`: the extra doesn't declare it. Install `tenacity` alongside. |
| Daft 0.7.25 | Appending to a table on local storage | The server vends no credentials for `file://` paths, and Daft fails with `io_config was not provided to write_deltalake`. |
| Daft 0.7.25 | Tables on S3 | Not verified: against simulated S3, reads failed with `Generic S3 error`. |
| Daft 0.7.25 | Tables written by Polars | `Unsupported Arrow DataType: Utf8View`. |
| pandas (`deltalake` 1.6.6) | `uc://` names for tables on local storage | `error decoding response body`. Read the table's `storage_location` path instead. |
| pandas (`deltalake` 1.6.6) | `uc://` names for tables on S3 | Now and then `DeltaTable("uc://…")` never returns: the server vends the credentials, and no request reaches storage. Seen in about one run in ten against the local environment. Interrupt it and run it again. |
| DuckDB 1.5.6 | `CREATE TABLE`, `CREATE TABLE … AS SELECT`, `DROP TABLE` | `Not implemented Error`. |
| DuckDB 1.5.6 | `UPDATE`, `DELETE` | `Binder Error: Can only update base table` (or `delete from`). |
| DuckDB 1.5.6, `unity_catalog` | `ALTER TABLE`, `COMMENT ON TABLE` | `Not implemented Error: UCTableSet::AlterTable`, and `Binder Error: Only altering tables is supported for now.` |
| DuckDB 1.5.6, `delta` extension | Appending to a partitioned catalog-managed table with column mapping | `Not implemented Error: Inserting into a partitioned Delta table that uses column mapping is not supported`. The table doesn't change. |
| DuckDB 1.5.6, `unity_catalog` | A catalog-managed table that another engine commits to after DuckDB has read it in the same attachment | DuckDB keeps the snapshot it read: queries miss the other engine's rows, and `INSERT` fails with `TransactionException`: `TransactionContext Error: Failed to commit: Request to '…/api/2.1/unity-catalog/delta/v1/catalogs/<catalog>/schemas/<schema>/tables/<table>' failed (HTTP 409): Conflict`. The table doesn't change, and the same `INSERT` fails again until you run `DETACH` and `ATTACH` on the catalog. |
| DuckDB 1.5.4 and 1.5.6, `iceberg` extension | A second write to an Iceberg table in the same session | Intermittently, the commit fails with HTTP 409 `CommitFailedException`: `Requirement failed: branch main has changed` (or `was created concurrently`): DuckDB commits against the table as it was before its own last write. Seen on a long-running local server, not on a fresh one, so no test pins it. `SET iceberg_use_metadata_log = false` before you attach the catalog avoids it. |
| DuckDB and PyIceberg, against the local environment's simulated S3 | Reading or writing Iceberg table data | Neither reads `AWS_ENDPOINT_URL`, so requests go to AWS and fail with `403` or `INVALID_ACCESS_KEY_ID`. In DuckDB, set `s3_endpoint`, `s3_use_ssl`, and `s3_url_style`; for PyIceberg, export `PYICEBERG_CATALOG__<NAME>__S3__ENDPOINT`. See [Use Iceberg REST clients with Unity Catalog](../../how-to/iceberg-rest/index.md#connect-a-client). |
| Spark 4.1 with the Unity Catalog connector | Renaming a table or a column with `ALTER TABLE` | `ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet` for a column, and `Renaming a table is not supported yet` for a table. Create a table under the new name from a query, then drop the old one. |
| Spark 4.1 with Delta Spark 4.3.1 | Creating a managed Delta table with UniForm (`delta.universalFormat.enabledFormats=iceberg`) | IcebergCompatV2 needs deletion vectors off, and the server requires them on: `catalog requires table property 'delta.enableDeletionVectors'='true'`. An external UniForm table can be created but isn't served through Iceberg REST, so Iceberg clients can't read either kind. |
| Polars 1.44.2 | `Catalog.scan_table` on non-Delta tables | `Object at location … not found: is directory`: it reads the location as a single file. Read the folder with `scan_parquet`, `scan_csv`, or `scan_ndjson`; see [Register non-Delta external tables](../../how-to/table-storage-formats/index.md#read-the-data). |
| DuckDB 1.5.6, `unity_catalog` | Non-Delta tables | Reading the table by name fails with `… is of unsupported format 'PARQUET'` (or `'CSV'`, `'JSON'`). Read the location with `read_parquet`, `read_csv`, or `read_json`. |
| `uc` CLI 0.6.0, upstream image on x86-64 | `table read`, `table write` | `UnsatisfiedLinkError: … libsnappyjava.so: Error loading shared library ld-linux-x86-64.so.2`: the image is Alpine, and the CLI's snappy library needs glibc. The [local environment](../../how-to/run-local-server/index.md) adds `gcompat`. |
| `uc` CLI 0.6.0, 0.7.0 | `table create` for a non-Delta external table | It writes a Delta transaction log, `_delta_log/`, into the location. Readers of the files skip it; see [Register external files as tables](../../how-to/table-storage-formats/index.md#register-the-tables). |
| `uc` CLI 0.6.0 | `table read` on non-Delta tables | `Only Delta tables are supported for read operations`. |
| Spark 4.2.0 | Metric-view YAML other than version `"0.1"` | Spark reads only `version`, `source`, `filter`, `dimensions`, and `measures`, each dimension and measure only `name` and `expr`. Version 1.1 definitions written for Databricks fail with `[INVALID_METRIC_VIEW_YAML] … Invalid YAML version: 1.1`; their `joins`, `comment`, `display_name`, `format`, and `synonyms` fail with `Unrecognized field "…" … not marked as ignorable`. Join in a `source` query instead; see [Manage metric views](../../how-to/metric-views/index.md#write-a-definition). |
| Spark 4.2.0 | `CREATE OR REPLACE VIEW … WITH METRICS`, `ALTER VIEW … RENAME TO` | `Replacing a view is not supported yet`, `Renaming a view is not supported yet`. `ALTER VIEW … AS` fails with `[INTERNAL_ERROR] Unexpected ViewSchemaMode`. Drop the metric view and create it again. |
| Spark 4.2.0 | Selecting a metric view's measure without `MEASURE()` | `[INTERNAL_ERROR] The Spark SQL phase planning failed`. Wrap each measure in `MEASURE()`. |
| `unitycatalog-ai` 0.4.0 | Functions that return a falsy value, such as `0` or `""` | `result.value` holds a "no output was produced" message instead of the value. |

## Not in Unity Catalog OSS

The following have no API in the server. Databricks Unity Catalog offers
several of them, so guides written for Databricks don't apply here:

- Lineage
- Tags and data classification
- Row filters, column masks, and attribute-based access control (ABAC)
- Groups and service principals: principals are users only
- Connections to external databases
- Audit logs
- A Delta Sharing server
- In the Iceberg REST API: registering a table from a metadata file,
  multi-table transactions, views, server-side scan planning, remote request
  signing, and renaming a table into another namespace

## Related pages

- [Core concepts](../../explanation/uc-basics/index.md)
