---
title: Features, scope, and limitations
summary: What the Unity Catalog OSS server implements per resource and API, its known issues, and the features it doesn't include.
diataxis: reference
project: unitycatalog
references:
  - unityCatalogServer
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
| SQL views | Stored only | `VIEW` table type with a stored definition, at least one column, and optional dependencies, which must exist. The server doesn't parse the definition: one that isn't valid SQL registers and fails only at query time. Dependencies are checked at create time only: dropping a source table leaves the view listed, and querying it fails with `TABLE_OR_VIEW_NOT_FOUND`. Evidence: `explanation/007-views-and-metric-views/snippets/stored_definitions.py`. The engine runs the query. Spark 4.2 with the connector creates views; Spark 4.1 only reads them. No update: drop and recreate to change one. See [Manage SQL views](../../how-to/sql-views/index.md). | `api/all.yaml` `TableType`, [`TableRepository.java`](https://github.com/unitycatalog/unitycatalog/blob/2b17f3b5a1d06c0adbf22f4c11ea888c01a36415/server/src/main/java/io/unitycatalog/server/persist/TableRepository.java#L972-L1000) `validateViewLike` |
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

### Delta API

| Issue | Affects | What you see | Workaround |
| --- | --- | --- | --- |
| A log-represented `set-properties` on a managed table with no `add-commit` | 0.7.0 | The server accepts it without a new version, and the Delta log keeps the old value: setting `delta.enableDeletionVectors` to `false` leaves it `true` in the log. The specification calls such a request a client error. The catalog and the log diverge. | Send changes the Delta log represents only with the `add-commit` that writes them. See [The Unity Catalog Delta API](../../explanation/delta-api/index.md#metadata-changes-travel-with-add-commit). |
| `GET /delta/v1/config` ignores `protocol-versions` | 0.7.0 | The server answers protocol version `1.0` whatever the client offers, even `protocol-versions=2.0`, where the specification has it select the highest version both sides support. | Check that the returned `protocol-version` is one you offered. Treat any other answer as an unsupported server. |

<!-- Evidence for both Delta API rows: explanation/006-delta-api/snippets/delta_api_semantics.py (config block; last block). -->

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
| DuckDB 1.5.6 | `CREATE TABLE`, `CREATE TABLE … AS SELECT`, `DROP TABLE` | `Not implemented Error: UCTableSet::CreateTable`, `Not implemented Error: UnityCatalog PlanCreateTableAs`, and `Not implemented Error: UCTableSet::DropEntry`. |
| DuckDB 1.5.6 | `UPDATE`, `DELETE` | `Binder Error: Can only update base table` (or `delete from`). |
| DuckDB 1.5.6, `unity_catalog` | `ALTER TABLE`, `COMMENT ON TABLE` | `Not implemented Error: UCTableSet::AlterTable`, and `Binder Error: Only altering tables is supported for now.` |
| DuckDB 1.5.6, `delta` extension | Appending to a partitioned catalog-managed table with column mapping | `Not implemented Error: Inserting into a partitioned Delta table that uses column mapping is not supported`. The table doesn't change. |
| DuckDB 1.5.6, `unity_catalog` | A catalog-managed table that another engine commits to after DuckDB has read it in the same attachment | DuckDB keeps the snapshot it read: queries miss the other engine's rows, and `INSERT` fails with `TransactionException`: `TransactionContext Error: Failed to commit: Request to '…/api/2.1/unity-catalog/delta/v1/catalogs/<catalog>/schemas/<schema>/tables/<table>' failed (HTTP 409): Conflict`. The table doesn't change, and the same `INSERT` fails again until you run `DETACH` and `ATTACH` on the catalog. |
| DuckDB 1.5.6, `iceberg` extension | A second write to an Iceberg table in the same session | Intermittently, the commit fails with HTTP 409 `CommitFailedException`: `Requirement failed: branch main has changed` (or `was created concurrently`): DuckDB commits against the table as it was before its own last write. Seen on a long-running local server, not on a fresh one, so no test pins it. `SET iceberg_use_metadata_log = false` before you attach the catalog avoids it. |
| DuckDB and PyIceberg, against the local environment's simulated S3 | Reading or writing Iceberg table data | Neither reads `AWS_ENDPOINT_URL`, so requests go to AWS and fail with `403` or `INVALID_ACCESS_KEY_ID`. In DuckDB, set `s3_endpoint`, `s3_use_ssl`, and `s3_url_style`; for PyIceberg, export `PYICEBERG_CATALOG__<NAME>__S3__ENDPOINT`. See [Use Iceberg REST clients with Unity Catalog](../../how-to/iceberg-rest/index.md#connect-a-client). |
| Spark 4.1 with the Unity Catalog connector | Renaming a table or a column with `ALTER TABLE` | `ALTER TABLE RENAME COLUMN is not supported for Unity Catalog tables yet` for a column, and `Renaming a table is not supported yet` for a table. Create a table under the new name from a query, then drop the old one. |
| Spark 4.1 with the Unity Catalog connector | Creating, replacing, renaming, or dropping a view, and `SHOW VIEWS` | `CREATE VIEW`, `CREATE OR REPLACE VIEW`, and `SHOW VIEWS` fail with `[MISSING_CATALOG_ABILITY.VIEWS] Catalog samples does not support views.` `ALTER VIEW … AS` and `DROP VIEW` fail with ``[UNSUPPORTED_FEATURE.CATALOG_OPERATION] The feature is not supported: Catalog `samples` does not support views.`` `ALTER VIEW … RENAME TO` fails with `Cannot rename a table with ALTER VIEW. Please use ALTER TABLE instead.` Spark 4.1 reads views, both those Spark 4.2 created and those registered through the REST API, and lists them with `SHOW TABLES`. Create, change, and drop views with Spark 4.2 or the REST API. See [Manage SQL views](../../how-to/sql-views/index.md#read-views-from-spark-41). |
| Spark 4.1 with Delta Spark 4.3.1 | Creating a managed Delta table with UniForm (`delta.universalFormat.enabledFormats=iceberg`) | IcebergCompatV2 needs deletion vectors off, and the server requires them on: `catalog requires table property 'delta.enableDeletionVectors'='true'`. An external UniForm table can be created but isn't served through Iceberg REST, so Iceberg clients can't read either kind. |
| Polars 1.44.2 | `Catalog.scan_table` on non-Delta tables | `Object at location … not found: is directory`: it reads the location as a single file. Read the folder with `scan_parquet`, `scan_csv`, or `scan_ndjson`; see [Register non-Delta external tables](../../how-to/table-storage-formats/index.md#read-the-data). |
| DuckDB 1.5.6, `unity_catalog` | Non-Delta tables | Reading the table by name fails with `… is of unsupported format 'PARQUET'` (or `'CSV'`, `'JSON'`). Read the location with `read_parquet`, `read_csv`, or `read_json`. |
| `uc` CLI 0.6.0, upstream image on x86-64 | `table read`, `table write` | `UnsatisfiedLinkError: … libsnappyjava.so: Error loading shared library ld-linux-x86-64.so.2`: the image is Alpine, and the CLI's snappy library needs glibc. The [local environment](../../how-to/run-local-server/index.md) adds `gcompat`. |
| `uc` CLI 0.6.0, 0.7.0 | `table create` for a non-Delta external table | It writes a Delta transaction log, `_delta_log/`, into the location. Readers of the files skip it; see [Register external files as tables](../../how-to/table-storage-formats/index.md#register-the-tables). |
| `uc` CLI 0.6.0 | `table read` on non-Delta tables | `Only Delta tables are supported for read operations`. |
| Spark 4.2.0 | Metric-view YAML other than version `"0.1"` | Spark reads only `version`, `source`, `filter`, `dimensions`, and `measures`, each dimension and measure only `name` and `expr`. Version 1.1 definitions written for Databricks fail with `[INVALID_METRIC_VIEW_YAML] … Invalid YAML version: 1.1`; their `joins`, `comment`, `display_name`, `format`, and `synonyms` fail with `Unrecognized field "…" … not marked as ignorable`. Join in a `source` query instead; see [Manage metric views](../../how-to/metric-views/index.md#write-a-definition). |
| Spark 4.2.0 | `CREATE OR REPLACE VIEW … WITH METRICS`, `ALTER VIEW … RENAME TO` | `Replacing a view is not supported yet`, `Renaming a view is not supported yet`. `ALTER VIEW … AS` fails with `[INTERNAL_ERROR] Unexpected ViewSchemaMode`. Drop the metric view and create it again. |
| Spark 4.2.0 | `CREATE OR REPLACE VIEW`, `ALTER VIEW … AS`, `ALTER VIEW … SET TBLPROPERTIES`, `ALTER VIEW … RENAME TO` on a SQL view | `Replacing a view is not supported yet` for the first three, `Renaming a view is not supported yet` for the rename. Drop the view and create it again; see [Manage SQL views](../../how-to/sql-views/index.md#change-or-rename-a-view). |
| Spark 4.2.0 | Selecting a metric view's measure without `MEASURE()` | `[INTERNAL_ERROR] The Spark SQL phase planning failed`. Wrap each measure in `MEASURE()`. |
| `unitycatalog-ai` 0.4.0 | Functions that return a falsy value: `0`, `False`, `""`, `None`, `[]`, `{}` | `result.value` holds a "no output was produced" message instead of the value. Through a LangChain tool too. Evidence: `how-to/017-langchain-tools/snippets/tools.py` region `falsy`, `tool_types.py`. |
| `unitycatalog-ai` 0.4.0, Python 3.13 | A function that raises | The result's `error` holds the "no output was produced" notice, with no traceback: the sandbox blocks the `import sys` that 3.13's `traceback` does lazily. Use Python 3.12. Evidence: `how-to/017-langchain-tools/snippets/error_py313.py`. |
| `unitycatalog-ai` 0.4.0 | `create_python_function` with `list[int]` or `dict[str, int]` hints | The stored `type_json` has no element or value type, so a LangChain tool tells the model `items: {}` or `additionalProperties: true`. Register the parameter explicitly with `ARRAY<BIGINT>` instead. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py` `_schema_checks`. |
| `unitycatalog-ai` 0.4.0 | `create_python_function` with `decimal.Decimal` or `datetime.timedelta` hints | Registration fails a `FunctionParameterInfo` validation on `type_name` (`Input should be 'BOOLEAN', …`). Register the parameter explicitly with `create_function`. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py`. |
| `unitycatalog-ai` 0.4.0, `unitycatalog-langchain` 0.4.0 | A `bool` parameter with a default, in a function called through a LangChain tool (`tool.invoke` or an async adapter) | The default registers as text (`"False"` or `"True"`) and reaches the tool schema as that string. A call that leaves the argument out gets the text default passed explicitly, and the client's type check rejects it: `Parameter x should be of type ColumnTypeName.BOOLEAN (corresponding python type <class 'bool'>), but got <class 'str'>`. Passing the argument works, and a direct `execute_function_async` call converts the default back and works. Give `BOOLEAN` parameters no default in functions you use as tools. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py` `echo_flag`, `echo_flag_true`; counter-evidence for the direct call: `how-to/018-manage-python-functions/snippets/functions.py`, asserts after region `register`. Source: [`type_utils.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/utils/type_utils.py#L66-L69), [`function_processing_utils.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/utils/function_processing_utils.py#L401-L439), [`client.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/client.py#L864) (direct call); [`function_processing_utils.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/utils/function_processing_utils.py#L229-L235), [`toolkit.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/integrations/langchain/src/unitycatalog/ai/langchain/toolkit.py#L96-L98), [`client.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/client.py#L843-L853) (tool path). |
| `unitycatalog-ai` 0.4.0 | Calling a function twice on the same client with a list or dict argument | Every call after the first returns `{"error": "… TypeError: unhashable type: 'list'"}` (or `'dict'`): the client caches the rebuilt function with `lru_cache`. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py`, ARRAY and MAP rows. |
| `unitycatalog-ai` 0.4.0 | `INTERVAL` parameters whose type text is upper case | `ValueError: Invalid interval type text: INTERVAL DAY TO SECOND, expecting 'interval day to second'`: the check is case-sensitive. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py`, INTERVAL rows. |
| `unitycatalog-ai` 0.4.0 | Functions that return `DATE`, `TIMESTAMP`, `DECIMAL`, or `BINARY` | `FunctionExecutionResult.to_json()` raises `TypeError: Object of type date is not JSON serializable` (or `datetime`, `Decimal`, `bytes`), so a LangChain tool raises instead of returning a result. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py` `RETURNS`. |
| `unitycatalog-ai` 0.4.0 | Running a function that another client replaced | A client caches each function by name the first time it runs it, and only a replace from that same client clears the entry. Other clients keep running the old body, though `get_function_async` returns the new one. Call `client.clear_function_cache()` in each of them; see [Manage Python functions](../../how-to/manage-python-functions/index.md#replace-a-function). Evidence: `how-to/018-manage-python-functions/snippets/caching.py` region `clear-cache`. |
| `unitycatalog-ai` 0.4.0 | Running two functions with the same short name in one client, such as `tools.pricing.shipping_cost` and `legacy.pricing.shipping_cost` | The cache key is the short name, so the client runs whichever function it cached first for both full names. Use a separate client for each, or clear the cache between them. Evidence: `how-to/018-manage-python-functions/snippets/caching.py`, asserts after region `clear-cache`. |
| `unitycatalog-ai` 0.4.0 | Running a function that was deleted | `execute_function_async` raises `AttributeError: 'NoneType' object has no attribute 'input_params'`, not a not-found error, also in a client that cached the function. `get_function_async` returns `None`. Evidence: `how-to/018-manage-python-functions/snippets/functions.py`, asserts after region `delete`; `caching.py`. |
| `unitycatalog-ai` 0.4.0 | `create_python_function` with `replace=True` when the create fails | The client gets, deletes, then creates the function, so a failed create leaves no function under the name. The server stores a comment of at most 65,535 characters ([`FunctionInfoDAO.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/persist/dao/FunctionInfoDAO.java#L35)), so a replace with a 70,000-character docstring fails with HTTP 500 after the delete. Register the function again. Evidence: `how-to/018-manage-python-functions/snippets/functions.py` `_replace_is_not_atomic`. |
| `unitycatalog-ai` 0.4.0 | `get_function_source` and `get_function_as_callable` | The rebuilt function has no parameter defaults, and its docstring is regenerated with a `Returns:` section. Calling the callable without an argument that had a default raises `TypeError`. Evidence: `how-to/018-manage-python-functions/snippets/functions.py`, asserts after regions `get-source` and `as-callable`. |
| `unitycatalog-langchain` 0.4.0 | `create_agent` with `UCFunctionToolkit(...).tools` and the Unity Catalog function client | `invoke` fails with `RuntimeError: … attached to a different loop`, and `ainvoke` with `Timeout context manager should be used inside a task`: LangGraph runs the tools in worker threads, and the client's connection belongs to the creating event loop. Give each tool an async `coroutine` that calls `execute_function_async`; see [Use catalog functions as LangChain tools](../../how-to/langchain-tools/index.md#give-the-tools-to-an-agent). Evidence: `how-to/017-langchain-tools/snippets/tools.py`, asserts after region `falsy`, regions `async-tools` and `agent`. |
| `unitycatalog-langchain` 0.4.0 | `DATE`, `BINARY`, `DECIMAL`, `INTERVAL`, `STRUCT`, and `TIMESTAMP` parameters through `tool.invoke` | The tool serializes its arguments with `json.dumps(…, default=str)` before the client's type check, so a `date`, `bytes`, `Decimal`, `timedelta`, or dict fails with `Parameter x should be of type ColumnTypeName.DATE … but got <class 'str'>` (or the type in question), and a `datetime` reaches the function as a `str`. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py`, `invoke` path. |
| `unitycatalog-langchain` 0.4.0 | `STRUCT` parameters through an async adapter | The client gets the tool schema's generated pydantic model (`function_processing_utils.Struct_…`) instead of a dict, and its type check rejects it. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py`, STRUCT row. |
| `unitycatalog-langchain` 0.4.0 | JSON arguments, as a model sends them, through an async adapter | They aren't converted to the parameter type: `DATE` `"2026-01-02"` and `INTERVAL` `"P1D"` fail the type check, `TIMESTAMP` `"2026-01-02T03:04:05"` arrives as a `str`, and a `BINARY` string arrives as its UTF-8 bytes, not base64-decoded. `DECIMAL` as a string works. Evidence: `how-to/017-langchain-tools/snippets/tool_types.py`, `adapter` path. |
| `unitycatalog-langchain` 0.4.0 | A toolkit without `client=` | The toolkit uses the global default from `set_uc_function_client`. If none is set and Databricks Connect with serverless support is installed, it tries to create a Databricks client and, if that works, uses it without an error. Otherwise it raises `ValueError: No client provided, either set the client when creating a toolkit or set the default client using unitycatalog.ai.core.client.set_uc_function_client(client).` Always pass `client=`. Evidence: `how-to/017-langchain-tools/snippets/tools.py`, first assert (the error); the fallback from `ai/core/src/unitycatalog/ai/core/base.py` `get_uc_function_client`, `_is_databricks_client_available`. |
| `unitycatalog-langchain` 0.4.0 with `langgraph-prebuilt` 1.0.9 through 1.0.13 | `import langchain.agents` | Each fails with `ImportError: cannot import name 'ExecutionInfo' from 'langgraph.runtime'` (checked 2026-10-22): the integration caps `langchain<=1.2.10`, which holds `langgraph` below what those releases need. Pin `langgraph-prebuilt==1.0.8`. Evidence: `how-to/017-langchain-tools/snippets/tools.py` PEP 723 comment, and a check of each release on 2026-10-22. |

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
