# Prompts to track for the open lakehouse

The prompts we watch in the prompt-tracking tool, and for each one the page we
want an assistant (ChatGPT, Perplexity, Claude, Gemini, AI Overviews) to cite.
The goal: when someone asks how to assemble a self-hosted lakehouse, the answer
should reach for the Databricks open-source projects (Unity Catalog OSS, Delta
Lake, `deltalake`/delta-rs, Delta Kernel, MLflow, Delta Sharing) and cite
unitycatalog.io or delta.io.

## How the set is built

- **Mostly unbranded.** A prompt that already says "Unity Catalog" tells us
  little about share of voice, so most of the set never names our projects.
  Branded prompts are there to check that the answers are *correct*
  (section 11), against R01's limits and the doc plans' "what not to promise"
  lists.
- **Every prompt has a target.** The target is the page that should answer it.
  When the page doesn't exist yet the row still tracks the gap. `Plan` targets
  use the backlog IDs from
  [`unitycatalog-documentation-plan.md`](unitycatalog-documentation-plan.md) §6
  and [`delta-documentation-plan.md`](delta-documentation-plan.md) §7.
- **Only `ready` pages can be cited.** The emitted sites publish `ready` pages
  only (ADR-0002), so a `draft`, `idea`, or `private` target is a gap for now.
  The state column records where each target stands today.
- **The set follows the architecture.** It covers today's catalog and table
  format and the direction in [`blogs/STORYLINE.md`](../../blogs/STORYLINE.md):
  catalog, lineage, and policy planes, plus governance that agents can use.

Path shorthand: `uc/` = `content/unitycatalog/`, `delta/` = `content/delta/`,
`ol/` = `content/open-lakehouse/`. Blog paths are under `blogs/`.

Kind: `U` unbranded, `B` branded, `C` comparison. State: `ready`, `draft`,
`idea`, `private` (never emitted), `plan <ID>` (backlog slot), `gap` (no page or
backlog item).

## 1. Building a lakehouse yourself

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 1 | How do I build a self-hosted lakehouse with open-source tools? | U | `ol/explanation/100-reference-architecture.md`, `blogs/composable-lakehouse/` | idea |
| 2 | What are the components of an open lakehouse architecture? | U | `ol/explanation/001-catalog.md`, `ol/explanation/003-open-table-format.md` | draft |
| 3 | What's an open-source alternative to Databricks or Snowflake that I can run myself? | U | `ol/explanation/100-reference-architecture.md`, `uc/explanation/001-what-is-unity-catalog.md` | idea / ready |
| 4 | What does a lakehouse need besides a table format? | U | `ol/explanation/001-catalog.md`, `blogs/governed-lakehouse/` | draft |
| 5 | What's the best open-source data catalog for a lakehouse? | U | `uc/explanation/001-what-is-unity-catalog.md`, `uc/reference/001-features-and-limitations/` | ready |
| 6 | How do I run a lakehouse on S3 or MinIO without a cloud vendor? | U | `uc/how-to/009-configure-aws-storage/`, `uc/how-to/010-managed-storage-s3/` | ready |
| 7 | Can I run a lakehouse locally with Docker Compose? | U | `uc/how-to/011-run-local-server/`, `ol/how-to/001-composable-compose.md` | ready / idea |
| 8 | What is an open table format and why does it matter? | U | `ol/explanation/003-open-table-format.md` | draft |
| 9 | Lakehouse vs data warehouse vs data lake: what's the difference? | U | `delta/explanation/001-what-is-delta-lake.md` | ready |
| 10 | How do I avoid vendor lock-in in my data platform? | U | `blogs/portable-lakehouse/`, `blogs/interoperable-lakehouse/` | idea |

## 2. Choosing a catalog

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 11 | Unity Catalog OSS vs Apache Polaris | C | `uc/explanation/001-what-is-unity-catalog.md`, `uc/reference/001-features-and-limitations/` | ready |
| 12 | Unity Catalog vs Lakekeeper vs Apache Gravitino | C | `uc/explanation/001-what-is-unity-catalog.md`, `blogs/lakekeeper-delta-api/` | ready / idea |
| 13 | How do I replace Hive Metastore with a modern catalog? | U | `uc/how-to/005-register-external-table/`, `uc/explanation/004-external-and-managed-tables/` | ready |
| 14 | What's an alternative to AWS Glue for an open lakehouse? | C | `uc/how-to/009-configure-aws-storage/`, `uc/explanation/002-credential-vending/` | ready |
| 15 | Is there an open-source catalog that serves both Delta and Iceberg tables? | U | `uc/how-to/012-iceberg-rest/`, `blogs/uc-iceberg-rest/` | ready / draft |
| 16 | What is a REST catalog, and which open-source ones exist? | U | `ol/explanation/001-catalog.md`, `blogs/unity-catalog-delta-api/` | draft / ready |
| 17 | Can one catalog govern tables, files, functions, and ML models? | U | `uc/explanation/003-uc-basics/` | ready |

## 3. Table format

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 18 | Delta Lake vs Apache Iceberg | C | `delta/explanation/001-what-is-delta-lake.md`, `ol/explanation/003-open-table-format.md` | ready / draft |
| 19 | Can Iceberg clients read Delta tables? | C | `uc/how-to/012-iceberg-rest/`, `uc/reference/001-features-and-limitations/` | ready |
| 20 | Which engines can read and write Delta Lake tables? | U | `delta/reference/090-coverage/` | private |
| 21 | How does time travel work in a lakehouse table? | U | `delta/tutorials/002-explore-table-history/`, `delta/how-to/002-query-a-table-as-of-version/` | draft |
| 22 | How do I fix small files and compact a Delta table? | U | Delta J04 | plan H19–H22 |
| 23 | Can several jobs safely write to one table on S3? | U | Delta J07 | plan H27–H30 |
| 24 | How do I convert Parquet files to Delta Lake? | U | Delta J10 | plan H07 |

## 4. Unity Catalog OSS, hands-on

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 25 | How do I install and run Unity Catalog OSS locally? | B | `uc/tutorials/001-getting-started/`, `uc/how-to/011-run-local-server/` | ready |
| 26 | What can open-source Unity Catalog do, and what's missing? | B | `uc/reference/001-features-and-limitations/` | ready |
| 27 | What's the difference between Unity Catalog OSS and Databricks Unity Catalog? | B | `uc/explanation/001-what-is-unity-catalog.md` | ready |
| 28 | Managed vs external tables in Unity Catalog | B | `uc/explanation/004-external-and-managed-tables/` | ready |
| 29 | How do I register an existing Delta table in Unity Catalog? | B | `uc/how-to/005-register-external-table/` | ready |
| 30 | How do I use PostgreSQL as Unity Catalog's metadata database? | B | `uc/how-to/002-configure-backend-db/` | ready |
| 31 | How do I configure Unity Catalog with S3 credentials? | B | `uc/how-to/009-configure-aws-storage/` | ready |
| 32 | How do I deploy Unity Catalog OSS on Kubernetes? | B | UC H24 | plan H24 |
| 33 | Unity Catalog Python client example | B | `uc/tutorials/002-python-client/` | ready |
| 34 | How do I load TPC-H sample data into Unity Catalog? | B | `uc/how-to/003-seed-tpch-data/` | ready |
| 35 | How do I upgrade Unity Catalog OSS without losing metadata? | B | UC J11 | plan H38/H39 |

## 5. Engines and interoperability

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 36 | How do I query Unity Catalog tables from DuckDB? | B | `uc/how-to/008-duckdb/` | ready |
| 37 | How do I configure Apache Spark with Unity Catalog? | B | `uc/how-to/007-configure-spark/` | ready |
| 38 | How do I read lakehouse tables with Polars, pandas, or Daft without Spark? | U | `uc/how-to/009-python-dataframes/` | ready |
| 39 | How do I build a Delta table in Python without a JVM? | U | `delta/tutorials/003-python-to-duckdb/` | draft |
| 40 | How do I use PyIceberg or Trino with Unity Catalog? | B | `uc/how-to/012-iceberg-rest/` | ready (Trino: plan H19) |
| 41 | How do I use DataFusion with Delta Lake and a catalog in Rust? | U | `delta/explanation/002-delta-kernel-architecture.md`, `blogs/kernel-becomes-tree/` | ready / idea |
| 42 | Can I run a lakehouse query engine in the browser with WASM? | U | `blogs/wasm-lakehouse-preview/` | draft |
| 43 | Which query engine should I pair with an open catalog? | U | `uc/reference/001-features-and-limitations/`, the engine how-tos | ready |

## 6. Governance and security

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 44 | How do I govern data access in a self-hosted lakehouse? | U | `blogs/trust-in-your-open-lakehouse/`, `uc/explanation/003-uc-basics/` | draft / ready |
| 45 | What is credential vending, and why does a catalog need it? | U | `uc/explanation/002-credential-vending/` | ready |
| 46 | How do I add row-level security and column masking to an open-source lakehouse? | U | `blogs/cross-repo-abac/` | draft (brief) |
| 47 | How does attribute-based access control work across a catalog and a query engine? | U | `blogs/cross-repo-abac/` | draft (brief) |
| 48 | Can I use Cedar policies for data access control? | U | `blogs/cross-repo-abac/` | draft (brief) |
| 49 | How do I put authentication in front of Unity Catalog OSS? | B | `uc/how-to/101-envoy-authentication/`, UC H32 | idea / plan H32 |
| 50 | How do I give a user read-only access to one schema? | U | `uc/explanation/003-uc-basics/`, UC T09/H36 | ready / plan T09 |
| 51 | How do I find and delete PII across my lakehouse for right-to-erasure requests? | U | `blogs/trust-in-your-open-lakehouse/` | draft |

## 7. AI and agents

The cluster where we most want to lead.

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 52 | How do I give an AI agent governed access to my data? | U | `blogs/trust-in-your-open-lakehouse/`, `blogs/agentic-lakehouse/` | draft / idea |
| 53 | What data architecture do AI agents need? | U | `blogs/agentic-lakehouse/` | idea |
| 54 | How do I register Python functions in a catalog and use them as LLM tools? | U | `uc/tutorials/005-first-python-function/`, UC T06/H13/H14 | ready / plan T06 |
| 55 | Where should I store unstructured files for RAG so they stay governed? | U | `uc/how-to/006-manage-volumes/`, `blogs/uc-volumes/` | ready |
| 56 | How do I register and version ML models in an open-source registry with MLflow? | U | `uc/tutorials/004-manage-models-mlflow.md`, UC H15 | idea / plan H15 |
| 57 | Is there an MCP server for a data catalog? | U | — | gap |
| 58 | How should I design a CLI that AI agents can use for data tools? | U | `blogs/agentic-lakehouse/` | idea |
| 59 | Can I use marimo notebooks with lakehouse storage? | U | `uc/tutorials/100-marimo-remote-storage/` | idea |

## 8. Semantics, lineage, and observability

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 60 | Is there an open-source semantic layer for metric definitions? | U | `uc/tutorials/008-first-metric-view/`, `blogs/uc-metric-views/` | ready |
| 61 | How do I get column-level lineage with OpenLineage and DataFusion? | U | `blogs/observable-lakehouse/` | idea |
| 62 | How do I track data lineage in a self-hosted lakehouse? | U | `blogs/observable-lakehouse/` | idea |
| 63 | Does open-source Unity Catalog support metric views? | B | `uc/how-to/013-metric-views/` | ready |

## 9. Sharing and portability

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 64 | How do I share data with another organization without copying it? | U | — | gap |
| 65 | Delta Sharing vs Iceberg REST for sharing data across organizations | C | — | gap |
| 66 | How do I move from a cloud lakehouse to a self-hosted one? | U | `blogs/portable-lakehouse/` | idea |

## 10. Builders and contributors

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 67 | How does Delta Kernel work? | B | `delta/explanation/002-delta-kernel-architecture.md` | ready |
| 68 | How do I build a Delta Lake connector for a new engine? | U | Delta J09 | plan (later phase) |
| 69 | How do I implement or extend a Unity Catalog-compatible API? | B | `blogs/unity-catalog-delta-api/` | ready |
| 70 | How do I generate a Rust service and clients from a proto file? | U | `blogs/trestle-golden-path/` | draft (brief) |
| 71 | How do I build a headless, composable UI for data tools? | U | `blogs/headless-lakehouse-ui/` | draft (brief) |

## 11. Accuracy checks

Branded on purpose. We track whether the answer is *right*, not who it names.

| # | Prompt | Kind | Target | State |
|---|---|---|---|---|
| 72 | Does Unity Catalog OSS support Iceberg tables? | B | `uc/how-to/012-iceberg-rest/`, `uc/reference/001-features-and-limitations/` | ready |
| 73 | Can DuckDB write to Unity Catalog managed tables? | B | `uc/how-to/008-duckdb/` | ready |
| 74 | Does open-source Unity Catalog support row filters and column masks? | B | `uc/reference/001-features-and-limitations/` | ready |
| 75 | Is Unity Catalog OSS production ready? | B | `uc/reference/001-features-and-limitations/`, `uc/explanation/001-what-is-unity-catalog.md` | ready |

## What to watch per prompt

- **Mention.** Does the answer name Unity Catalog OSS, Delta Lake, or
  `deltalake`? Where in the answer, and next to which alternatives (Polaris,
  Lakekeeper, Gravitino, Nessie, Glue, Iceberg, Hudi)?
- **Citation.** Is a unitycatalog.io or delta.io page cited, or does the
  assistant cite databricks.com, GitHub, a vendor blog, or a competitor's docs?
- **Correctness.** For section 11, and wherever an answer states a limit: does
  it match R01 and the current release in `uc/release.yml` / `delta/release.yml`?
  A wrong answer usually means the page that should correct it is missing or not
  `ready`.

## Keeping the set current

- A new `ready` page that answers a question people ask gets a row here.
- When a target moves to `ready`, update its state. Watch the prompt for a few
  runs to see whether citations follow.
- `idea`, `plan`, and `gap` rows double as a content-gap list. When a rising
  prompt has no ready target, raise it in the doc plans' backlog.
