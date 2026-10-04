# Unity Catalog OSS documentation plan

Date: 2026-10-01

Status: Proposal for scope and sequencing; not an implementation commitment

Scope: The official `unitycatalog/unitycatalog` OSS server, its clients and
connectors, and integrations demonstrably usable against that server

Server baseline: `v0.6.0`, published 2026-08-20, commit
`6605f867d9a8b63205534dd8d575adb430e8f798`

AI baseline: Latest official AI release tag found was `ai-v0.4.0`, published
2026-04-24. AI packages have an independent release cycle.

> **Update 2026-10-03: the docs experience is built in the factory site.**
> We now build the section 5 navigation inside this repository's site, and
> emission to the upstream MkDocs site is deferred (section 11 still describes
> what it would need). The navigation-metadata decision is resolved: each
> project may ship a validated `content/<project>/nav.yml` that references
> canonical pages by `<bucket>/<slug>`. The site renders it whenever that
> project's scope is active. Backlog ids from section 6 appear as reviewer-only
> `planned:` slots. See `content/README.md` § "Curated navigation". The existing
> drafts were re-homed per section 7, with new paths noted in that table.

> **Update 2026-10-04: emission targets a new static site, not MkDocs.**
> `just emit-docs unitycatalog-docs` renders `content/unitycatalog/` into the
> static site shell at `sites/unitycatalog-docs/`. That site keeps the factory's
> rendering and agent surfaces. Section 11's emitter requirements are answered,
> or explicitly deferred, in
> [`docs-site-emission.md`](./docs-site-emission.md).

## 1. Recommendation

Organize the reader experience around **Use Unity Catalog** and **Operate Unity
Catalog**, with shared **Concepts**, **Reference**, and a smaller **Build
integrations** section. Keep Diataxis as the content architecture: every article
has one purpose and one canonical home in `tutorials/`, `how-to/`, `reference/`,
or `explanation/`. Audience and topic navigation are views over those articles,
not additional copies of the documentation.

The rewrite should make it possible to:

1. Try OSS UC locally without a Databricks account, a cloud account, or building
   the project from source.
2. Register existing data, create catalog-managed Delta tables, and understand
   which clients can safely read and write each.
3. Govern files, functions, models, SQL views, and metric views, not just tables.
4. Deploy a persistent, authenticated catalog and operate it through upgrades,
   credential changes, and recovery.
5. Connect a supported engine or build a client without reverse-engineering
   configuration, authorization rules, or three different API surfaces.

Do not make the documentation a mirror of the current sidebar or a collection
of lightly refreshed blog posts. Use those sources as leads, verify behavior
against releases, and write task-sized documentation.

The proposed backlog contains 11 tutorials, 10 explanations, 46 how-to guides,
and 14 reference units. These are planning units, not a requirement to launch
81 handwritten pages at once: several reference units should be generated,
and conditional integrations need not become first-party guides. Section 9
defines a smaller first delivery and the gate for a complete replacement.

## 2. Evidence and research boundaries

### Method

This proposal compares:

- The live `docs.unitycatalog.io` homepage navigation and existing feature guides.
- The official GitHub release history through `v0.6.0`, including patch releases
  and the separately tagged AI releases.
- A downloaded official `v0.6.0` source snapshot: API definitions, service and
  repository implementations, configuration, Helm chart, and integration docs.
- Published `unitycatalog.io` blogs, cross-checked with the sibling website's
  source where useful.
- Primary documentation from Diataxis, Kubernetes, PostgreSQL, MLflow, DuckDB,
  and Lakekeeper.
- Existing `content/unitycatalog/` drafts and this factory's content and
  navigation conventions.

Source identifiers in square brackets resolve in section 12. Repository file
paths in the evidence tables are relative to the official release snapshot
unless explicitly described as local.

Use this authority order when sources disagree:

1. Behavior reproduced with a pinned published artifact.
2. Release-tagged implementation and tests.
3. Release-tagged API contract and release notes.
4. Current official documentation and integration-provider documentation.
5. Published blogs.
6. Roadmaps, issues, forks, and local experiments: leads, not shipping evidence.

An OpenAPI enum, partner logo, or release announcement is not evidence that every
operation works in every engine. Conversely, an old guide saying a feature is
unsupported is not evidence that the current release lacks it.

### Limits of this audit

This is a documentation scope audit, not a runtime conformance test. No server,
cloud resources, Spark session, model registry, or agent workflow was started.
Capabilities below are source-verified or release-advertised; examples still
need the publication tests in section 10.

The local sibling UC checkout was older than `v0.6.0` and is a fork. It was useful
for orientation but was not used as the shipping baseline. The baseline was
resolved from the official repository instead.

Direct PyPI metadata requests failed. The AI baseline above therefore means
"latest official AI GitHub release tag observed," not an independently verified
claim about every package's latest PyPI version. Verify package availability and
per-package versions before pinning AI examples. Do not assume that every toolkit
package has the server's version or even the core AI package's version.

### Release history that changes documentation scope

Dates below are GitHub release publication dates, not announcement dates. [S01]

| Release | Published | Consequence for the rewrite |
| --- | --- | --- |
| Server 0.1.0 | 2024-07-09 | Baseline namespace, table, volume, function, Java client, and example CLI documentation. Managed-resource presence did not imply full creation support. |
| Server 0.2.0 | 2024-09-30 | Models/MLflow, Spark integration, external identity providers, and UI deserve separate journeys. The announcement followed on 2024-10-08. [B01] |
| Server 0.2.1 | 2024-12-10 | Preserve an archived version boundary rather than carrying old examples into current guides without testing. |
| Server 0.3.0 | 2025-07-17 | Spark/Delta 4.0, storage-credential and external-location API surfaces, Helm, and separate UI deployment expand operator and integrator scope. |
| Server 0.3.1 | 2025-12-12 | Experimental catalog-managed Delta tables, staging/commit APIs, OAuth in the Spark connector, and cloud-credential renewal change the table-access model. [B02] |
| Server 0.4.0 | 2026-02-14 | AWS storage credentials/external locations, catalog/schema managed storage, default credential renewal, and atomicity distinctions need dedicated coverage. [S02] |
| Server 0.4.1 | 2026-04-16 | Required issuer/audience configuration is an upgrade concern; credential-scoped filesystems, VARIANT, and additional atomic managed-table writes affect connector reference. [S02] |
| Server 0.5.0 | 2026-06-18 | Delta v1 REST API, version-specific Spark artifacts, reusable Hadoop credential library, and catalog-side metric-view preview require new documentation. [S02] |
| Server 0.5.1 | 2026-07-18 | Credential-cache isolation/reuse and secured permission lookups make patch-level compatibility relevant. [S02] |
| Server 0.6.0 | 2026-08-20 | SQL views, Spark 4.2 metric-view integration, Delta API lifecycle/retry improvements, token expiration, and a managed-Delta/PostgreSQL fix materially expand current scope. [S03] |
| AI 0.1.0 / 0.2.0 | 2025-01-06 / 2025-02-24 | AI functionality is a separately versioned documentation surface. |
| AI 0.3.0 / 0.3.1 | 2025-03-11 / 2025-05-22 | Do not confuse AI 0.3.0 with server 0.3.0. The AI 0.3.0 blog is dated 2025-04-22, later than its release. [B10] |
| AI 0.4.0 | 2026-04-24 | Python 3.10+ requirement, toolkit compatibility, OSS function-client fixes, and Databricks-only client changes must be separated. [S10] |

### Current capability boundary

This is the scope baseline, not the final public compatibility matrix.

| Area | Evidence at the baseline | Documentation implication |
| --- | --- | --- |
| Catalog hierarchy and metadata | Metastore, catalogs, schemas, resource metadata, ownership, properties, and permissions have official surfaces. [S04, S05, S14] | Teach names and resource scope once. Cover every implemented resource in reference, including administrative ones. |
| External tables and formats | Table registration and format metadata are distinct from physical data access. [S04, S07] | Explain registration versus creating/writing data. Publish per-engine, per-format operation limits. |
| Managed Delta tables | Storage allocation, staging, catalog-managed commits, and Delta API are present. Managed tables are enabled by default in 0.6.0 configuration. [S06, S07, S08] | Separate storage ownership from transaction coordination. Do not infer a GA/stability promise from a default flag. |
| Managed storage | Catalog/schema storage roots and external-location resolution replace older root-only configuration patterns. [S07, S08, S16] | Document allocation/inheritance and migration, rather than making deprecated global roots the recommended cloud setup. |
| Volumes | `VolumeRepository` implements both managed and external creation. [S13] | Cover both lifecycles. Metadata access and access to actual files are separate tasks. Do not assume Databricks `/Volumes` paths exist in all OSS clients. |
| SQL views | VIEW is stored on the table API surface; source tracks definition and optional dependencies. Release notes distinguish reading on Spark 4.0/4.1 from creation on 4.2, and disallow replace/rename. [S03, S04, S07] | Add a view guide and explicit operation matrix. Dependencies are not a general automatic lineage service. |
| Metric views | METRIC_VIEW is stored by UC; release notes advertise Spark 4.2 execution. Actual YAML/query interpretation belongs to the engine. [S03, S07, S17] | Add a semantic-layer journey. Separate server storage acceptance from engine support for a particular definition. |
| Credentials and clouds | First-class storage-credential service implements AWS IAM roles; Azure/GCP are explicitly not implemented in that service. Separate ADLS/GCS vending configuration exists. [S08, S18] | Write cloud-specific guides. Do not transpose the AWS external-location workflow to Azure/GCP or equate vending with full securable parity. |
| Authentication and identity | Token exchange, SCIM Users and `/Me`, issuer/audience configuration, and ownership/grants are present. 0.6.0 changes exchanged-token lifetime; bootstrap token is separate. [S03, S05, S08] | Cover human and machine access separately, including actual principal mapping and refresh. Do not invent SCIM Groups or a Databricks service-principal API. |
| Authorization | Official server initializes a JCasbin authorizer. [S14] | Document implemented privileges and storage-access boundaries, not Cedar policies from sibling projects. |
| Functions and AI | Function metadata APIs and an OSS AI function client are present. The AI release client executes in the caller's environment, with local or subprocess-based modes. [S04, S10, S11] | Function registration is not server-hosted compute. Explain execution trust, dependencies, timeouts, and the limits of the subprocess mode. |
| Models | Registered models, model versions, and model-version credential APIs are present. [S04, B06] | Separate MLflow tracking from the UC registry and artifact storage. Verify alias/stage/serving claims rather than inheriting Databricks behavior. |
| Iceberg interoperability | The REST service advertises a limited set of discovery/read-related endpoints; several endpoints require metastore ownership. [S12] | Explain UniForm read interoperability and actual privilege limits. Do not present this as a complete writable native Iceberg catalog. |
| Deployment | Java distribution/container, H2/PostgreSQL configuration, Helm, and separate UI are present. [S08, S09, S19] | Deployment and operations need a first-class documentation track; chart defaults are not a production checklist. |
| DuckDB | Current provider docs use `unity_catalog`, unlike the old UC guide's `uc_catalog` nightly flow. Provider docs describe inserts and limitations, but specifically discuss Databricks coordinated commits. [S20, S21] | Test OSS separately. Do not copy either the old read-only assumptions or Databricks write support into an OSS compatibility claim. |

### What not to promise

Keep a prominent "OSS scope and limitations" reference, with evidence and version
boundaries. The following are not established as official OSS server capabilities
by this audit and should not receive procedural documentation implying otherwise:

- Automated lineage capture/graphs, governance tags/classification, ABAC,
  native row filters, or column masking.
- Predictive optimization, autonomous table maintenance, or multi-table atomic
  transactions. The managed-tables blog describes foundations and possible
  downstream capabilities, not proof that those are implemented. [B03]
- A native Iceberg write catalog, a general file-upload/query API, or a Delta
  Sharing server merely because these belong to the wider ecosystem.
- Databricks SQL warehouses, serverless execution, workspaces, vector search,
  feature serving, or identical Databricks model lifecycle semantics.
- Identical support for every advertised table type, format, cloud, or AI
  framework.
- Supported HA, zero-downtime key rotation, or an operational SLA merely because
  the Helm chart has a replica count.

Mangrove, Hydrofoil, Breakwater, and related estate work belong in
`content/open-lakehouse/` or a clearly labeled ecosystem directory. They must not
silently supply missing behavior for a tutorial labeled Unity Catalog OSS.

## 3. What the current material gets wrong or leaves unclear

The existing material has useful coverage; the problem is not that every page
is obsolete. The rewrite needs to address these specific issues.

| Finding | Evidence | Proposed response |
| --- | --- | --- |
| Learning, tasks, explanation, and command listings are combined. | Existing tables, functions, and models guides contain setup, walkthroughs, CRUD, and long transcripts. [S15, S19, B06-B08] | Split by reader intent. Keep tutorial output short and verified; move exhaustive commands to reference. |
| Navigation lags the source tree. | Live homepage links emphasize the older usage/server/AI structure; the tagged repository also contains deployment, AWS, Delta API, and metric-view material not linked in that homepage navigation. [S15, S16, S17, S19] | Generate navigation from an explicit content inventory and validate that every published page is reachable. |
| Cloud examples need implementation checks. | Tagged AWS guide uses `aws.s3.masterRoleArn`/`aws.s3.accessKey`, while implementation uses `aws.masterRoleArn`/`aws.accessKey`. It also shows unrestricted role-assumption policy and a comment inside a JSON policy. [S08, S16] | Verify names; use narrowly scoped IAM examples, parse JSON fixtures, and test credential vending with real authorization. |
| Blog examples are not current contracts. | 2025 auth post lacks settings required from 0.4.1; managed-tables post uses older feature/root configuration. [S02, S08, B03, B09] | Preserve blogs as historical context. Link current how-to guides and upgrade notes; do not wholesale import code. |
| Metric-view guidance conflicts. | Tagged docs use Spark 4.2 and a small `version: "0.1"` definition; published blog mentions Spark 4.3 and a richer 1.1 definition. Tagged docs also disagree with release notes on Spark 4.2 Delta artifact availability. [S03, S17, B05] | Make Spark/connector/Delta/YAML compatibility a publication gate. Start with the smallest tested definition, not a union of examples. |
| Integrations do not establish operation parity. | Old DuckDB page uses nightly `uc_catalog`; current DuckDB guidance differs. Trino guide uses the Iceberg surface, not the Delta API. [S19-S21] | Publish an integration matrix with protocol, reads/writes/DDL, auth, cloud, and tested versions. |
| OSS AI starts can accidentally require Databricks. | Existing AI quickstart combines OSS client setup with a `ChatDatabricks` agent example. [S11] | Keep the OSS happy path account-independent. Put managed-product client material behind an explicit external boundary. |
| Operator lifecycle is underdeveloped. | Deployment material is largely distribution/database setup; Helm includes settings not explained in that guide. [S09, S19] | Add persistence, protected exposure, bootstrap identity, backups, restore, upgrades, and operational troubleshooting. |

## 4. Audiences and user journeys

Personas are entry points, not mutually exclusive identities:

- Evaluator: needs a bounded first success and an honest feature comparison.
- Data practitioner: data engineer, analyst, or scientist consuming a catalog
  provided by someone else.
- AI/ML developer: needs functions, files, tools, or a model registry, without
  having to become a catalog operator first.
- Platform operator/security administrator: deploys and governs the service.
- Integrator/contributor: implements clients, connectors, or extensions.

| Journey | Starting question | Ordered reading path | Completion condition |
| --- | --- | --- | --- |
| J01 Evaluate | "What can OSS UC do, and can I try it?" | E01 -> R01 -> T01 -> T11 -> choose a data/AI journey | Local catalog works; reader can identify unsupported requirements before adopting it. |
| J02 Operate | "How do I provide a persistent catalog to my team?" | E02/E10 -> T10 -> H22/H24 -> H25 -> H37 -> T09 -> R06/R07 | Restart preserves metadata; authentication is on; ordinary users work without the bootstrap token. |
| J03 Govern tabular data | "How do I register existing data or create managed Delta tables?" | E03/E04 -> T02 -> T03 -> H02/H03/H04 -> R02/R10 | Reader can distinguish registration from writing and complete a supported read/write lifecycle. |
| J04 Govern files | "How do applications use unstructured files under UC?" | E03/E05 -> T04 -> H09/H10 -> R03/R04 | Application resolves a volume and accesses files with appropriately scoped credentials. |
| J05 Grant access | "How do I let a colleague or job read just the intended assets?" | E06 -> T09 -> H32/H34/H36 -> H35 -> H41 -> R05 | A permitted operation succeeds and a non-permitted operation is denied; principal mapping is understood. |
| J06 Build AI tools | "How do I reuse governed functions in an application or agent?" | E07 -> T05 -> T06 -> H11-H14 -> R11/R12 | Registered function runs in the intended execution environment and exposes a bounded tool interface. |
| J07 Manage models | "How do I register, version, and load a model using MLflow?" | E08 -> T07 -> H15 -> H10 -> R03/R11 | A model version is registered and reloaded; tracking, registry, and artifact locations are understood. |
| J08 Publish semantics | "How do I define reusable SQL views and business metrics?" | E09 -> H06 -> T08 -> H07 -> R02/R13 | A supported view/metric definition yields a verified query result, with engine restrictions visible. |
| J09 Use another engine | "Can my engine use this UC deployment and these tables?" | R10 -> E04/E05 -> H17-H20 -> H43 | Reader chooses the correct protocol and proves the intended operations with their engine. |
| J10 Build an integration | "How do I implement a correct client or connector?" | E02/E04 -> T11 -> H16 -> R08/R09 -> H44/H45/H46 | Client handles names, paging, auth, credential expiry, and supported commit/error semantics. |
| J11 Upgrade/recover | "How do I upgrade or restore without losing access or metadata?" | R14 -> H38 -> H39 -> H29 -> H41/H42 -> E10 | Tested backup restores; migration changes are applied; post-upgrade data and access checks pass. |

Each article should say what the reader needs beforehand, what changes it makes,
how to verify success, and which journey to take next. An operator guide must not
be a prerequisite for someone connecting to an already provisioned catalog.

## 5. Proposed navigation and Diataxis mapping

```text
Start here
  What is Unity Catalog OSS?                 -> E01
  Features, scope, and limitations           -> R01
  Create your first catalog                  -> T01
  Choose a client or engine                  -> R10

Use Unity Catalog
  Tutorials                                 -> T02-T08, T11
  How-to guides
    Catalogs and schemas                     -> H01
    Tables and views                         -> H02-H08
    Files and volumes                        -> H09-H10
    Functions and AI                         -> H11-H14
    Models and MLflow                        -> H15
    Clients and query engines                -> H17-H20

Operate Unity Catalog
  Tutorials                                 -> T09-T10
  How-to guides
    Deploy and persist                       -> H22-H26
    Configure storage                        -> H27-H31
    Identity and access                      -> H32-H37
    Back up, upgrade, and observe             -> H38-H40
    Troubleshoot                             -> H41-H43

Build integrations
  Java and Python clients                    -> H16, T11
  Delta API clients                          -> H44
  Hadoop credential integration              -> H45
  Integration testing and contributing       -> H46, upstream contributor docs

Concepts                                    -> E01-E10
Reference                                   -> R01-R14
Release and migration notes                 -> R14, H39
Ecosystem integrations                      -> H21
```

"Start here" and the audience landing pages are navigation hubs, not a fifth
Diataxis category. They should offer direct article links and a small number of
ordered paths, not repeat feature explanations or introduce another quickstart.

Within Use and Operate, retain visible Tutorials/How-to distinctions. Concepts
and Reference are shared, with contextual links from tasks. Audience navigation
must not hide the full four-part content index.

### Canonical source and URLs

Keep the current source layout:

```text
content/unitycatalog/
  tutorials/NNN-<slug>/index.md
  how-to/NNN-<slug>/index.md
  explanation/NNN-<slug>.md
  reference/NNN-<slug>.md
```

Use folder mode with `snippets/` whenever a page has runnable examples; a plain
`.md` file is sufficient otherwise. Keep the numeric-prefix ordering and
prefix-stripped URL convention. Titles in section 6 are proposed working titles;
assign concise task-based slugs at authoring time and preserve already published
slugs with frontmatter overrides or redirects.

Do not create `content/unitycatalog/operators/` or `usage/` alongside Diataxis
buckets, or nest them in a way that changes the current parser's assumptions.
Audience/topic navigation is a `nav.yml` projection over these buckets; see the
2026-10-03 update.

Prefer a small validated navigation manifest that references canonical content
IDs and supports multiple links to one article. Audience/topic fields in
frontmatter are an alternative if they materially simplify the renderer, but
must first be added to the shared parsing/validation contract. No new fields are
being introduced by this proposal.

## 6. Article backlog

Priority means:

- P0: Necessary for the first coherent core release, including safe operating
  and upgrade guidance.
- P1: Necessary to finish current feature coverage and replace the corresponding
  legacy material.
- P2: Optional depth or an integration that needs an owner and verification.

P1 does not mean "future feature." SQL views, metric views, volumes, and models
belong to current scope. A complete site replacement must cover them, or retain
clearly labeled legacy pages until their replacement is ready.

### 6.1 Tutorials: one chosen environment, one observable result

| ID | Proposed article | Priority / journeys | Scope and success check |
| --- | --- | --- | --- |
| T01 | Create your first catalog locally | P0 / J01 | Pinned container, isolated local exposure, empty fixture, catalog/schema creation and discovery, cleanup. No cloud or source build. |
| T02 | Register and query an existing Delta table with Spark | P0 / J03 | One tested Spark/connector/Delta combination; deterministic data; external registration; query result. No cross-engine branching. |
| T03 | Create and update a catalog-managed Delta table | P0 / J03 | Same default engine, managed storage allocation, supported creation/write/read, commit coordination, safe cleanup. |
| T04 | Read files from a governed volume in Python | P1 / J04 | Create a volume over deterministic files; discover metadata; obtain credentials where appropriate; list/read with a supported storage client. |
| T05 | Register and execute your first Python function | P0 / J06 | OSS AI client, typed callable, registration, deterministic execution and cleanup. Explicit caller-side execution. |
| T06 | Build an agent tool from a catalog function | P1 / J06 | One maintained framework, explicit function allowlist, tool invocation test; deterministic mock model for CI and an optional real-model step. |
| T07 | Register and reload a model with MLflow | P1 / J07 | Deterministic small model, separate tracking/registry configuration, signature, version registration and prediction assertion. |
| T08 | Define and query your first metric view | P1 / J08 | Tested engine/YAML pair; small source dataset; dimensions, measures and `measure(...)`; assert results against a direct aggregation. |
| T09 | Give two users different access to a catalog | P0 / J02, J05 | Controlled test IdP, ordinary user identities, grants and parent access, one permitted operation and one denied operation. No real IdP account required for CI. |
| T10 | Keep catalog metadata across restarts with PostgreSQL | P0 / J02 | Pinned UC and database, empty start, create metadata, restart UC, assert persistence. Distinguish database state from data-file storage. |
| T11 | Create and inspect catalog resources with the Python client | P0 / J01, J10 | Async SDK lifecycle, configured base URL, catalog/schema/table metadata, missing-resource handling, cleanup. Rework the existing draft. |

T01-T03 should use a small retail/orders dataset. T04 can use short document
files; T05 a pure calculation; T07 an offline bundled dataset. The TPC-H draft
is useful for advanced examples, but generating eight tables should not be a
prerequisite for the first SQL or metric-view success.

### 6.2 Explanation: the mental models readers need

| ID | Proposed article | Priority / journeys | Questions it answers |
| --- | --- | --- | --- |
| E01 | What is Unity Catalog OSS? | P0 / J01 | Catalog versus query engine/storage; what OSS UC provides; how it differs from Databricks UC and the broader ecosystem. |
| E02 | How the server, clients, and storage work together | P0 / J02, J10 | Metadata/control plane versus data access; UI/CLI/SDK roles; metadata database; UC, Delta, and Iceberg REST surfaces. |
| E03 | Namespaces, securables, and storage locations | P0 / J03-J05 | Three-level names, metastore-scoped resources, ownership, catalog/schema roots, and the difference between a resource and its physical path. |
| E04 | External tables and catalog-managed Delta tables | P0 / J03, J09-J10 | Storage ownership versus catalog-managed commits; staging, ratification, publication/backfill, supported clients, why path access is not interchangeable. |
| E05 | Credential vending and the data-access trust boundary | P0 / J04-J05, J09 | Who gets credentials, read/write scope, expiration/renewal, server identity, storage IAM, and what catalog grants cannot protect when direct storage access exists. |
| E06 | Authentication, principals, ownership, and privileges | P0 / J05 | IdP identity versus local UC user; authentication versus authorization; parent access/inheritance as implemented; bootstrap versus exchanged tokens. |
| E07 | Where catalog functions execute | P0 / J06 | Metadata registration, caller-side execution modes, dependency environment, tool selection, subprocess restrictions versus a strong isolation boundary. |
| E08 | How Unity Catalog and MLflow divide responsibilities | P1 / J07 | Runs/experiments versus registered models/versions/artifacts; which service stores what; registry operations do not imply model serving. |
| E09 | SQL views and metric views as catalog objects | P1 / J08 | Stored definitions/dependencies versus engine execution; ordinary views versus measures/dimensions; semantic compatibility and permission boundaries. |
| E10 | Persistence, failure, and recovery boundaries | P0 / J02, J11 | Metadata DB, policies, signing/bootstrap material, physical data, and managed commit state; which backups/restarts preserve which guarantees. |

These pages should use the existing architecture model where appropriate, with
validated `explains`/`references`. If an explanation needs a missing model concept,
raise a separate model change; do not invent an ID or silently mutate the
architecture to fit an article.

### 6.3 How-to: practitioner and integration-consumer tasks

| ID | Proposed article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H01 | Create and manage catalogs and schemas | P0 / J03-J05 | Create/list/inspect/update, properties, names and ownership, nonempty deletion behavior; CLI/SDK alternatives for the same task. |
| H02 | Register an existing external table | P0 / J03 | Location/schema/format requirements, no implied physical table creation, metadata validation, cleanup that preserves external data. |
| H03 | Read and write catalog-managed Delta tables | P0 / J03 | Supported operation set, required table feature, managed roots, credentials, engine selection, no unsafe path-write shortcuts. |
| H04 | Change table schemas and properties safely | P1 / J03, J10 | Supported changes per API/engine; Delta requirements/etags and intent-based updates; distinguish UC metadata from the Delta transaction state. |
| H05 | Replace a table or overwrite partitions | P1 / J03 | CTAS/RTAS/overwrite distinctions; atomicity/version boundaries; unsupported combinations and recovery guidance. |
| H06 | Create and query SQL views | P1 / J08 | Definition/columns/dependencies, engine version, allowed operations, underlying-resource access; explicitly state replace/rename limits. |
| H07 | Create and maintain metric-view definitions | P1 / J08 | Supported YAML version/fields, dependencies, query syntax, definition changes supported by the baseline, permission checks. |
| H08 | Register non-Delta external table formats | P1 / J03, J09 | Parquet/CSV/ORC and other actually supported formats; schema/options; which operations require an engine; no managed non-Delta promise. |
| H09 | Create and manage external and managed volumes | P1 / J04 | Storage allocation versus supplied path, CRUD, path overlap rules, ownership, grants, verified metadata/data deletion semantics. |
| H10 | Access volume files and model artifacts with vended credentials | P1 / J04, J07 | Resource-specific credential APIs, expiration and refresh, object-store client translation, read/write constraints, local-storage caveats. |
| H11 | Register, replace, and remove Python functions | P1 / J06 | Types, docstrings, callable extraction, wrapped functions, replacement effects, metadata and permissions. |
| H12 | Execute functions in applications and notebooks | P1 / J06 | Sync/async patterns, existing event loops, dependencies, execution modes, timeout/resource handling, deterministic errors. |
| H13 | Use catalog functions as LangChain tools | P1 / J06 | Current toolkit API, explicit function selection, supported types, execute privilege, tested OSS client; no Databricks compute dependency. |
| H14 | Use catalog functions with OpenAI-compatible tool calling | P1 / J06 | Toolkit/function schema, caller-side execution, bounded invocation flow, deterministic tool tests. LlamaIndex and other frameworks are additional candidates, not tabs promising universal parity. |
| H15 | Manage model versions and load a model with MLflow | P1 / J07 | Registry URI, version lifecycle, metadata, credentials/artifacts, permissions, unsupported aliases/stages if applicable, deletion effects. |
| H16 | Use the Java client in an application | P1 / J10 | Artifact pinning, API base path, resource lookup, paging, auth and error handling; do not recreate generated endpoint documentation. |
| H17 | Configure Spark to use Unity Catalog | P0 / J03, J09 | Spark/Scala/connector/Delta coordinates, catalog naming, filesystem dependencies, token/OAuth options, renewal/scoped-cache defaults. |
| H18 | Read and write supported UC tables from DuckDB | P1 / J09 | Current extension install/name, secrets/attach, platform support, tested OSS read/write operations; label unverified managed-commit support explicitly. |
| H19 | Read UniForm tables from Trino through Iceberg REST | P1 / J09 | Correct protocol, warehouse/catalog mapping, materialized Iceberg metadata, credential handling, endpoint privilege limits; read scope only unless separately proven. |
| H20 | Query UC tables from Python DataFrame libraries (Polars, Daft, pandas) | P1 / J09 | Current provider APIs/dependencies, discovery, vended storage credentials, read and append results per library; managed tables and other per-library gaps stated with their errors. |
| H21 | Find and evaluate ecosystem integrations | P2 / J09 | Directory of maintained provider docs for SpiceAI, CelerData, PuppyGraph, XTable and others; protocol, ownership, support label, last verification. No untested recipe collection. |

SQL operations such as MERGE, time travel, streaming, vacuum, clustering, and
schema evolution are primarily engine/Delta topics. UC docs should document the
integration boundary and tested restrictions, then link to the upstream feature
documentation. Add a UC-specific how-to only when the catalog changes the task.

### 6.4 How-to: platform operations and security

| ID | Proposed article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H22 | Deploy a persistent UC server with containers | P0 / J02 | Pinned server/UI images separately, configuration, database/key material mounts, data paths, readiness and restart verification. Clearly separate local convenience from shared deployment. |
| H23 | Run a released Java distribution or build from source | P1 / J02, J10 | Runtime/build requirements, artifact acquisition and provenance, startup/config/classpath. Source builds are an explicit developer alternative. |
| H24 | Deploy Unity Catalog on Kubernetes with Helm | P1 / J02 | Release-tagged chart, explicit image tags, DB/secrets, persistent signing material, ingress/UI routing, probes, resources, validation; no implied HA certification. |
| H25 | Configure PostgreSQL as the metadata backend | P0 / J02 | JDBC/driver packaging, DB credentials/TLS, configuration, permission policy persistence, connectivity and restart checks. |
| H26 | Configure a MySQL metadata backend | P2 / J02 | Existing upstream deployment recipe as a lead; publish only after authorization and managed-table regression tests. Otherwise retain a labeled upstream link. |
| H27 | Configure AWS storage credentials and external locations | P0 / J02-J05 | Workload/master role, narrowly scoped storage role and trust/external ID, credential/location securables, grants, S3/KMS permissions and validation. |
| H28 | Set managed storage for catalogs and schemas | P0 / J02-J04 | Root allocation/inheritance, location matching and overlap, local versus cloud paths, restrictions on existing resources, verification. |
| H29 | Migrate legacy storage configuration | P1 / J11 | Indexed S3 config/global roots versus current resource model, coverage of existing paths, phased verification, rollback boundaries. |
| H30 | Configure ADLS credential vending | P1 / J02, J09 | Actual server/client authentication chain, supported credential form, ABFS dependencies, expiry/renewal, cloud-specific limits. No AWS-securable parity claim. |
| H31 | Configure GCS credential vending | P1 / J02, J09 | Actual ADC/configured identity path, bucket and connector setup, expiry/renewal, cloud-specific limits. |
| H32 | Enable authentication with an external identity provider | P0 / J02, J05 | Issuer/audience settings, supported token exchange, user mapping, rejection tests, bootstrap access, verified IdP-specific differences. |
| H33 | Configure browser and CLI login | P1 / J05 | Google UI integration as implemented, redirect/cookie/TLS configuration and token handling; clearly distinguish server IdP support from UI support. |
| H34 | Provision users and manage ownership | P0 / J05 | SCIM Users/Me and CLI workflows, create/update/disable/delete as implemented, resource ownership and transfer constraints, safe admin handling. |
| H35 | Authenticate automated jobs with OAuth | P1 / J05 | Supported external client-credentials flow, scope configuration, mapping to a UC principal, token renewal and secure secret delivery. Gate on a reproducible OSS flow. |
| H36 | Grant and revoke least-privilege access | P0 / J05 | Parent and resource privileges, ownership/grant authority, read versus write, effective-permission inspection, negative tests and storage-side boundaries. |
| H37 | Expose UC securely and protect bootstrap material | P0 / J02 | TLS termination, network restriction, proxy/host/UI routing, secret redaction, persistent signing material, bootstrap-token handling and verified rotation/restart procedure. |
| H38 | Back up and restore a catalog deployment | P0 / J02, J11 | DB/policy/key/config backups, data-store coordination and managed commit state, restore rehearsal, RPO/RTO definition, integrity/access checks. |
| H39 | Upgrade an existing deployment to 0.6 | P0 / J11 | Starting-version branches, backup, DB changes, issuer/audience requirement, exchanged-token expiry, connector coordinates/defaults, restart and rollback limits. |
| H40 | Observe server health and diagnose operational failures | P1 / J02 | Existing logs and available instrumentation, safe diagnostics, DB/IdP/storage dependencies, probes and alerts. Do not invent metrics/audit APIs. |
| H41 | Troubleshoot authentication and permission failures | P0 / J05, J11 | Identity registration/mapping, issuer/audience, expired tokens, missing parent grants, ownership and effective permissions; preserve redaction. |
| H42 | Troubleshoot storage access and credential vending | P0 / J03-J04 | Role trust/KMS, cloud configuration, location matching/overlap, mount/path mismatch, expiry/cache, permissions; diagnose before recommending changes. |
| H43 | Troubleshoot connector and managed-commit failures | P1 / J03, J09 | Artifact mismatch, unsupported table features/operations, auth versus data access, stale/failed commits, retry and escalation boundaries. |

The presence of an operator guide does not certify the deployment pattern.
Especially for backups, multi-replica deployments, and key rotation, document
the tested topology and unresolved guarantees. Prefer a verified single-server
deployment with external persistence over an unsubstantiated HA walkthrough.

### 6.5 How-to: integration authors

| ID | Proposed article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H44 | Implement a Delta API client lifecycle | P1 / J10 | Config/protocol discovery, staging/create/load/update, credentials, requirements/etags, native Delta types, commits and safe retries, exists/rename/delete, supported errors. |
| H45 | Reuse UC cloud credentials in a Hadoop-based engine | P1 / J10 | Published Hadoop module, legacy versus Delta credential APIs, filesystem translation, renewal/cache scope, dependency/version boundaries. |
| H46 | Test a UC integration and contribute changes | P2 / J10 | Fixture setup, supported-operation/negative tests, contract versus server support, CI lanes and upstream development/contribution links. Do not invent a UC certification program. |

### 6.6 Reference: exhaustive facts, mostly derived from upstream

| ID | Proposed reference unit | Priority / journeys | Source and maintenance rule |
| --- | --- | --- | --- |
| R01 | Features, OSS scope, and limitations | P0 / J01 | Capability/operation matrix keyed by release; implemented, preview, provider-dependent, unsupported, and unverified labels are separate. [S03-S14] |
| R02 | Resource model, identifiers, types, and table/view kinds | P0 / J03, J08, J10 | Names, IDs/full names, formats versus table types, schema encodings including VARIANT, optional fields, view dependencies; distinguish accepted enums from creatable resources. [S04, S07] |
| R03 | Asset API reference: catalogs, schemas, tables, volumes, functions, models | P0 / all | Generate endpoint/model detail from pinned `api/all.yaml`; organize by resource; add short verified implementation-limit annotations, not duplicate CRUD prose. [S04] |
| R04 | Storage and credential API reference | P0 / J04-J05, J10 | Credentials, external locations, temporary table/path/volume/model-version credentials; scopes, operations, expiration, cloud-specific response fields. [S04, S18] |
| R05 | Users, ownership, and privileges | P0 / J05 | Actual securable/privilege matrix and parent/grant rules from API plus authorizer/service tests; SCIM subset, no fictional group support. [S05, S14] |
| R06 | Server and storage configuration | P0 / J02, J11 | Every implemented key, default, type, precedence, required conditions, secret classification, restart behavior and deprecation. Include indexed cloud settings beyond `ServerProperties.Property`. [S08] |
| R07 | Deployment, database, and Helm settings | P1 / J02 | Runtime, ports/paths, DB/driver support and tested topology; generate chart settings from the pinned chart; label defaults versus recommendations. [S09, S19] |
| R08 | Authentication and REST conventions | P0 / J05, J10 | Base paths, token exchange and `expires_in`, bearer/cookie distinctions, paging, error formats by API dialect, retries/idempotency where actually supported. [S04-S06] |
| R09 | Delta API protocol and endpoint reference | P1 / J10 | Generate from `api/delta.yaml`; supplement with staging/commit lifecycle, requirements/updates, concurrency and implementation limits. Keep preview API migration explicit. [S06, S07] |
| R10 | Engine, client, cloud, and operation compatibility | P0 / J01, J03, J09 | Tested version tuples and protocol; external/managed read/write/DDL/view/metric support, credential renewal, platform and cloud coverage. Link each test and task. |
| R11 | Python/Java client and AI package reference | P1 / J06-J07, J10 | Link/generated API for SDK lifecycle and callable interfaces, package-specific versions, supported Python types and client options. No server-version equality assumption. [S10, S11] |
| R12 | CLI command reference | P0 / J01, J05 | Generate from or verify against released CLI help; common endpoint/token/output options; every implemented resource command; example data operations carry clear limits. |
| R13 | SQL-view and metric-view compatibility reference | P1 / J08 | Engine-supported DDL/query operations and definition versions; stored/validated/interpreted fields; dependency and security constraints. Do not reproduce all Databricks YAML features. [S03, S07, S17] |
| R14 | Release notes and migration index | P0 / J11 | Curated user-impacting changes with links to upstream releases; server, connector and AI version tracks; archived docs and security upgrade notices. [S01-S03, S10] |

Generated API detail can ship incrementally by resource, but R03/R04 should cover
all implemented surfaces before declaring the rewrite complete. For APIs defined
more broadly than the OSS implementation, explicitly distinguish the contract
from server support.

## 7. Reuse, migration, and published-blog coverage

### Existing factory drafts

These are authoring inputs, not finished pages. Preserve in-progress user edits.

| Existing local page | Decision | Destination |
| --- | --- | --- |
| `tutorials/001-getting-started/` | Rework: currently pins 0.5.0, uses inline shell code, and mostly proves startup despite the summary promising resource creation. | T01; move runnable steps into tested colocated snippets. |
| `tutorials/002-python-client/` | Retain the useful flow; rebaseline pins, auth assumptions, snippet location and test coverage. | T11; R08 supplies shared endpoint/auth details. |
| `tutorials/003-write-and-read-delta/` | Split the multi-client intention into two single-engine tutorials and task-oriented engine guides. | T02/T03, H17-H20. |
| `tutorials/004-table-storage-formats/` → `how-to/001-table-storage-formats/` | Reclassify the task/reference portions; only keep a tutorial if it has a clear learning outcome. | H08, R02/R10. |
| `tutorials/004-manage-models-mlflow.md` | Expand into a tested lifecycle and separate ongoing tasks. | T07, H15, E08. |
| `tutorials/005-configure-backend-db/` → `how-to/002-configure-backend-db/` | Split selection rationale from procedure and learning. | E10, T10, H25/H26, R07. |
| `tutorials/006-seed-tpch-data/` → `how-to/003-seed-tpch-data/` | Keep as an optional data-preparation how-to/advanced fixture, not core onboarding. | Supporting article for T08 and advanced examples; preserve the tested seeder. |
| `tutorials/100-marimo-remote-storage/` | Defer until an upstream-compatible storage client is verified; an estate-only bridge belongs in open-lakehouse scope. | Optional follow-on to J04, not P0. |
| `how-to/001-uc-basics/` → `explanation/003-uc-basics/` | Reclassify conceptual material. Recheck bucket-root assumptions rather than treating every external location as a whole bucket. | E03, R02/R05. |
| `how-to/101-envoy-authentication/` | Defer the specialized Envoy recipe. First document supported UC auth and generic protected exposure. | H32/H37; optional later recipe if principal forwarding is validated. |
| `explanation/001-what-is-unity-catalog.md` | Retain motivation; make OSS boundaries concrete and remove unsupported blanket claims. | E01. |
| `explanation/002-credential-vending/` | Expand from the outline into a trust-boundary explanation. | E05. |

Backlog ideas belong in this plan, not placeholder published-content files with
`status: idea`. At authoring time use the accepted `draft`/`ready` intent values;
publication still requires the DB review/release lifecycle.

### Legacy docs migration map

Paths are legacy routes, not a promise of current reachability. Generate the
complete URL inventory and redirect manifest during the migration work.

| Legacy page family | New home | Treatment |
| --- | --- | --- |
| `/`, `/quickstart/`, `/docker_compose/` | E01/T01, H22 | Separate orientation, learning, and deployment. Preserve entry URLs with redirects. |
| `/usage/cli/`, `/usage/ui/` | R12, task-linked UI material | CLI reference replaces command catalog. UI gets a short verified browse/manage guide within the relevant task, not a duplicate workflow manual. |
| `/usage/tables/deltalake/`, `/usage/tables/formats/`, `/usage/tables/uniform/` | E04, T02/T03, H02/H03/H08/H19, R10 | Split storage format, table lifecycle, and Iceberg interoperability. |
| `/usage/volumes/`, `/usage/functions/`, `/usage/models/` | T04/T05/T07; H09-H15; E07/E08 | Extract task/concept/reference material; regenerate examples and outputs. |
| `/usage/metric-views/`, `/usage/api/delta/` | T08/H07/R13, H44/R09 | Make current feature pages reachable and version-specific. |
| `/usage/api/*` and generated API pages | R03/R04/R08/R09 | Do not hand-copy endpoint prose; regenerate pinned contracts and annotate OSS limits. |
| `/server/configuration/`, `/server/deployment/`, `/server/aws/` | R06/R07, H22-H31 | Split exhaustive settings from deployment and cloud tasks. |
| `/server/auth/`, `/server/users-privileges/`, `/server/google-auth/` | E06, T09, H32-H37/H41, R05/R08 | Preserve provider-specific detail as subordinate procedures, not the definition of all authentication. |
| `/integrations/unity-catalog-spark/`, DuckDB, Trino, Daft | H17-H20, R10 | First-party guides only after version/operation tests. |
| Other `/integrations/*` | H21/provider docs | Keep a working legacy page until a verified replacement or a clearly labeled provider-owned link exists. |
| `/ai/quickstart/`, `/ai/usage/`, `/ai/client/` | T05/T06, H11-H14, R11 | Default to OSS; explicitly route Databricks client readers to the managed-product documentation. |
| `/ai/integrations/*` | H13/H14 plus maintained provider recipes | LlamaIndex, Anthropic, CrewAI, AutoGen, LiteLLM, Gemini, and DSPy need individual validation/owners. Consolidate shared setup, not framework semantics. |

There should be no silent deletion of a user journey. For every old URL record:
retain, replace/redirect, split with a primary destination, or archive with a
reason. Redirect important old anchors where feasible. Blog-to-doc links should
be updated to the canonical destination, not to a generic homepage.

### How the published blogs inform documentation

| Published source | Useful documentation seed | Claims/examples to recheck |
| --- | --- | --- |
| Unity Catalog 101; data-catalog and metadata explainers | E01/E03 | Broad governance language is not an OSS feature matrix. |
| 0.2 and 0.3.1 release posts [B01, B02] | R14, historical version boundaries | Announcement date versus release date; older connector/package instructions. |
| Spark/Delta and open-API Spark integration posts [B11] | T02, H17 | Artifact coordinates, token handling, cloud setup and catalog naming. |
| Managed versus external tables; introducing managed tables [B03, B12] | E04, T03, H03/H05 | Storage ownership versus coordinated commits; deprecated settings; future capabilities versus shipped implementation. |
| Introducing the UC Delta API [B04] | H44, R09 | Versioned API versus preview paths; actual lifecycle operations in the selected release. |
| Fighting entropy with metric views [B05] | E09, T08, H07 | Engine/YAML version and richer definition features; stored metadata is not verified execution. |
| MLflow/model-catalog post [B06] | T07, E08, H15 | Current MLflow integration, OSS artifact permissions, no implied serving/stage parity. |
| Volumes and functions posts [B07, B08] | T04/T05, H09-H12 | Actual client file/function execution, managed/external creation and deletion, dependencies. |
| Auth post [B09] | E06, H32/H33 | Current issuer/audience validation, token expiry and UI versus server IdP support. |
| AI release/overview, LangChain, OpenAI and LlamaIndex posts [B10, B13] | T06, H13/H14, R11 | Independent package versions and OSS versus Databricks clients. |
| Medallion architecture, data silos, graph/analytics integrations [B14] | Contextual links or optional follow-on journeys | Do not promote lineage, fine-grained policies or an ecosystem integration into an official server guarantee. |

Blogs remain narrative/history. Once a feature has current documentation, its
blog should send readers to that durable explanation/task/reference, rather than
remain the only practical guide.

## 8. Inspiration: patterns worth adopting

| Project | Observed pattern | What to adopt here | What not to copy |
| --- | --- | --- | --- |
| Diataxis [D01] | Four documentation forms correspond to distinct user needs. | Enforce article purpose even when navigation is audience-oriented. | A folder label alone does not turn a mixed article into a tutorial or reference. |
| Kubernetes [D02] | Concepts, Tutorials, Tasks, Reference; separate learning and production setup. | Local learning versus shared deployment, task-oriented operations, version-aware reference. | Its vast component hierarchy or implied maturity/HA guarantees. |
| PostgreSQL [D03] | Tutorial, SQL usage, Server Administration, Client Interfaces, Reference. | Treat running the service and consuming it as different jobs; give backup/recovery real space. | A monolithic manual or database-engine internals unrelated to UC users. |
| MLflow [D04] | Separate ML and LLM/agent entry paths, API Reference, Self-Hosting, and OSS versus Databricks entry points. | AI/ML journey entry points and explicit product boundaries; self-hosting should be easy to find. | Letting managed-product examples become the default OSS instructions. |
| DuckDB [D05] | Task/client-oriented navigation, separate Guides and Operations Manual, current/preview/LTS versions, Markdown views. | Scan-friendly client setup, exact compatibility, durable reference, readable agent-facing exports. | Nightly extension setup as an unexplained default or a generic "all engines" claim. |
| Lakekeeper [D06] | Bootstrap, storage/auth, engine integration, configuration, production checklist, gotchas, and versioned docs. | A catalog-specific operator checklist and protocol-aware engine guides. | Copying its governance, table-maintenance, or commercial features into UC scope. |

The intended result is closer to a concise operator manual plus a practitioner
handbook than to marketing pages or a long sequence of numbered feature demos.

## 9. Delivery sequence and decisions

### Phase 0: agree the boundary and build the evidence baseline

Before writing the majority of articles:

1. Confirm `v0.6.0` as the initial documented server baseline. Recheck official
   releases immediately before publishing.
2. Establish R01/R10 as living scope/compatibility records, with the exact source
   commit, artifacts, test status and ownership.
3. Select one tested Spark/Delta/connector tuple for T02/T03. The 0.6 release
   notes suggest Spark 4.1 with the matching connector and Delta 4.4.0; treat that
   as a candidate until artifact resolution and tests pass.
4. Resolve the Spark 4.2/4.3, Delta artifact, and metric-YAML conflicts separately
   for T08/H06/H07/R13. Catalog-only creation is not an acceptable substitute
   for a tutorial that promises query execution.
5. Verify AI package versions and choose one maintained framework for T06.
   Prefer LangChain if its current OSS path passes; keep the base function
   tutorial framework-independent.
6. Choose PostgreSQL as the first shared-deployment example and AWS as the first
   cloud-storage example. This is a sequencing decision, not a claim that other
   backends/clouds are unsupported.
7. Agree navigation and canonical ID/redirect rules without changing the
   emitter or parser in this content-scoping change.

### Phase 1: first coherent core documentation release

Publish an end-to-end core, not isolated high-priority pages:

- Orientation and foundations: E01-E07/E10, R01/R02/R05/R06/R08/R10/R12/R14.
- Learning: T01-T03, T05, T09-T11.
- Practitioner tasks: H01-H03 and H17.
- Operator/security tasks: H22/H25/H27/H28/H32/H34/H36-H39/H41/H42.
- Asset/storage API reference: generated R03/R04, initially with baseline
  implementation-limit notes.

Dependencies matter: do not publish the managed-table task before its storage
and client prerequisites, or the security tutorial before identity mapping and
privilege reference. Keep unrelated existing legacy routes working while the
remaining feature coverage is authored.

### Phase 2: complete the shipped feature set and primary integrations

Add all P1 articles: volumes/files, models/MLflow, SQL and metric views, AI tools,
Java SDK, DuckDB/Trino/Daft, Azure/GCS, Helm, storage migration, operator
observability, and integration-author Delta/Hadoop guidance.

This is the point at which the rewrite can replace the current documentation
in full, provided every legacy journey has a tested replacement or an explicit,
maintained external destination. A failing/unverified integration is not
"supported"; state its boundary and keep the reader's known-working version
available.

### Phase 3: optional depth and ecosystem expansion

Only after an owner and tests exist:

- MySQL and additional deployment topologies.
- Additional AI-framework recipes.
- Provider-owned graph/analytics/XTable integrations.
- Bulk registration/import, metadata-as-code examples, and migration from other
  metastores, with supported field mappings and failure/rollback behavior.
- TPC-H/medallion examples, advanced functions and richer semantic definitions.
- Specialized proxy authentication, Marimo/storage-client recipes, or an
  independently validated multi-replica deployment.

### Decisions still requiring confirmation

The recommendations above let authoring start; these are explicit design or
verification gates rather than reasons to postpone the entire rewrite:

| Decision | Proposed default | Gate/owner |
| --- | --- | --- |
| Supported versions | Current released server baseline plus an archived old site; do not imply maintenance of every historical version. | UC maintainers confirm supported release policy. |
| Default engine | One released Spark tuple for external and managed Delta; separate views/metric tuple. | Connector maintainer plus docs CI. |
| Operator topology | Single UC server with PostgreSQL, protected network/TLS, persistent signing material. | Server/operator reviewer verifies recovery and key lifecycle. |
| IdP fixtures | Local controlled IdP for CI; Google as a verified human-login recipe. | Security reviewer confirms mapping and token behavior. |
| AI framework | Standalone OSS function client first, one framework next. | AI package maintainer confirms releases and supported APIs. |
| Integration ownership | First-party guides only for tested paths; provider-owned directory otherwise. | Named reviewer for each engine/framework. |
| Navigation metadata | Canonical Diataxis source; explicit small navigation projection. | Resolved 2026-10-03: per-project `nav.yml`. |

### Status and next content after the 2026-10-04 review

Written and CI-tested: E01, E03, E04; T01, T03, T04, T05, T11; H01, H02, H09,
H17, H18, H20, H27, H28; R01, R10; the TPC-H seed how-to; and the shared local
environment page (`how-to/run-local-server`, backed by `envs/unitycatalog/`).
R03 is covered for now by the interactive OpenAPI pages on the docs site. The
review consolidated per-page compose files into that shared environment,
rewrote tutorials as task steps in an interactive session, and moved 0.6.0
quirks into R01's "Known issues in 0.6.0".

The learning path in `nav.yml` now runs E01 → T01 → local environment → R10,
then T11 → T03 → T04 → T05. These gaps keep the initial version from being
coherent, in priority order:

1. **E05 Credential vending.** About ten pages link it (T04, H02, H09, H17,
   H20, H27, E01, E03, E04, R10), and the emitted site unwraps those links to
   text until it exists. It is the trust boundary behind every storage page.
2. **H32 + H36, or T09.** Every how-to lists required privileges, but no page
   shows how to enable authorization, map an identity, or grant and revoke.
   T09 (two users, one permitted and one denied operation) covers the learning
   path; H32/H36 cover the tasks.
3. **T10/H25 PostgreSQL persistence.** The "Operate" section has no written
   page. The local server loses its metadata on restart, which the
   environment page has to keep warning about; T10 is the natural next step
   from it.
4. **T02 Register and query an existing Delta table with Spark.** The gap
   between T01 (CLI) and T03 (managed tables). Alternatively, retire T02 and
   point the path at H02 + H17, which already cover the steps.
5. **H22 Deploy a persistent server with containers.** Together with H25,
   H32, and H37, the minimum safe-operation story.

Next tier: E02 (server, clients, and storage), T07/H15 MLflow (stub page in
nav, status `idea`), H08 non-Delta formats (stub, linked from H02), H39
upgrade to 0.6, H42 troubleshoot credential vending, and T08 metric views.

## 10. Authoring and verification contract

Every article needs a concrete promise, prerequisites, outcome, support boundary,
and source record. Avoid tutorial branches for alternative engines, clouds, or
IdPs; link to how-to guides instead.

### Examples and fixtures

- Use portable Markdown and `file=` fences, not copied inline executable code,
  JSX, or target-site-specific components.
- Runnable Python lives in page-local `snippets/`, declares PEP 723 dependencies
  and service requirements, and asserts the result. Seeding/cleanup/assertion
  scaffolding stays outside rendered regions.
- Pin the release/artifact tuple actually tested; record dependency upgrades
  deliberately. A loose package lower bound alone is not a compatibility test.
- Reuse deterministic datasets and service fixtures without making readers
  navigate a large shared setup tree. Avoid dependence on bundled demo
  databases or paths accidentally shared between host and container.
- Shell, SQL, JSON/YAML, policies, Compose and Helm assets need their own
  validation/execution path. The current Python snippet harness does not
  automatically test every displayed shell/SQL command; add focused runners or
  Python drivers that execute those exact files.
- Tutorial tests start from an empty fixture, assert observable outcomes, and
  clean up only resources created by that example. Mark destructive tasks
  prominently and distinguish metadata deletion from physical data deletion.
- Never use unscoped IAM permissions, non-expiring bootstrap tokens, or disabled
  authorization as unexplained shared-deployment defaults. Local auth-disabled
  examples must be clearly isolated and must not become production recipes.

### Test lanes

| Lane | Minimum coverage | Publication rule |
| --- | --- | --- |
| Static/default | Frontmatter, source fences, link/anchor resolution, parsed policy/config assets, offline functions/data fixtures. | Required on every content change. |
| Service | Pinned UC/PostgreSQL, client CRUD, namespace/table/view/volume/model metadata, restarts. | Required for articles making those claims; Docker unavailability must not count as a pass. |
| Security | Controlled IdP, ordinary principals, parent/resource grants, permitted and denied operations, token expiry/refresh, cache isolation. | Required for auth/grants/vending guides. No exploit-reproduction recipes are needed. |
| Engine | Exact Spark/Delta/connector versions and supported SQL; DuckDB/Trino/Daft on their declared protocols. | R10 links to the passing test for each supported operation tuple. |
| Cloud | Scoped AWS/ADLS/GCS access and refresh using CI workload identity; cloud cleanup/account-cost controls. | A mock-only credential response does not certify cloud access or IAM policy. |
| Operations | Restart, backup/restore, selected upgrade path, persistence of policies/signing/managed state. | Required before calling an operator runbook verified. |
| AI/ML | Offline model registry lifecycle, callable/tool schemas and execution, deterministic mocked model interaction. | Real external LLM calls are optional smoke tests, not the core CI requirement. |

Reference should be generated from a pinned upstream input where practical.
Generation does not certify implementation: overlay a small maintained support
record derived from tests, especially for enum values, privileges and endpoints
defined more broadly than the OSS server implements.

### Definition of done

An article is ready when its promised task passes against the stated release,
its behavior claims have primary-source evidence, and a reader has reviewed the
workflow from its declared starting point. Security/operations articles also
need the relevant technical reviewer.

The replacement is ready when:

- Every implemented resource and current release feature is accounted for in
  R01, even if its support is limited or preview-labeled.
- J01-J11 have navigable, verified paths.
- Every old URL has a migration disposition and important inbound links survive.
- Docs, reference, compatibility, and snippets use the same release boundaries.
- No task silently requires Databricks, a fork, an unpublished artifact, or a
  service outside the declared OSS path.
- Publication honors `ready` plus DB `released`; navigation and emission do not
  accidentally expose drafts. Build-time `llms.txt` retains the repo's documented
  intentional review-state skew.

## 11. Convention proposals and later emission work

The audit exposes convention gaps worth resolving explicitly in follow-up
changes. This plan proposes the following concrete additions; it does not
silently change them.

### Proposed additions to `content/README.md`

1. **Canonical content versus navigation:** "Each page has exactly one Diataxis
   home. Audience/topic navigation references that page's canonical ID and may
   link to it from multiple groups. It must not duplicate prose or alter URLs
   when navigation changes."
2. **Support evidence:** "Every procedural page states its tested product/client
   versions and links to the compatibility record. A source/manifest records
   upstream tag or commit, test lane, reviewer, and verification date. Metadata
   accepted by an API is not automatically supported engine behavior."
3. **OSS boundary:** "Core project guides must run against released official OSS
   artifacts. Managed-product, fork-only, roadmap and ecosystem behavior must be
   labeled and kept outside the core happy path."
4. **Executable assets:** "All displayed executable examples are colocated
   `snippets/` assets, regardless of Diataxis category. Python uses PEP 723; shell,
   SQL and configuration assets need an explicit validation/execution driver."
5. **Idea versus authoring state:** "Keep unstarted ideas in an editorial plan;
   content pages use `draft` or `ready`, not `idea`."

Also reconcile existing `content/README.md` passages that still describe shared
`examples/` and tutorial scripts directly beside `index.md` with the authoritative
colocated-`snippets/` convention in `AGENTS.md`. Do this as a deliberate
conventions update, not an excuse to restructure existing user work now.

### Requirements for extending the emitter later

Superseded by [`docs-site-emission.md`](./docs-site-emission.md), which emits to
a dedicated static site rather than MkDocs. The list is kept as the checklist
that design answers. Do not extend `emit/` as part of this scope proposal.
Capture these requirements for its design:

- Docs emission is project/version/inventory-oriented, not just blog-slug
  delivery. Preserve canonical source, frontmatter, relative assets, links and
  snippet resolution through the shared content-core contract.
- Generate target navigation from the canonical inventory plus the approved
  audience/topic projection. Diataxis remains in source even if the target
  sidebar is task/audience-oriented.
- Emit generated reference from its pinned input reproducibly; retain source and
  compatibility provenance.
- Rewrite internal links, model references, assets, and anchors deterministically;
  validate the emitted site, not only the source Markdown.
- Deliver redirects/archive mappings alongside content. Do not leave old docs
  paths pointing at a generic landing page.
- Define release-version and review/publication selection explicitly. Blog
  delivery semantics must not accidentally publish every `draft` doc.
- Keep `llms.txt` generated from canonical documentation. Do not index navigation
  hubs, repeated links, or duplicated emitted copies as separate content.

## 12. Source register

All sources were consulted on 2026-10-01. URLs are recorded as literal source
identifiers so this plan remains usable outside the preview renderer.
Repository sources use the release tag above; resolve to the recorded commit
when producing immutable article evidence.

### Official release, implementation, and documentation sources

| ID | Source |
| --- | --- |
| S01 | Official release history and publication metadata: `https://api.github.com/repos/unitycatalog/unitycatalog/releases?per_page=100`; human index: `https://github.com/unitycatalog/unitycatalog/releases`; tag resolution: `https://api.github.com/repos/unitycatalog/unitycatalog/git/ref/tags/v0.6.0`. |
| S02 | Individual release notes: `https://github.com/unitycatalog/unitycatalog/releases/tag/v0.3.0`, `https://github.com/unitycatalog/unitycatalog/releases/tag/v0.3.1`, `https://github.com/unitycatalog/unitycatalog/releases/tag/v0.4.0`, `https://github.com/unitycatalog/unitycatalog/releases/tag/v0.4.1`, `https://github.com/unitycatalog/unitycatalog/releases/tag/v0.5.0`, `https://github.com/unitycatalog/unitycatalog/releases/tag/v0.5.1`. |
| S03 | Current server release notes: `https://github.com/unitycatalog/unitycatalog/releases/tag/v0.6.0`. |
| S04 | Main resource contract: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/api/all.yaml`. |
| S05 | Identity/auth contract: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/api/control.yaml`. |
| S06 | Delta REST contract and generated reference: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/api/delta.yaml`; `https://github.com/unitycatalog/unitycatalog/tree/v0.6.0/api/delta-docs`. |
| S07 | Managed-table protocol/implementation and view validation: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/spec/protocols/ManagedTablesSpec.md`; `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/server/src/main/java/io/unitycatalog/server/persist/TableRepository.java`; `https://github.com/unitycatalog/unitycatalog/tree/v0.6.0/server/src/main/java/io/unitycatalog/server/service/delta`. |
| S08 | Configuration authority: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/server/src/main/java/io/unitycatalog/server/utils/ServerProperties.java`; `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/etc/conf/server.properties`; `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/etc/conf/hibernate.properties`. |
| S09 | Helm implementation/settings: `https://github.com/unitycatalog/unitycatalog/tree/v0.6.0/helm`; especially `Chart.yaml`, `values.yaml`, `README.md`, and server/UI templates. |
| S10 | Separately released AI baseline: `https://github.com/unitycatalog/unitycatalog/releases/tag/ai-v0.4.0`; caller-side execution: `https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/client.py`. |
| S11 | AI core guidance and current tagged quickstart: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/ai/core/README.md`; `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/ai/quickstart.md`. For final package-specific examples, use the selected AI release tag rather than the server tag. |
| S12 | Iceberg REST supported endpoints/authorization: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/server/src/main/java/io/unitycatalog/server/service/IcebergRestCatalogService.java`. |
| S13 | Managed/external volume implementation: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/server/src/main/java/io/unitycatalog/server/persist/VolumeRepository.java`. |
| S14 | Actual server authorization: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/server/src/main/java/io/unitycatalog/server/UnityCatalogServer.java`; `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/server/src/main/java/io/unitycatalog/server/auth/JCasbinAuthorizer.java`; service authorization annotations. |
| S15 | Live documentation/navigation: `https://docs.unitycatalog.io/`; usage tables/functions/models, server auth/users, and integration pages. Compare with release source rather than assuming live deployment equals `main`. |
| S16 | Tagged AWS guide: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/server/aws.md`. |
| S17 | Tagged metric-view guide: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/usage/metric-views.md`. |
| S18 | Cloud/storage credential implementation boundary: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/server/src/main/java/io/unitycatalog/server/service/CredentialService.java`; cloud credential services under `server/src/main/java/io/unitycatalog/server/service/credential/`. |
| S19 | Tagged documentation inventory: `https://github.com/unitycatalog/unitycatalog/tree/v0.6.0/docs`; navigation: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/mkdocs.yml`; deployment guide and Spark/Daft/Trino integration guides within that tree. |
| S20 | Tagged old DuckDB guidance: `https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/docs/integrations/unity-catalog-duckdb.md`. |
| S21 | DuckDB's current UC extension guidance: `https://duckdb.org/docs/current/core_extensions/unity_catalog.html`. |

### Published Unity Catalog blogs

The published blog index was inspected alongside the sibling
`unitycatalog-website/src/content/blog/` source. Blog timestamps are narrative
publication dates, not product release dates.

| ID | Source |
| --- | --- |
| B01 | 0.2 announcement, 2024-10-08: `https://unitycatalog.io/blogs/unity-catalog-0-2-introduces-models-mlflow-and-spark-integration-and-support-for-external-identity-providers/`. |
| B02 | 0.3.1 announcement, 2025-12-12: `https://unitycatalog.io/blogs/introducing-unity-catalog-0-3-1-release/`. |
| B03 | Managed tables, 2026-03-03: `https://unitycatalog.io/blogs/introducing-unity-catalog-managed-tables/`. |
| B04 | Delta API, 2026-07-03: `https://unitycatalog.io/blogs/unity-catalog-delta-api/`. |
| B05 | Metric views, 2026-08-24: `https://unitycatalog.io/blogs/uc-metric-views/`. |
| B06 | Models/MLflow, 2025-01-15: `https://unitycatalog.io/blogs/building-an-ml-and-ai-data-catalog-with-unity-catalog/`. |
| B07 | Volumes, 2025-04-07: `https://unitycatalog.io/blogs/how-to-use-unity-catalog-volumes/`. |
| B08 | Functions, 2025-07-25: `https://unitycatalog.io/blogs/working-with-functions-in-unity-catalog/`. |
| B09 | Authentication/authorization, 2025-01-29: `https://unitycatalog.io/blogs/authentication-authorization-unity-catalog/`. |
| B10 | AI 0.3.0 announcement, 2025-04-22: `https://unitycatalog.io/blogs/introducing-unity-catalog-ai-0-3-0-release/`. |
| B11 | Spark/Delta and Spark open APIs: `https://unitycatalog.io/blogs/unity-catalog-spark-delta-lake/`; `https://unitycatalog.io/blogs/integrating-apache-spark-with-unity-catalog-assets-via-open-apis/`. |
| B12 | Managed/external tables, 2025-05-27: `https://unitycatalog.io/blogs/managed-vs-external-tables/`. |
| B13 | AI overview and frameworks: `https://unitycatalog.io/blogs/unity-catalog-for-AI/`; `https://unitycatalog.io/blogs/unity-catalog-and-langchain/`; `https://unitycatalog.io/blogs/unity-catalog-and-openAI/`; `https://unitycatalog.io/blogs/unity-catalog-and-LlamaIndex/`. |
| B14 | Discovery/context sources: `https://unitycatalog.io/blogs/`; includes Unity Catalog 101, data catalogs/metadata, medallion architecture, data silos, and graph/analytics integration posts. |

### Documentation design sources

| ID | Source |
| --- | --- |
| D01 | Diataxis framework: `https://diataxis.fr/`. |
| D02 | Kubernetes docs, learning/production setup and content categories: `https://kubernetes.io/docs/home/`. |
| D03 | PostgreSQL manual organization: `https://www.postgresql.org/docs/current/index.html`. |
| D04 | MLflow documentation entry points: `https://mlflow.org/docs/latest/index.html`. |
| D05 | DuckDB current documentation/navigation: `https://duckdb.org/docs/current/`; older stable index redirects here. |
| D06 | Lakekeeper documentation/navigation: `https://docs.lakekeeper.io/`. |

Local convention evidence: `AGENTS.md`, `content/README.md`, `docs/README.md`,
`site/src/sidebar.ts`, `site/src/content-core/`, and the existing
`content/unitycatalog/` inventory. This plan belongs in factory design, not the
lakehouse architecture model, published reference content, or a blog draft.
