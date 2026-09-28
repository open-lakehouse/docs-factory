# Open-source catalog comparison: Unity Catalog, Polaris, Lakekeeper, Gravitino

_Snapshot as of 2026-09-28. Covers only the **open-source** projects: not managed
Databricks Unity Catalog, Snowflake Open Catalog / Horizon, or Vakamo's hosted
offerings. Where Lakekeeper's commercial edition (Lakekeeper+) matters, it is marked
separately._

## TL;DR

The four projects look alike from a distance: each is a "catalog for the open
lakehouse". But each one is built around a different primary job, and that choice
explains most of the table below.

- **Unity Catalog OSS** is a **multimodal asset catalog with a Delta-native core.**
  It is the only one that treats tables, volumes (files), functions, and ML models
  as first-class governed objects under a single `catalog.schema.asset` namespace. It
  also has a Delta REST API with catalog-managed commits, and a semantic layer
  (metric views). It is thin on operational governance: no federation, no audit or
  event stream, no metrics endpoint, no multi-tenancy. Its Iceberg REST surface is
  **read-only** (it serves UniForm).
- **Apache Polaris** is the **reference-grade Iceberg REST catalog under ASF
  governance.** It has the most complete Iceberg REST implementation, including
  multi-table commits, views, and notifications. It adds realm-based multi-tenancy,
  catalog federation (Iceberg REST, HMS, BigQuery), a policy store for maintenance
  intent, and OPA/Ranger authorizers. Non-Iceberg formats are "generic tables":
  registered entries without credential vending.
- **Lakekeeper** is an **Iceberg REST catalog built around access control.** It ships
  as a single Rust binary with OpenFGA authorization, a Trino OPA bridge, CloudEvents
  (NATS/Kafka), soft-delete/undrop, and projects→warehouses multi-tenancy. It is
  designed to be embedded and extended through Rust traits. Several "day-2" features
  (Cedar policies, snapshot expiry and orphan-file removal, IdP role sync, admission
  gates) are **Lakekeeper+ only**.
- **Apache Gravitino** is a **federated "metadata lake".** It proxies existing
  systems (Hive Metastore, Glue, JDBC databases, Kafka, Iceberg, Paimon, Hudi,
  filesets) instead of owning the data, and puts one RBAC/tag/policy/lineage layer
  across them. It is the broadest in *what* it can catalog (including Kafka topics
  and relational databases), with Iceberg REST and Lance REST servers bundled. Many
  individual integrations are shallower (Hudi read-only, Delta metadata-only,
  maintenance in alpha).

## How the projects differ

**Ownership model: owner vs. proxy.** Unity Catalog, Polaris, and Lakekeeper *own*
the metadata of the tables they manage. They are the source of truth that engines
commit against. Gravitino is mainly a *proxy*: it reads and writes metadata in the
systems that already hold it (HMS, Glue, MySQL, …) and adds governance on top. It
does ship its own Iceberg REST server, so it can also act as an owner for Iceberg.
This split is the single most useful lens. Buyers who want to consolidate usually
compare UC, Polaris, and Lakekeeper. Buyers who want to govern a heterogeneous estate
where it already lives look at Gravitino.

**Format center of gravity.** Polaris and Lakekeeper are Iceberg-first. Both have
added a "generic table" API so Delta, Lance, CSV, etc. can be *registered*, but the
catalog does not interpret those formats' logs. Unity Catalog is Delta-first. It has
a dedicated Delta REST API (staging tables, server-validated commits, credential
vending), and it reaches Iceberg readers through UniForm and a read-only Iceberg REST
endpoint. Gravitino is format-plural through its connectors, but its depth varies by
format.

**Beyond tables.** UC is the only one with volumes, functions, and ML models all as
governed assets, plus metric views as a semantic layer. Gravitino comes closest: it
has filesets (GVFS), UDFs, a model catalog, and Kafka topics. Polaris and Lakekeeper
are essentially table/view catalogs. Lakekeeper's "dataset" generic tables and
Polaris's new semantic-model entity are narrow exceptions.

**Access control architecture.**
- UC: a built-in grant model (securable × privilege × principal), with no external
  policy engine.
- Polaris: a two-tier RBAC (principal roles → catalog roles) that can hand off to
  OPA or Ranger.
- Lakekeeper: relationship-based authorization in OpenFGA (Cedar in Lakekeeper+), plus
  a Trino OPA bridge to enforce in-engine.
- Gravitino: RBAC with explicit DENY, pushed down to Apache Ranger.

**None of the four ships row filters or column masking in OSS.** Fine-grained data
access control is an open field in every project.

**Operability.** Polaris, Lakekeeper, and Gravitino all ship Prometheus metrics and
health endpoints, and Polaris and Lakekeeper add event streams. UC OSS has none of
this yet; a proposal is open.

**Governance and velocity.**
- Polaris and Gravitino are ASF top-level projects (Gravitino graduated June 2025,
  Polaris February 2026).
- UC is an LF AI & Data project.
- Lakekeeper is vendor-led by Vakamo, under a CLA with an open-core split.

## Project facts

| | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| Latest release | v0.6.0 (2026-08-20) | [1.8.0](https://github.com/apache/polaris/releases/tag/apache-polaris-1.8.0) (2026-09-28) | [v0.13.6](https://github.com/lakekeeper/lakekeeper/releases/tag/v0.13.6) (2026-09-22) | [1.3.0](https://github.com/apache/gravitino/releases/tag/v1.3.0) (2026-06-29) |
| License | Apache-2.0 | Apache-2.0 | Apache-2.0 (open core; Lakekeeper+ is commercial) | Apache-2.0 |
| Governance | LF AI & Data | ASF TLP ([graduated 2026-02-19](https://polaris.apache.org/blog/2026/02/19/apache-polaris-graduates-to-top-level-project/)) | Vendor-led (Vakamo), CLA | ASF TLP (graduated 2025-06-03) |
| Language | Java (server), Python/TS clients & UI | Java 21 / Quarkus | Rust (single binary) | Java; Python client & MCP server |
| Metadata store | H2 (default), MySQL, PostgreSQL | PostgreSQL (JDBC), CockroachDB; MongoDB (beta) — [metastores](https://polaris.apache.org/releases/1.8.0/metastores/) | PostgreSQL ≥15; secrets in Postgres or Vault — [config](https://docs.lakekeeper.io/docs/latest/configuration/#persistence-store) | H2 (dev only), MySQL, PostgreSQL — [relational backend](https://gravitino.apache.org/docs/latest/how-to-use-relational-backend-storage) |
| Primary API surface | UC REST API + Delta REST API; read-only Iceberg REST | Iceberg REST + management, generic-table, policy, and notification APIs | Iceberg REST + management + generic-table APIs | Gravitino REST API + Iceberg REST + Lance REST |
| Repo | [unitycatalog/unitycatalog](https://github.com/unitycatalog/unitycatalog) | [apache/polaris](https://github.com/apache/polaris) (+ [polaris-tools](https://github.com/apache/polaris-tools)) | [lakekeeper/lakekeeper](https://github.com/lakekeeper/lakekeeper) | [apache/gravitino](https://github.com/apache/gravitino) |

## Critical user journeys

Legend: ✅ supported · 🟡 partial / with notable limits · 🧪 preview, alpha, or in
progress · 💼 Lakekeeper+ (commercial) only · ❌ not supported. Each cell links to
the most specific doc, source file, or issue we could find.

### Deploy & organize

| CUJ | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| **Run the catalog** (local → production) | ✅ Tarball / `bin/start-uc-server`, Docker Compose, Helm chart in repo. JDK 17. — [deployment](https://docs.unitycatalog.io/server/deployment/), [docker compose](https://docs.unitycatalog.io/docker_compose/), [helm/](https://github.com/unitycatalog/unitycatalog/tree/main/helm) | ✅ Docker images, binary, Helm chart, cloud deploy guides, admin tool for realm bootstrap. — [deploying](https://polaris.apache.org/releases/1.8.0/getting-started/deploying-polaris/), [Helm](https://polaris.apache.org/releases/1.8.0/helm-chart/) | ✅ Single binary, Docker Compose, Helm chart; community K8s operator in development. — [getting started](https://docs.lakekeeper.io/getting-started/), [production](https://docs.lakekeeper.io/docs/latest/production/), [charts](https://github.com/lakekeeper/lakekeeper-charts) | ✅ Tarball, `apache/gravitino` and `apache/gravitino-iceberg-rest` images, official Helm chart; standalone Iceberg/Lance REST packages. — [install](https://gravitino.apache.org/docs/latest/how-to-install), [chart](https://gravitino.apache.org/docs/latest/chart) |
| **Organize a namespace hierarchy** | ✅ Fixed three levels: catalog → schema → table / volume / function / model. — [catalogs](https://docs.unitycatalog.io/usage/api/catalogs/) | ✅ Catalog → arbitrarily nested namespaces → tables, views, generic tables, policies. — [entities](https://polaris.apache.org/releases/1.8.0/entities/) | ✅ Project → warehouse → nested namespaces → tables, views, generic tables. — [concepts](https://docs.lakekeeper.io/docs/latest/concepts/#entity-hierarchy) | ✅ Metalake → catalog → schema → table / fileset / model / topic / function; hierarchical namespaces since 1.3. — [overview](https://gravitino.apache.org/docs/latest/overview) |
| **Serve many tenants from one deployment** | ❌ One metastore per server. | ✅ **Realms**: per-request tenant isolation (`Polaris-Realm` header), with per-realm credentials, config, and bootstrap. — [realm](https://polaris.apache.org/releases/1.8.0/realm/) | ✅ **Projects**, each with many warehouses; per-project endpoint statistics for chargeback. — [concepts](https://docs.lakekeeper.io/docs/latest/concepts/) | ✅ **Metalakes** are the tenant boundary; users and roles are scoped per metalake. — [access control](https://gravitino.apache.org/docs/latest/security/access-control) |

### Tables & formats

| CUJ | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| **Create/read/write Iceberg tables over Iceberg REST** | 🟡 **Read-only** Iceberg REST (config, list/load namespaces, tables, views) that serves Delta tables with UniForm metadata. — [UniForm](https://docs.unitycatalog.io/usage/tables/uniform/) | ✅ Full Iceberg REST: tables, views, register, staged create, idempotency keys. — [catalog API](https://polaris.apache.org/releases/1.8.0/polaris-api-specs/polaris-catalog-api/) | ✅ Full Iceberg REST incl. V3 and idempotency keys. — [catalog API](https://docs.lakekeeper.io/docs/latest/api/catalog/) | ✅ Iceberg 1.11 REST for "most namespace, table, and view operations"; Hive/JDBC/REST backends. Authorization only in auxiliary-server mode. — [Iceberg REST service](https://gravitino.apache.org/docs/latest/iceberg-rest-service) |
| **Manage Delta Lake tables** | ✅ Managed + external Delta; **Delta REST API** with staging tables, server-validated (catalog-managed) commits, and credential vending; Spark DML. — [Delta tables](https://docs.unitycatalog.io/usage/tables/deltalake/), [Delta API](https://docs.unitycatalog.io/usage/api/delta/) | 🟡 Register as a **generic table** (`format: delta`); the Polaris Spark client can create/load/drop. No log interpretation, no CTAS, **no credential vending**. — [generic tables](https://polaris.apache.org/releases/1.8.0/generic-table/), [Spark client](https://polaris.apache.org/releases/1.8.0/polaris-spark-client/) | 🟡 Register as a generic table; governed, with credential vending, but engines own the Delta log (no commit coordination). — [generic tables: Delta](https://docs.lakekeeper.io/docs/latest/generic-tables/#delta) | 🧪 **External, metadata-only** Delta in the generic lakehouse catalog (on `main`, not in 1.3.0 docs); no ALTER, PURGE, or managed tables. — [PR #9678](https://github.com/apache/gravitino/pull/9678), [doc on main](https://github.com/apache/gravitino/blob/main/docs/lakehouse-generic-delta-table.md), [Delta catalog #7078](https://github.com/apache/gravitino/issues/7078) |
| **Other formats** (Hudi, Paimon, Lance, files-as-tables) | 🟡 External Parquet/ORC/JSON/CSV/Avro/Text tables; Hudi via XTable. No Paimon/Lance tables. — [formats](https://docs.unitycatalog.io/usage/tables/formats/), [XTable](https://docs.unitycatalog.io/integrations/unity-catalog-xtable/) | 🟡 Any format as a generic table (Delta, CSV, Hudi…); Paimon in the Spark catalog. — [generic tables](https://polaris.apache.org/releases/1.8.0/generic-table/), [PR #3723](https://github.com/apache/polaris/pull/3723) | 🟡 Generic Table API for Lance, Parquet, CSV, …, with vending, remote signing, and undrop. No Hudi/Paimon. — [generic tables](https://docs.lakekeeper.io/docs/latest/generic-tables/) | ✅ Native Paimon and Hive catalogs; Lance read/write + Lance REST; Hudi **read-only** via HMS. — [Paimon](https://gravitino.apache.org/docs/latest/lakehouse-paimon-catalog), [Lance REST](https://gravitino.apache.org/docs/latest/lance-rest-service), [Hudi](https://gravitino.apache.org/docs/latest/lakehouse-hudi-catalog) |
| **Define views** | ✅ SQL views and **metric views** (YAML dimensions/measures) as table types; create/drop on Spark 4.2. — [metric views](https://docs.unitycatalog.io/usage/metric-views/) | ✅ Iceberg views (create/replace/drop/register) with view privileges. — [entities](https://polaris.apache.org/releases/1.8.0/entities/) | ✅ Iceberg views with DEFINER/INVOKER security for trusted engines. — [view security](https://docs.lakekeeper.io/docs/latest/view-security/) | 🟡 Logical views for Hive/Iceberg/Paimon (1.3); Iceberg REST views only on the JDBC backend, no view registration. — [Iceberg REST service](https://gravitino.apache.org/docs/latest/iceberg-rest-service) |
| **Commit atomically across multiple tables** | ❌ Single-table commits only (Delta API). | ✅ `POST /transactions/commit` implemented. — [1.8.0 notes](https://github.com/apache/polaris/releases/tag/apache-polaris-1.8.0) | ✅ `POST /transactions/commit`, atomic and idempotency-aware. — [tables.rs](https://github.com/lakekeeper/lakekeeper/blob/main/crates/lakekeeper/src/server/tables.rs) | ❌ Docs: "not implemented: Multi-table transactions". — [Iceberg REST service](https://gravitino.apache.org/docs/latest/iceberg-rest-service) |
| **Server-side scan planning** | ❌ | ❌ Tracking issue open. — [#966](https://github.com/apache/polaris/issues/966) | ❌ Advertises `scan-planning-mode=client`. — [PR #1986](https://github.com/lakekeeper/lakekeeper/pull/1986) | 🟡 Synchronous `planTableScan` with vended credentials; async endpoints still in PRs. — [PR #9050](https://github.com/apache/gravitino/pull/9050), [PR #11635](https://github.com/apache/gravitino/pull/11635) |

### Non-tabular assets

| CUJ | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| **Govern files / unstructured data** | ✅ Managed and external **volumes**, with temporary volume credentials. — [volumes](https://docs.unitycatalog.io/usage/api/volumes/) | ❌ | 🟡 "Dataset" generic tables for raw file drops. — [datasets](https://docs.lakekeeper.io/docs/latest/generic-tables/#dataset) | ✅ **Filesets** over any HCFS (HDFS/S3/GCS/ADLS/OSS/COS); GVFS for Java, Python, and FUSE. — [fileset catalog](https://gravitino.apache.org/docs/latest/fileset-catalog) |
| **Register functions / UDFs** | ✅ SQL and external (e.g. Python) functions; executable as agent tools via `unitycatalog-ai`. — [functions](https://docs.unitycatalog.io/usage/api/functions/) | ❌ | ❌ | ✅ Scalar/table UDFs in SQL/Python/Java; whether an engine can invoke one depends on its connector. — [UDFs](https://gravitino.apache.org/docs/latest/manage-user-defined-function-using-gravitino) |
| **Register ML models** | ✅ Registered models + versions; MLflow model-registry backend with credential vending. — [models](https://docs.unitycatalog.io/usage/api/models/) | ❌ (a new OSI *semantic-model* entity is on `main`) — [PR #4961](https://github.com/apache/polaris/pull/4961) | ❌ | ✅ Model catalog: versions, aliases, multiple URIs per version. — [model catalog](https://gravitino.apache.org/docs/latest/model-catalog) |
| **Catalog streaming topics** | ❌ | ❌ | ❌ (Kafka is an event sink only) | ✅ Kafka catalog for topics. — [Kafka catalog](https://gravitino.apache.org/docs/latest/kafka-catalog) |
| **Catalog relational databases** | ❌ | ❌ JDBC federation requested. — [#5235](https://github.com/apache/polaris/issues/5235) | ❌ | ✅ JDBC catalogs: MySQL, PostgreSQL, Doris, StarRocks, OceanBase, ClickHouse. — [MySQL catalog](https://gravitino.apache.org/docs/latest/jdbc-mysql-catalog) |

### Security & access

| CUJ | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| **Connect storage & vend short-lived credentials** | ✅ Storage credentials + external locations; temporary S3 / ADLS / GCS credentials for tables, volumes, models, and paths. No remote signing. — [AWS setup](https://docs.unitycatalog.io/server/aws/) | ✅ S3 (+ compatibles), Azure, GCS; STS session tags flow to CloudTrail. Not for generic tables. — [vended credentials](https://polaris.apache.org/releases/1.8.0/vended-credentials/) | ✅ S3 (+ R2, OSS, compatibles), ADLS, OneLake, GCS; vended STS **and S3 remote signing**. — [storage](https://docs.lakekeeper.io/docs/latest/storage/), [remote signing](https://docs.lakekeeper.io/docs/latest/storage-s3/#remote-signing) | ✅ S3 / ADLS / GCS / OSS / COS token providers via Iceberg REST or the Gravitino API; connectors consume them automatically. — [credential vending](https://gravitino.apache.org/docs/latest/security/credential-vending) |
| **Authenticate users & services** | ✅ OIDC (Google, Entra, Okta, multiple issuers), OAuth client credentials, tokens. — [auth](https://docs.unitycatalog.io/server/auth/) | ✅ Built-in OAuth2 token endpoint, external OIDC, or mixed, per realm. — [external IdP](https://polaris.apache.org/releases/1.8.0/managing-security/external-idp/) | ✅ OIDC (multiple providers), Kubernetes service accounts. 💼 IdP role sync (Entra, LDAP). — [authentication](https://docs.lakekeeper.io/docs/latest/authentication/) | ✅ Simple, basic (built-in IdP, 1.3), OAuth/OIDC (JWKS), Kerberos, custom. — [authentication](https://gravitino.apache.org/docs/latest/security/how-to-authenticate) |
| **Grant access with RBAC** | ✅ Built-in privileges on metastore/catalog/schema/asset (`USE CATALOG`, `CREATE …`, …). — [users & privileges](https://docs.unitycatalog.io/server/users-privileges/) | ✅ Principal roles → catalog roles → privileges. — [access control](https://polaris.apache.org/releases/1.8.0/managing-security/access-control/) | ✅ OpenFGA with per-object grants and nested roles. — [authorization](https://docs.lakekeeper.io/docs/latest/authorization/), [grants](https://docs.lakekeeper.io/docs/latest/grants/) | ✅ Roles for users and groups, ownership, cascading grants, explicit DENY. — [access control](https://gravitino.apache.org/docs/latest/security/access-control) |
| **Delegate to an external policy engine** | ❌ | ✅ OPA (documented); Apache Ranger plugin merged. — [OPA](https://polaris.apache.org/releases/1.8.0/managing-security/external-pdp/opa/), [PR #3928](https://github.com/apache/polaris/pull/3928) | ✅ Trino OPA bridge. 💼 Cedar policy-as-code. — [OPA](https://docs.lakekeeper.io/docs/latest/opa/), [Cedar](https://docs.lakekeeper.io/docs/latest/authorization-cedar/) | ✅ Pushdown to Apache Ranger (Hive/Iceberg/Paimon, HDFS). — [pushdown](https://gravitino.apache.org/docs/latest/security/authorization-pushdown) |
| **Row filters / column masking** | ❌ | ❌ Requested. — [#137](https://github.com/apache/polaris/issues/137) | ❌ | ❌ No column-level grants; tag-based restrictions in design. — [#13545](https://github.com/apache/gravitino/issues/13545) |

### Interoperability

| CUJ | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| **Query from multiple engines** | ✅ Spark (read/write, Delta DML), DuckDB (read), Trino (via Iceberg REST), Daft, CelerData, Kuzu, PuppyGraph, SpiceAI. — [integrations](https://docs.unitycatalog.io/integrations/) | ✅ Guides for Spark, Trino, Flink; any Iceberg REST client (PyIceberg, DuckDB, …). — [guides](https://polaris.apache.org/guides/) | ✅ Spark, Trino/Starburst, DuckDB, PyIceberg, StarRocks, RisingWave, Athena, Fluss, Firebolt, OLake; in-browser DuckDB (LoQE). — [engines](https://docs.lakekeeper.io/docs/latest/engines/) | ✅ Own Trino, Spark, Flink, and Daft connectors, plus any Iceberg REST client. — [Trino connector](https://gravitino.apache.org/docs/latest/trino-connector/index), [Spark connector](https://gravitino.apache.org/docs/latest/spark-connector/spark-connector) |
| **Federate existing catalogs** | ❌ | ✅ External catalogs over Iceberg REST (Glue, other Polaris, …), HMS, Hadoop, BigQuery; off by default. — [federation](https://polaris.apache.org/releases/1.8.0/federation/) | ❌ Requested. — [#1943](https://github.com/lakekeeper/lakekeeper/issues/1943) | ✅ Core design: HMS, Glue, JDBC, Iceberg, Paimon, Hudi, Kafka, filesets under one metalake. — [overview](https://gravitino.apache.org/docs/latest/overview) |
| **Sync from an external catalog by push notification** | ❌ | ✅ Notifications API (create/update/drop/validate) on external catalogs. — [notifications-api.yaml](https://github.com/apache/polaris/blob/main/spec/polaris-catalog-apis/notifications-api.yaml) | ❌ | 🟡 Bidirectional through proxying, not push. |

### Lifecycle & operations

| CUJ | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| **Automate table maintenance** (compaction, snapshot expiry, orphan files) | ❌ Left to engines. | 🟡 **Policy store only**: compaction, snapshot-expiry, and orphan-removal policies with inheritance; external tools execute them. — [policy](https://polaris.apache.org/releases/1.8.0/policy/), [Floe example](https://polaris.apache.org/blog/2026/02/04/floe-and-apache-polaris-policy-driven-table-maintenance-for-apache-iceberg/) | 🟡 OSS: metadata-file cleanup. 💼 Snapshot expiry, orphan-file removal. — [table maintenance](https://docs.lakekeeper.io/docs/latest/table-maintenance/) | 🧪 Table Maintenance Service (alpha, Iceberg only): stats → tag-linked policies → Spark jobs; CLI-driven. — [optimizer](https://gravitino.apache.org/docs/latest/table-maintenance-service/optimizer) |
| **Recover dropped objects / protect from deletion** | ❌ Drops are permanent. | ❌ Proposal. — [#5054](https://github.com/apache/polaris/issues/5054) | ✅ Per-warehouse soft delete, `undrop` API (restores grants), protection flags. — [soft deletion](https://docs.lakekeeper.io/docs/latest/concepts/#soft-deletion), [protection](https://docs.lakekeeper.io/docs/latest/concepts/#protection) | ❌ |
| **Monitor the catalog** (metrics, health, tracing) | ❌ Log files only; health/metrics proposed. — [#1905](https://github.com/unitycatalog/unitycatalog/issues/1905) | ✅ Prometheus, OpenTelemetry traces, health/readiness. — [telemetry](https://polaris.apache.org/releases/1.8.0/telemetry/) | ✅ Prometheus `/metrics`, `/health`; 🧪 OTel tracing. — [monitoring](https://docs.lakekeeper.io/docs/latest/monitoring/) | ✅ JMX, JSON, and Prometheus metrics; Iceberg REST health endpoints. — [metrics](https://gravitino.apache.org/docs/latest/metrics) |
| **Audit access & react to changes** | ❌ No audit log or event API. | 🟡 Pluggable event listeners (Kafka, CloudWatch, OTel); webhook and audit trail in progress. — [config reference](https://polaris.apache.org/releases/1.8.0/configuration/configuration-reference/), [PR #5084](https://github.com/apache/polaris/pull/5084) | ✅ Authorization audit log; CloudEvents to NATS/Kafka; 🧪 webhooks. 💼 Admission gates. — [audit logging](https://docs.lakekeeper.io/docs/latest/configuration/#audit-logging), [admission](https://docs.lakekeeper.io/docs/latest/admission/) | 🟡 Audit log writer; pre/post event listener plugins (no built-in Kafka/webhook sink). — [server config](https://gravitino.apache.org/docs/latest/gravitino-server-config) |
| **Manage the catalog as code** (CLI, SDKs, Terraform) | 🟡 `bin/uc` CLI, OpenAPI, Python/Java clients; no Terraform. — [CLI](https://docs.unitycatalog.io/usage/cli/) | 🟡 Python CLI (incl. declarative `setup`), Python client, admin tool, OpenAPI; no Terraform. — [CLI](https://polaris.apache.org/releases/1.8.0/command-line-interface/) | 🟡 Management API, Python/Java/Go clients; **community** Terraform provider; no CLI. — [management API](https://docs.lakekeeper.io/docs/latest/api/management/), [Terraform](https://registry.terraform.io/providers/baptistegh/lakekeeper) | 🟡 Full-CRUD `gcli`, Java/Python clients, OpenAPI; no Terraform. — [CLI](https://gravitino.apache.org/docs/latest/cli) |
| **Browse & administer in a web UI** | ✅ Built-in React UI. — [UI](https://docs.unitycatalog.io/usage/ui/) | 🟡 Polaris Console in `polaris-tools`; no ASF release, build from source. — [console](https://github.com/apache/polaris-tools/tree/main/console) | ✅ OSS Console with permissions, statistics, in-browser queries. — [console](https://github.com/lakekeeper/console) | ✅ Web UI v2 (default) with OIDC login. — [Web UI](https://gravitino.apache.org/docs/latest/webui) |

### Discovery, lineage & AI

| CUJ | Unity Catalog OSS | Apache Polaris | Lakekeeper | Apache Gravitino |
|---|---|---|---|---|
| **Tag & discover assets** | 🟡 Comments and properties; no tags API or search. | 🧪 Tag API in PRs; `polaris find` CLI. — [PR #5366](https://github.com/apache/polaris/pull/5366) | 🧪 Governance tags (preview), incl. on columns, usable in 💼 Cedar; Console search. — [tags](https://docs.lakekeeper.io/docs/latest/tags/) | ✅ Tags on any object, tag-linked policies, properties. — [tags](https://gravitino.apache.org/docs/latest/manage-tags-in-gravitino) |
| **Track lineage** | ❌ | 🧪 OpenLineage ingest scaffolding merged; persistence in PRs. — [PR #4705](https://github.com/apache/polaris/pull/4705) | ❌ | ✅ OpenLineage endpoint with log/HTTP sinks; Spark plugin maps to Gravitino identifiers. Forwards events, doesn't store them. — [lineage](https://gravitino.apache.org/docs/latest/lineage/lineage) |
| **Define a semantic layer** | ✅ Metric views. — [metric views](https://docs.unitycatalog.io/usage/metric-views/) | 🧪 OSI semantic-model entity on `main`. — [PR #4961](https://github.com/apache/polaris/pull/4961) | ❌ | ❌ |
| **Let AI agents use the catalog** | 🟡 `unitycatalog-ai`: UC functions as tools for LangChain, LlamaIndex, OpenAI, Anthropic, CrewAI, …; **no MCP server**. — [AI quickstart](https://docs.unitycatalog.io/ai/quickstart/) | 🟡 MCP server in `polaris-tools` (no release, run from source). — [MCP server](https://github.com/apache/polaris-tools/tree/main/mcp-server) | ❌ MCP requested. — [#1051](https://github.com/lakekeeper/lakekeeper/issues/1051) | ✅ MCP server in the main repo + agent skills. — [mcp-server](https://github.com/apache/gravitino/tree/main/mcp-server) |

## Scorecard

Counting ✅ only, across the 32 CUJs above. This is a coarse signal; the value is in
the cells, not the count.

| | Unity Catalog OSS | Apache Polaris | Lakekeeper (OSS) | Apache Gravitino |
|---|---|---|---|---|
| Fully supported | 13 | 14 | 15 | 21 |
| Unique strengths | Delta REST + managed commits, volumes + functions + models in one namespace, metric views | Most complete Iceberg REST, realms, federation + notifications, policy store, OPA/Ranger | Undrop/protection, remote signing, OpenFGA, CloudEvents, Rust embeddability | Kafka + RDBMS + filesets federation, OpenLineage, sync scan planning, maintenance service |

## Implications for Unity Catalog OSS

UC's lead is in the **breadth of assets under one governance model**: tables,
volumes, functions, models, and metric views. It is also the only catalog with real
**Delta-native commits**. No competitor matches both. The gaps worth prioritizing,
roughly in order of how often they block adoption:

1. **Iceberg write path.** UC's Iceberg REST is read-only. Polaris, Lakekeeper, and
   Gravitino all accept Iceberg writes, and that is the default evaluation test for
   Iceberg-first shops.
2. **Operational table stakes.** Health/metrics endpoints (#1905), an audit log, and
   an event stream ship in all three competitors.
3. **Multi-tenancy.** Every competitor has a tenant unit: realms, projects, or
   metalakes.
4. **Federation.** Polaris and Gravitino can front existing HMS/Glue/REST catalogs;
   UC cannot yet, which makes incremental adoption harder.
5. **Tags / discovery and lineage.** Gravitino leads here; Polaris is catching up.
6. **External policy engines and soft delete.** These are smaller gaps, but both
   show up in enterprise checklists.

Row/column-level security is a gap in *every* OSS catalog, so it is a chance to
differentiate rather than a catch-up item.

## Method & caveats

- **Sources.** Each project's published docs, its GitHub repository (source,
  OpenAPI specs, release notes, issues/PRs), and project blogs. The Unity Catalog
  and Lakekeeper rows were also checked against the source tree (API specs and
  route handlers).
- **Version skew.** Some links point at `main`-branch docs or open PRs. The table
  marks those 🧪 so they are not mistaken for released features. Polaris links use
  the 1.8.0 docs, Lakekeeper `docs/latest`, and Gravitino `docs/latest`. Gravitino's
  Delta page exists only on `main`.
- **Not tested hands-on.** Engine compatibility is taken from the docs, not from
  running each engine against each catalog.
- **Open core.** Lakekeeper+ features are marked 💼 and are not counted as OSS
  support. The Polaris Console and MCP server are ASF-hosted but have no ASF
  release.
