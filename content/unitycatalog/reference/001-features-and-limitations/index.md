---
title: Features, scope, and limitations
summary: What the Unity Catalog OSS server implements per resource and API, its known issues, and the features it doesn't include.
diataxis: reference
project: unitycatalog
references:
  - unityCatalogOSS
status: ready
---

The open source Unity Catalog server implements catalogs, schemas, external
and managed tables, views, volumes, functions, registered models, AWS storage
credentials, credential vending, and token-based authorization. This reference
lists what release **0.6.0** implements per resource and API, its known issues,
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
[`v0.6.0` source tree](https://github.com/unitycatalog/unitycatalog/tree/v0.6.0).

## Namespace and assets

| Feature | Status | Details | Source |
| --- | --- | --- | --- |
| Catalogs | Implemented | Create, list, get, update (comment, properties, rename), delete; forced delete removes contents. | `api/all.yaml` `/catalogs` |
| Schemas | Implemented | Same operations as catalogs, scoped to one catalog. | `api/all.yaml` `/schemas` |
| External tables | Implemented | Register a table at a location you supply. Formats: `DELTA`, `PARQUET`, `CSV`, `JSON`, `AVRO`, `ORC`, `TEXT`. Registration does not create or check data files. | `api/all.yaml` `TableType`, `DataSourceFormat` |
| Managed Delta tables | Implemented | The server allocates storage under a catalog or schema storage root and coordinates commits through the Delta API. Enabled by default (`server.managed-table.enabled=true`). Delta only. | `ServerProperties.java`, `api/delta.yaml` |
| Table updates | Partial | The UC REST API has no table update. Changes to a Delta table's schema and properties are commits through the Delta API, which also provides rename. | `api/all.yaml` `/tables/{full_name}`, `api/delta.yaml` |
| SQL views | Stored only | `VIEW` table type with a stored definition and optional dependencies. The engine runs the query. | `api/all.yaml` `TableType` |
| Metric views | Stored only | `METRIC_VIEW` table type with a stored YAML definition. The engine interprets it; Spark 4.2 with the 0.6.0 connector does. | `api/all.yaml` `TableType`, `docs/usage/metric-views.md` |
| Streaming tables, materialized views | Not implemented | Listed in the `TableType` enum and marked "not yet fully implemented". | `api/all.yaml` `TableType` |
| Volumes | Implemented | Managed and external volumes: create, list, get, update, delete. Deleting a managed volume deletes its files. | `api/all.yaml` `/volumes` |
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
| Iceberg REST API | Partial | Read only, at `/api/2.1/unity-catalog/iceberg/`: config, list and get namespaces, list tables, table exists, load table, load view, report metrics. Serves Delta tables with Iceberg metadata (UniForm). No create, commit, or drop. | `IcebergRestCatalogService.java` |

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
| Container image | Implemented | `unitycatalog/unitycatalog:v0.6.0`; includes the `uc` CLI and sample catalogs. | `Dockerfile` |
| Metadata database | Implemented | H2 by default (in the container, lost with it); PostgreSQL and MySQL through Hibernate settings. The image bundles the PostgreSQL JDBC driver; see [Configure PostgreSQL](../../how-to/configure-backend-db/index.md). | `etc/conf/hibernate.properties`, `etc/db/*-example.yml`, `PostgresDeltaCommitsCRUDTest.java`, `MySQLDeltaCommitsCRUDTest.java` |
| Web UI | Implemented | A separate React application. | `ui/` |
| Helm chart | Implemented | Kubernetes chart. Its replica count is not a high-availability guarantee. | `helm/` |

## Known issues

Behavior verified against the server and the client versions in
[Choose a client or engine](../clients-and-engines/index.md). **Affects** lists
the server releases an issue is verified in. The pages that cover each task
link here.

### Server

| Issue | Affects | What you see | Workaround |
| --- | --- | --- | --- |
| Getting a volume that doesn't exist | 0.6.0 | HTTP 500 with error code `INTERNAL`, not 404. The Python SDK raises `ServiceException`, not `NotFoundException`. | List the schema's volumes to check whether one exists. |
| Deleting managed tables and volumes | 0.6.0 | File deletion is best effort. If it fails, the server logs the error and still drops the catalog entry. | Check storage after dropping managed objects that matter. |
| Storage roots outside an external location, with authorization disabled | 0.6.0 | The server accepts the root, then fails credential requests for its objects with `FAILED_PRECONDITION` (`S3 bucket configuration not found.`). With authorization enabled, creating the catalog or schema is denied. | Check each root against `external_location list` first. |
| Force-deleting a storage credential that an external location uses | 0.6.0 | Every list of external locations fails with HTTP 500 `Credential not found`. | Force-delete the location by name: `uc external_location delete --name <name> --force true`. |
| Changing an external location's URL | 0.6.0 | Tables, volumes, and storage roots under the old URL lose their credential; vending fails with `FAILED_PRECONDITION`. | Create the new location next to the old one and move the data first. |
| SSE-KMS buckets | 0.6.0 | Vended S3 credentials can't read or write SSE-KMS objects; the session policy has no KMS actions. | Use SSE-S3. Fixed upstream in [#1774](https://github.com/unitycatalog/unitycatalog/pull/1774), not yet in a release. |
| Schema updates | 0.6.0 | Any principal with `USE CATALOG` and `USE SCHEMA` can update or rename a schema, not only its owner. | Grant those privileges with that in mind. |
| CLI help for `credential` and `external_location` | 0.6.0 | `--help` crashes with a `NullPointerException`. The commands work. | See the flags in [Configure AWS storage credentials](../../how-to/configure-aws-storage/index.md#view-storage-credentials-and-external-locations). |

### Clients and engines

| Client | Issue | What you see |
| --- | --- | --- |
| Polars, Daft, pandas (`deltalake`) | Catalog-managed tables | `Max catalog version is required when loading a catalog-managed table`. Use Spark or DuckDB; see [External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md). |
| Daft 0.7.25 | Installing `daft[unity]` | `ModuleNotFoundError: No module named 'tenacity'`: the extra doesn't declare it. Install `tenacity` alongside. |
| Daft 0.7.25 | Appending to a table on local storage | The server vends no credentials for `file://` paths, and Daft fails with `io_config was not provided to write_deltalake`. |
| Daft 0.7.25 | Tables on S3 | Not verified: against simulated S3, reads failed with `Generic S3 error`. |
| Daft 0.7.25 | Tables written by Polars | `Unsupported Arrow DataType: Utf8View`. |
| pandas (`deltalake` 1.6.6) | `uc://` names for tables on local storage | `error decoding response body`. Read the table's `storage_location` path instead. |
| DuckDB 1.5.4 | `CREATE TABLE`, `CREATE TABLE … AS SELECT`, `DROP TABLE` | `Not implemented Error`. |
| DuckDB 1.5.4 | `UPDATE`, `DELETE` | `Binder Error: Can only update base table` (or `delete from`). |
| DuckDB 1.5.4, stable `unity_catalog` | Tables with `DECIMAL` columns | `Invalid field found while parsing field: type_precision`. Install the extension from `core_nightly`. |
| `unitycatalog-ai` 0.4.0 | Functions that return a falsy value, such as `0` or `""` | `result.value` holds a "no output was produced" message instead of the value. |

## Not in Unity Catalog OSS

The following have no API in the server. Databricks Unity Catalog offers
several of them, so guides written for Databricks don't apply here:

- Lineage
- Tags and data classification
- Row filters, column masks, and attribute-based access control (ABAC)
- SCIM groups
- Audit logs
- A metrics endpoint for monitoring (such as Prometheus)
- A Delta Sharing server
- Writing through the Iceberg REST API

## Related pages

- [Choose a client or engine](../clients-and-engines/index.md): which tools
  connect, and what each one can do.
- [Namespaces, securables, and storage locations](../../explanation/uc-basics/index.md)
