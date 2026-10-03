---
title: Features, scope, and limitations
summary: What the Unity Catalog OSS 0.6.0 server implements, per resource and API, and what it does not.
diataxis: reference
project: unitycatalog
references:
  - unityCatalogOSS
status: draft
---

This page lists what the open source Unity Catalog server implements in release
**0.6.0**, and what it does not. Each row links to the source that establishes
it. For what the features mean, see
[What is Unity Catalog OSS?](../../explanation/what-is-unity-catalog.md).

Status values:

- **Implemented**: the server provides the API and stores or enforces it.
- **Partial**: implemented with the restriction given in the row.
- **Stored only**: the server accepts and stores the object, and an engine
  interprets it.
- **Not implemented**: no API or behavior in the 0.6.0 server.

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
| Metadata database | Implemented | H2 by default (in the container, lost with it); PostgreSQL and MySQL through Hibernate settings. | `etc/conf/hibernate.properties`, `etc/db/*-example.yml`, `PostgresDeltaCommitsCRUDTest.java`, `MySQLDeltaCommitsCRUDTest.java` |
| Web UI | Implemented | A separate React application. | `ui/` |
| Helm chart | Implemented | Kubernetes chart. Its replica count is not a high-availability guarantee. | `helm/` |

## Not in Unity Catalog OSS 0.6.0

The following have no API in the 0.6.0 server. Databricks Unity Catalog offers
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
