---
title: Choose a client or engine
summary: Which tools connect to Unity Catalog OSS 0.6.0, through which API, what each can do, and how well that is verified.
diataxis: reference
project: unitycatalog
references:
  - unityCatalogOSS
  - duckdb
status: draft
---

Unity Catalog doesn't run queries, so you always reach it through a client or
an engine. This page helps you pick one for your task, then lists each tool's
API, its abilities, and the versions that go with server **0.6.0**.

## Pick by task

| You want to… | Use | Start with |
| --- | --- | --- |
| Explore or administer the catalog from a shell | `uc` CLI | [Create your first catalog](../../tutorials/getting-started/index.md) |
| Manage catalog objects from Python code | Python client (`unitycatalog-client`) | [Use the Python client](../../tutorials/python-client/index.md) |
| Manage catalog objects from a JVM application | Java client | Upstream [Java client docs](https://github.com/unitycatalog/unitycatalog/tree/v0.6.0/clients/java) |
| Query and write tables with SQL or DataFrames | Apache Spark with the Unity Catalog connector | [Configure Spark to use Unity Catalog](../../how-to/configure-spark/index.md), then [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md) |
| Create and query views and metric views | Spark 4.2 with the connector | Upstream [metric views guide](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/usage/metric-views.md) |
| Query tables from a laptop or notebook | DuckDB or Daft | [Read and write Unity Catalog tables from DuckDB](../../how-to/duckdb/index.md), or Daft's documentation |
| Read tables from an Iceberg engine such as Trino | Iceberg REST API, with UniForm tables | Upstream [UniForm guide](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/usage/tables/uniform.md) |
| Register and load ML models | MLflow, with Unity Catalog as the registry | Upstream [models guide](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/usage/models.md) |
| Give an AI agent catalog functions as tools | `unitycatalog-ai` and a framework integration | Upstream [AI quickstart](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/ai/quickstart.md) |

## Verification labels

Each tool in the tables below carries one label:

- **Tested here**: a page on this site runs it against a 0.6.0 server in CI.
- **Upstream**: the Unity Catalog project ships or documents it for 0.6.0. These
  docs don't test it yet.
- **Provider**: another project owns the integration and its documentation.
  Check the provider's docs for versions and limits.

## Catalog clients

These manage catalog metadata. They read and write data files only where noted.

| Client | Version | API | Abilities | Label |
| --- | --- | --- | --- | --- |
| `uc` CLI | Ships in `unitycatalog/unitycatalog:v0.6.0` | UC REST | Every resource type, plus permissions. `table read` reads Delta data, and `table write` writes random sample rows for trying things out. | Tested here |
| Python client | `unitycatalog-client==0.6.0` (async) | UC REST | Every resource type and temporary credentials. Metadata only: pair it with a storage library to read files. | Tested here |
| Java client | `io.unitycatalog:unitycatalog-client:0.6.0` | UC REST | Generated client for every UC REST endpoint. | Upstream |

## Query engines

| Engine | API | Tables | Version tuple | Label |
| --- | --- | --- | --- | --- |
| Apache Spark 4.1 | UC REST and Delta API, via the connector | Create, write, update, delete from, time-travel, and drop managed Delta tables. External tables and reading views are upstream-documented, not tested here yet. | PySpark 4.1.0 with `io.unitycatalog:unitycatalog-spark_4.1_2.13:0.6.0` and `io.delta:delta-spark_4.1_2.13:4.3.1` | Tested here |
| Apache Spark 4.0 | UC REST and Delta API, via the connector | Same as Spark 4.1 | `io.unitycatalog:unitycatalog-spark_4.0_2.13:0.6.0` with `io.delta:delta-spark_4.0_2.13:4.3.1` | Upstream |
| Apache Spark 4.2 | UC REST, via the connector | Create and query views and metric views over non-Delta sources | `io.unitycatalog:unitycatalog-spark_4.2_2.13:0.6.0`. No `delta-spark` for Spark 4.2 is available, so no Delta tables. | Upstream |
| DuckDB | UC REST and Delta API, via the `unity_catalog` extension | Read Delta tables and append to managed ones. No `CREATE TABLE`, `UPDATE`, `DELETE`, or `DROP TABLE`. | `duckdb==1.5.4` with `unity_catalog` from `core_nightly` (build `3ab8508`) | Tested here |
| Daft | UC REST, via `daft[unity]` | Read Delta tables | Per Daft's docs | Provider |
| Trino, and other Iceberg REST clients | Iceberg REST, read only | Read Delta tables that have UniForm Iceberg metadata | Trino's `iceberg` connector with `iceberg.catalog.type=rest` | Upstream |

The upstream DuckDB guide at 0.6.0 still installs an older `uc_catalog`
extension. DuckDB's current extension is `unity_catalog`. Its stable build for
DuckDB 1.5.4 can't read `DECIMAL` columns, so
[the DuckDB how-to](../../how-to/duckdb/index.md) installs the nightly build.

A managed table accepts only clients that go through the catalog. Path-based
Delta libraries such as delta-rs refuse to load one; see
[External tables and catalog-managed Delta tables](../../explanation/external-and-managed-tables/index.md).

## ML and AI libraries

| Library | Version | Abilities | Label |
| --- | --- | --- | --- |
| MLflow | Unpinned upstream (`pip install mlflow`) | Register models and versions in Unity Catalog with `mlflow.set_registry_uri("uc:http://<host>:8080")`, and load them by name. Experiment tracking stays in MLflow. | Upstream |
| `unitycatalog-ai` | `0.4.0` | Create, list, and execute Python functions registered in Unity Catalog. Functions run in your process or a subprocess. | Upstream |
| `unitycatalog-langchain`, `unitycatalog-openai`, and others | `0.4.0` | Turn catalog functions into tools for one AI framework. Integrations also exist for Anthropic, AutoGen, CrewAI, DSPy, Gemini, LiteLLM, and LlamaIndex. | Upstream |

The AI packages version independently of the server. Their 0.4.0 release is
the one in the 0.6.0 source tree.

## For integration authors

If you build an engine integration rather than use one:

- `io.delta:delta-kernel-unitycatalog:4.3.1` gives Delta Kernel based engines
  catalog-managed commits through the Delta API.
- The `unitycatalog-hadoop` module (`connectors/hadoop`) turns temporary
  credentials vended by Unity Catalog into Hadoop file system credentials for
  S3, ADLS, and GCS.

## Related pages

- [Features, scope, and limitations](../features-and-limitations/index.md): what
  the server itself implements.
- [Credential vending](../../explanation/credential-vending/index.md): how
  engines get access to storage.
