# Delta Lake documentation plan

Date: 2026-10-04

Status: Proposal for scope and sequencing; not an implementation commitment

Scope: The Delta Lake table format and the open source engines and libraries
that read and write it: Delta Spark (`delta-io/delta`), delta-rs (the Rust and
Python `deltalake` packages), and Delta Kernel (Rust and Java). Other engines
appear where their Delta support can be tested.

Baselines (recheck before pinning examples):

- Delta Spark `v4.4.0`, published 2026-08-20; Apache Spark 4.2 by default, with
  4.1 and 4.0.1 still supported. [S01, S02]
- Python `deltalake` `1.6.6`, uploaded 2026-09-24. [S10]
- Rust `deltalake` crate: the local checkout's core crate is `2.0.0` while the
  newest tag is `rust-v3.0.0`. Resolve the published crate version before
  pinning Rust examples. [S11]
- Protocol: `PROTOCOL.md` plus the accepted RFCs under `protocol_rfcs/accepted/`
  at the release tag. [S04, S05]

Companion to [`unitycatalog-documentation-plan.md`](./unitycatalog-documentation-plan.md).
That plan's authoring contract (§10), convention proposals (§11), and emitter
requirements (now [`docs-site-emission.md`](./docs-site-emission.md)) apply here
unchanged unless this document says otherwise. Navigation lives in
[`content/delta/nav.yml`](../../content/delta/nav.yml).

## 1. Recommendation

Build a **format-first** Delta Lake site. Delta is a specification with several
independent implementations, and the documentation should be organized that
way: what the format guarantees, which tasks readers perform on a table, and
which engine performs them. The current docs.delta.io treats Delta as a Spark
connector with a few other engines attached; delta-rs and Kernel each have a
separate site that most readers never find.

Reader-facing sections:

- **Start here**: what Delta is, a feature-by-engine matrix, a first table, and
  how to choose an engine.
- **Use Delta tables**: tutorials and task guides for reading, writing,
  schema, history, layout, and table features.
- **Run in production**: object storage and concurrent writers, catalogs,
  upgrades, and troubleshooting.
- **Engines and integrations**: one page per tested engine or client, saying what
  that engine supports and how to configure it.
- **Build connectors**: Delta Kernel and the acceptance tests.
- **Concepts** and **Reference**, shared by every section above.

Two decisions shape everything else:

1. **Tutorials default to the Python `deltalake` package.** It installs with
   pip, needs no JVM, and is already used by the existing pages and the seed
   helper. Spark gets its own tutorial track (T06, T07) and appears as an
   interface tab (`:::tab[Spark SQL]`, `:::tab[PySpark]`) in how-to guides
   wherever it supports the task.
2. **API reference links out.** The delta-rs mkdocstrings site, docs.rs, and
   Spark Scaladoc stay authoritative for signatures. This site owns the
   task-level and cross-engine material none of them has: which engine supports
   which feature, how features interact, and what a table property does
   regardless of who writes it.

Keep Diátaxis as the content architecture. Every page has one canonical home in
`tutorials/`, `how-to/`, `explanation/`, or `reference/`; the sections above are
a `nav.yml` projection over those folders.

The backlog (§6) has 10 tutorials, 12 explanations, 51 how-to guides, and 13
reference units. As in the UC plan these are planning units: several reference
units are generated, and P2 entries need an owner before they are written.

## 2. Evidence and research boundaries

### Method

This proposal compares:

- docs.delta.io: the live site and its source in `delta-io/delta` (`docs/`,
  an Astro Starlight site). [S06, S07]
- `PROTOCOL.md` and the protocol RFCs in the same repository. [S04, S05]
- The delta-rs documentation (`delta-rs/docs`, mkdocs) and Python package
  source. [S08, S09]
- The Delta Kernel Rust user guide (mdBook). [S12]
- The Databricks Delta Lake documentation, for task coverage and page
  patterns, never as evidence of OSS behavior. [D01-D04]
- LanceDB, PyIceberg, and Apache Iceberg documentation, as design references. [D05-D08]
- The existing `content/delta/` drafts and this factory's conventions.

Local sibling checkouts (`../delta`, `../delta-rs`,
`../delta-kernel-rs-user-guide`, `../dat`) were used for orientation. The
`delta` checkout's last commit is 2026-05-28 (`4.3.0-SNAPSHOT`), older than the
4.4.0 release. Release facts therefore come from the published release pages,
and per-feature claims must be rechecked at the release tag.

Authority order when sources disagree:

1. Behavior reproduced with a pinned published artifact.
2. Release-tagged implementation and tests, including DAT results.
3. `PROTOCOL.md` and accepted RFCs at the release tag.
4. Current official documentation (docs.delta.io, delta-rs docs, Kernel guide).
5. Published blogs and release announcements.
6. Databricks documentation, issues, roadmaps, and research reports: leads only.

`research/table-formats/` is a secondary artifact with many single-source
cells. Use it as a hint for where to look, never as the source of an engine
support claim.

### Limits of this audit

This is a scope audit, not a conformance test. No Spark session, delta-rs
write, or cloud bucket was used. Engine support cells in this document are
labeled *documented* (an engine's own docs claim it) or *unverified*. The
R01/R10 matrices must be derived from tests (§10).

### Release history that changes documentation scope

| Release | Published | Consequence for the docs |
| --- | --- | --- |
| Delta 3.0–3.3 | 2023–2025 | Spark 3.5 line. Liquid clustering, row tracking, UniForm, and the type-widening preview (3.2) arrive here; keep an archived version boundary instead of carrying 3.x examples forward untested. |
| Delta 4.0 | 2025 | Spark 4.0. Delta Connect (preview), fully supported type widening (3.2 tables carry `typeWidening-preview`), and catalog-managed tables from 4.0.1 change the feature and engine matrix. [S07] |
| Delta 4.2.0 | 2026-04-17 | Spark 4.0/4.1. [S02] |
| Delta 4.3.0 | 2026-06-22 | Spark 4.0/4.1; Iceberg 1.11 for UniForm. [S02] |
| Delta 4.4.0 | 2026-08-20 | Spark 4.2 default (4.1 and 4.0.1 supported); identity columns in SQL DDL; `SHOW PARTITIONS`; VOID columns preserved; generated columns preserved for Unity Catalog tables; pairs with UC 0.6.0 for metric views over catalog-managed tables. [S01, S03] |
| deltalake (Python) 1.0 | 2025 | Breaking API changes with an upgrade guide; the 1.x line is the tutorial baseline. [S08] |
| deltalake (Python) 1.6.6 | 2026-09-24 | Current pin candidate. [S10] |
| delta-rs on Kernel | 2026 | delta-rs depends on a Kernel build (`buoyant_kernel` 0.28 in the workspace `Cargo.toml`). Reader feature support increasingly follows Kernel, which matters for R01. [S11] |

### Current capability boundary

This is the scope baseline, not the public compatibility matrix.

| Area | Evidence | Documentation implication |
| --- | --- | --- |
| Table features | The `PROTOCOL.md` "Valid Feature Names" table lists 19 features. Variant (`variantType`, `variantShredding`) is specified in the body but missing from that table; type widening is an accepted RFC that does not appear in `PROTOCOL.md` at all. [S04, S05] | R02 must reconcile the spec body, accepted RFCs, and the feature-name table, and say which source each entry comes from. |
| Spark | Every feature on docs.delta.io is documented for Spark. [S07] | Spark is the reference writer, but its version tuple (Delta × Spark × Scala) has to appear on every Spark example. |
| delta-rs | Its feature table documents writer versions 2–7 except identity columns, and reader versions 2–3. It is silent on deletion vectors, liquid clustering, row tracking, type widening, variant, and v2 checkpoints. [S09] | No delta-rs support claim for those features until tested. "Supports table features (writer v7)" does not mean "supports every feature". |
| Kernel | The Rust user guide covers scans, filter pushdown, time travel, CDF, create/append/partitioned writes, domain metadata, idempotent writes, checkpoints, and catalog-managed tables. [S12] | Kernel is the connector-author story (Build connectors), not a practitioner tutorial path. |
| Storage | Spark: S3 single-cluster by default, multi-cluster through `S3DynamoDBLogStore`; Azure Blob/ADLS; GCS; HDFS; IBM COS and OCI. delta-rs: DynamoDB locking, conditional put (`aws_conditional_put`), or `AWS_S3_ALLOW_UNSAFE_RENAME`. [S07, S09] | Multi-writer safety differs per engine **and** writers must agree on the mechanism. This is the most consequential production page (H27) and needs its own concept page (E08). |
| Catalog-managed tables | `catalogManaged` is a reader-writer feature; Kernel and Delta Spark implement catalog commits; UC 0.6.0 is the reference OSS catalog. [S04, S12] | Explain the protocol here (E10). Catalog setup tasks stay canonical in the UC docs (UC H03/E04/H17) and are linked, not duplicated. |
| UniForm | `icebergCompatV1/V2` are writer features; Delta writes Iceberg metadata alongside Delta. [S04, S07] | Present UniForm as making a Delta table readable by Iceberg clients. It is not a writable Iceberg table. |
| Delta Sharing | Documented as reading shared tables from Spark. [S07] | P2. A sharing server is a separate product; keep to the reader-side task. |

### What not to promise

Do not write procedural documentation that implies the following unless a test
proves it for the named engine and version:

- Databricks platform features: predictive optimization, auto optimize/auto
  compaction as a service, Photon, automatic liquid-clustering key selection,
  serverless, Lakeflow pipelines, or Databricks-only SQL syntax.
- delta-rs writing deletion vectors, row tracking, identity columns, type
  widening, or liquid-clustered layouts; or delta-rs reading any feature its own
  feature table does not list.
- UniForm tables accepting Iceberg writes, or Iceberg clients seeing deletion
  vectors written before compatibility was enabled.
- Safe concurrent writes from mixed engines on S3 just because each engine has
  *a* locking option. Writers must share one mechanism.
- High availability or exactly-once behavior just because a LogStore or
  streaming sink is configured.
- Identical semantics for the same SQL across engines (MERGE, schema evolution,
  overwrite modes, and constraint enforcement differ).

Lakehouse estate work (catalogs, governance, Breakwater, Mangrove) belongs in
`content/open-lakehouse/` or the UC site. It must not quietly fill gaps in a
page labeled Delta Lake.

## 3. What the current material gets wrong or leaves unclear

| Finding | Evidence | Proposed response |
| --- | --- | --- |
| Delta is presented as a Spark connector. | The docs.delta.io sidebar puts every feature page under "Apache Spark connector"; Trino, Flink, Hive, and Starburst pages are 200–700 byte stubs; delta-rs is not in the nav. [S06, S07] | A format-first nav. Engines are a section with tested, per-engine pages. |
| Pages mix every Diátaxis type. | `delta-batch.mdx` (66 KB) and `delta-update.mdx` (44 KB) combine setup, walkthroughs, every option, and caveats; the Kernel pages are over 80 KB. [S07] | Split into task-sized how-tos, with exhaustive options moved to reference (R03, R05, R06). |
| Version information is stale. | `releases.mdx` stops at Delta 4.0.x even though 4.4.0 has shipped; delta.io's `learn/getting-started` still targets Delta 2.1.0. [S07, S13] | R11 is a maintained release/compatibility index; every procedural page states its tested tuple. |
| No cross-engine feature view. | Spark documents everything, delta-rs keeps its own partial table, and Kernel documents its own features. Nowhere says "can my reader open this table?" [S07, S09, S12] | R01 feature-by-engine matrix, generated from a test-backed support record; H24/H36 explain the consequences. |
| The spec's feature list is incomplete. | `variantType`, `variantShredding`, and `typeWidening` are absent from PROTOCOL.md's feature-name table. [S04, S05] | R02 notes the source of each feature; raise the gap upstream instead of hiding it. |
| Storage guidance is per engine and doesn't explain the mixed-engine case. | docs.delta.io describes `S3DynamoDBLogStore`; delta-rs describes its own DynamoDB provider and conditional put; neither covers both writing one table. [S07, S09] | E08 explains the guarantees; H27 covers the configuration for each engine *and* the combination. |
| No conflict reference. | Concurrency control describes isolation levels but no exception-by-exception diagnosis; delta-rs errors are undocumented. [S07, S09] | R09 conflict exceptions per engine; H35 troubleshooting by symptom. |
| delta-rs docs are good but hard to find. | Task-oriented usage pages and storage pages exist, but UC access is buried in "Loading a table", there is no DuckDB page, and Rust is docs.rs only. [S08] | Absorb the cross-engine task material into this site; link to the delta-rs site for API reference; agree the split with maintainers (§9). |

## 4. Audiences and user journeys

Personas are entry points:

- **Evaluator**: wants to know what Delta gives over plain Parquet, and whether
  their engines can use it.
- **Data practitioner**: writes pipelines and notebooks in Python, SQL, or Spark.
- **Platform engineer**: runs tables on object storage with several writers and
  engines, and owns upgrades.
- **Connector author**: implements Delta support in an engine, using Kernel or
  the protocol directly.

| Journey | Starting question | Reading path | Completion condition |
| --- | --- | --- | --- |
| J01 Evaluate | "What is Delta and can my stack use it?" | E01 → R01 → T01 → R10 | A table exists locally; the reader knows which of their engines can read and write it. |
| J02 Build and modify a table | "How do I keep a table correct as data changes?" | T01 → T03 → H03-H06 → E03 | Appends, overwrites, upserts, and deletes produce the expected versions. |
| J03 History and changes | "What changed, and can I go back?" | T02 → H02/H18 → H16 → H08 → E12 | Reader reads an old version, a change feed, and restores safely within retention. |
| J04 Keep it fast | "Why is my table slow or expensive?" | E05 → T05 → H19-H22 → R03 | Small files compacted, layout chosen deliberately, unreferenced files vacuumed without breaking readers. |
| J05 Evolve safely | "Can I change the schema or enable a feature without breaking readers?" | E04/E07 → T04 → H10-H14 → H24/H25 → R01/R02 | Change applied; every existing reader still opens the table, or the reader knows which will not. |
| J06 Use an engine | "How do I use Delta from my engine?" | R10 → H38/H40-H44 | Reader configures one engine and runs the operations that engine supports. |
| J07 Production storage | "Can several jobs write this table on S3?" | E08 → T08 → H27-H30 → H35 | Concurrent writers succeed or fail with retryable conflicts, never corrupt the log. |
| J08 Interoperate | "Can Iceberg readers, catalogs, or recipients use this table?" | E10/E11 → H31 → H47 → UC docs | Table registered or exposed with the right protocol; limits stated. |
| J09 Build a connector | "How do I add Delta support to my engine?" | E09 → E02/E04 → T09 → H50 → H51 → R04 | Connector reads and writes DAT cases with the declared feature set. |
| J10 Upgrade and migrate | "How do I move to Delta 4.x, deltalake 1.x, or from Parquet?" | R11 → H33/H34 → H07 | Upgrade applied; tables and jobs verified after it. |
| J11 Troubleshoot | "Why did my write fail?" | H35/H36 → R09 → E03/E04 | Error mapped to a cause and a fix (retry, rewrite predicate, align features). |

Each page states what the reader needs beforehand, what it changes, how to
verify success, and which journey comes next.

## 5. Proposed navigation and Diátaxis mapping

```text
Start here
  What is Delta Lake?                        -> E01
  Features and engine support                -> R01
  Create your first Delta table              -> T01
  Choose an engine or client                 -> R10

Use Delta tables
  Tutorials                                  -> T01-T07
  How-to guides
    Read and query                           -> H01-H02
    Create and write                         -> H03-H08
    Schema and data quality                  -> H10-H14
    History and changes                      -> H16-H18
    Layout and maintenance                   -> H19-H23
    Table features and protocol              -> H24-H25

Run in production
  Tutorials                                  -> T08
  How-to guides
    Storage and concurrent writers           -> H27-H30
    Catalogs                                 -> H31
    Upgrade and migrate                      -> H33-H34
    Troubleshoot                             -> H35-H36

Engines and integrations                     -> H38, H40-H44, H47
Build connectors                             -> E09, T09, H50-H51
Concepts                                     -> E01-E12
Reference                                    -> R01-R12
```

The nav lists P0 and P1 entries; P2 entries stay in this plan until they have
an owner. Planned ids appear once in `nav.yml`, so R01 and R10 sit under Start
here and are repeated under Reference as `page:` entries once written.

Source layout follows the UC plan: `content/delta/<bucket>/NNN-<slug>/index.md`
(folder mode with `snippets/`) or `NNN-<slug>.md`. Engine and audience grouping
lives only in `nav.yml`.

## 6. Article backlog

Priority:

- **P0**: the first coherent release, including safe multi-writer storage and
  the feature matrix.
- **P1**: needed to replace docs.delta.io and the cross-engine parts of the
  delta-rs docs.
- **P2**: optional depth, or an integration that needs an owner and tests.

"Engine" columns name the default interface first; tabs add others the page
tests.

### 6.1 Tutorials

| ID | Article | Priority / journeys | Engine | Scope and success check |
| --- | --- | --- | --- | --- |
| T01 | Create your first Delta table *(exists, draft)* | P0 / J01 | Python | Install, write a small orders dataset, read it back, look at `_delta_log`. Assert row count and version 0. |
| T02 | Explore a Delta table's history *(exists, draft)* | P0 / J03 | Python | Several commits, `history()`, read an earlier version. Assert per-version contents. |
| T03 | Upsert changing data with MERGE | P0 / J02 | Python | Initial load, then a change batch with inserts, updates, and deletes through one MERGE; assert final state and the operation metrics in history. |
| T04 | Evolve a table's schema without breaking readers | P1 / J05 | Python | Add a column on write, add a nested field, read old and new versions; show which change needs column mapping. |
| T05 | Keep a table fast with compaction, clustering, and vacuum | P1 / J04 | Python (Spark tab for clustering) | Many small appends, inspect file counts, compact, Z-order, vacuum with a dry run; assert file count and that time travel inside retention still works. |
| T06 | Create your first Delta table with Spark SQL | P0 / J01, J06 | Spark | Pinned Delta × Spark tuple, session configuration, `CREATE TABLE ... USING DELTA`, insert, `DESCRIBE HISTORY`. |
| T07 | Stream changes between tables with Spark | P1 / J03 | Spark | Structured Streaming source and sink with a checkpoint, restart, and exactly-once output assertion in the declared configuration. |
| T08 | Read and write a Delta table on S3-compatible storage | P1 / J07 | Python | `envs/aws-sim`; storage options outside the snippet; two writers with the chosen locking mode; assert both commits land. |
| T09 | Read your first table with Delta Kernel (Rust) | P1 / J09 | Rust Kernel | Default engine, snapshot, scan with a predicate, a DAT table as fixture. |
| T10 | Expose a table to Iceberg readers with UniForm | P2 / J08 | Spark + PyIceberg | Enable `icebergCompatV2`, read through an Iceberg client; assert schema and rows. |

Reuse the seeded `orders` dataset for T01–T05 so readers meet one schema.

### 6.2 Explanations

| ID | Article | Priority / journeys | Questions it answers |
| --- | --- | --- | --- |
| E01 | What is Delta Lake? *(exists)* | P0 / J01 | Format versus engine versus catalog; what Delta adds over Parquet; the implementations. |
| E02 | The transaction log, checkpoints, and snapshots | P0 / J03, J09 | Commits as JSON actions, checkpoints (classic, multi-part, v2 with sidecars), `_last_checkpoint`, log replay, version checksums, why listing order matters. |
| E03 | ACID transactions and optimistic concurrency | P0 / J02, J11 | What a commit guarantees; conflict detection; WriteSerializable versus Serializable; why retries are safe for some operations and not others; idempotent writes (`txn` actions). |
| E04 | Protocol versions and table features | P0 / J05, J09 | Reader/writer versions, the table-features mechanism, why enabling a feature can lock out readers, dropping features and history truncation. |
| E05 | How data layout drives performance | P0 / J04 | File statistics and data skipping, partitioning versus liquid clustering versus Z-order, file size, when each helps or hurts. |
| E06 | Copy-on-write, deletion vectors, and row tracking | P1 / J02, J04 | How DML rewrites or marks rows, the reader cost of DVs, row IDs and commit versions, which engines handle each. |
| E07 | Schema evolution and column mapping | P1 / J05 | Physical versus logical names, field IDs, rename and drop, type widening rules, interaction with UniForm. |
| E08 | Object-store guarantees and multi-writer safety | P0 / J07 | The three storage requirements (atomic visibility, mutual exclusion, consistent listing), how S3 conditional writes and DynamoDB locking provide them, why mixed-engine writers must agree. |
| E09 | Delta Kernel architecture *(exists)* | P1 / J09 | Kernel's split between protocol logic and the engine trait; Rust versus Java; who should use it. |
| E10 | Catalog-managed tables and catalog commits | P1 / J08, J09 | `catalogManaged`, ratified versus published commits, in-commit timestamps, what a catalog must provide; links to the UC docs for setup. |
| E11 | Delta, Iceberg, and UniForm | P1 / J08 | How UniForm writes Iceberg metadata, what Iceberg readers see, compatibility constraints, versus converting tables. |
| E12 | Retention, time travel, and VACUUM | P0 / J03, J04 | `logRetentionDuration`, `deletedFileRetentionDuration`, how VACUUM and log cleanup bound time travel and streaming readers, the safety check. |

Each explanation declares `explains:` against the architecture model where the
concept exists (`deltaSpec`, `deltaRs`, …). If a concept is missing, propose a
model change instead of inventing an id.

### 6.3 How-to: tables (practitioner)

| ID | Article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H01 | Read a Delta table *(exists)* | P0 / J01 | Python and Spark tabs; column projection, filters, partition filters. |
| H02 | Query a Delta table as of a version *(exists)* | P0 / J03 | Version and timestamp; retention boundary; Spark `VERSION AS OF` tab. |
| H03 | Create a table with a schema, partitioning, and properties | P0 / J02 | Explicit schema, partition columns or clustering, table properties at create time, create-if-not-exists, CTAS. |
| H04 | Append, overwrite, and selectively overwrite data | P0 / J02 | Append/overwrite/error/ignore, predicate overwrite (`replaceWhere`/`predicate=`), dynamic partition overwrite, how each shows in history. |
| H05 | Upsert and deduplicate with MERGE | P0 / J02 | Matched/not-matched/not-matched-by-source clauses, multiple source matches error, schema evolution in MERGE, performance predicates; per-engine clause support. |
| H06 | Update and delete rows | P0 / J02 | Predicates, metrics, CoW versus DVs, physical deletion only after VACUUM. |
| H07 | Convert Parquet data to a Delta table | P1 / J10 | `CONVERT TO DELTA`/`convert_to_deltalake`, partition schema, statistics, what isn't converted. |
| H08 | Restore a table to an earlier version | P1 / J03 | Restore by version or timestamp, missing-file behavior, restore is a new commit. |
| H09 | Clone a table | P2 / J03 | Spark shallow/deep clone; delta-rs alternatives; storage implications. |
| H10 | Evolve the schema on write | P0 / J05 | `mergeSchema`/`schema_mode="merge"`, overwrite schema, nested fields, what is rejected. |
| H11 | Rename and drop columns with column mapping | P1 / J05 | Enable `columnMapping` (name/id), rename/drop, reader requirements, the effect on streaming readers. |
| H12 | Widen column types | P1 / J05 | `typeWidening`, supported widenings, reader support, rewrite-free behavior. |
| H13 | Enforce CHECK and NOT NULL constraints | P1 / J02 | Add/drop constraints, enforcement on every writer, behavior with existing violating rows. |
| H14 | Use generated, identity, and default columns | P1 / J02 | Generated columns (stored, enforced on write), identity columns (4.4.0 DDL) and their concurrency limits, `allowColumnDefaults`; engine support per type. |
| H15 | Store semi-structured data with VARIANT | P2 / J05 | `variantType`, shredding, engine support. |
| H16 | Read the change data feed | P1 / J03 | Enable CDF, batch reads by version/timestamp, `_change_type`, Spark streaming CDF, retention interaction. |
| H17 | Stream from and to Delta tables with Spark | P1 / J03 | Source options (`startingVersion`, rate limits, `skipChangeCommits`), sinks, checkpoints, schema changes in a stream. |
| H18 | Inspect table history and audit operations | P1 / J03 | History fields, operation metrics, commit info, user metadata on commits. |
| H19 | Choose and change liquid clustering keys | P1 / J04 | `CLUSTER BY`, changing keys, `OPTIMIZE` behavior, migration from partitions; OSS has no automatic key selection. |
| H20 | Compact small files and Z-order | P0 / J04 | `OPTIMIZE`/`optimize.compact()`/`z_order()`, target size, partition filters, conflicts with concurrent writes. |
| H21 | Vacuum unreferenced files safely | P0 / J04 | Dry run, retention, the safety check and what disabling it risks, `vacuumProtocolCheck`. |
| H22 | Manage checkpoints and log retention | P1 / J04 | Checkpoint interval, explicit checkpoint, v2 checkpoints, metadata cleanup. |
| H23 | Enable and use deletion vectors | P1 / J04 | Enabling, purging with `REORG ... APPLY (PURGE)`, reader support, UniForm interaction. |
| H24 | Enable a table feature without breaking readers | P0 / J05 | Check current protocol, check reader support against R01, enable, verify. |
| H25 | Drop a table feature | P1 / J05 | `ALTER TABLE ... DROP FEATURE`, history truncation, the wait period, what can't be dropped. |
| H26 | Enable row tracking and in-commit timestamps | P2 / J04 | Use cases, cost, engine support. |

### 6.4 How-to: production

| ID | Article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H27 | Write safely to S3 from multiple writers | P0 / J07 | Spark `S3DynamoDBLogStore`, delta-rs DynamoDB provider and conditional put, the shared DynamoDB table schema, IAM, mixing engines, why unsafe rename is not a production setting. |
| H28 | Use S3-compatible object stores | P1 / J07 | MinIO, R2, RustFS: endpoints, path style, conditional-put support per store; tested on aws-sim. |
| H29 | Configure Azure storage | P1 / J07 | ADLS Gen2 and Blob for Spark and delta-rs; credential options; OneLake as a delta-rs-documented target. |
| H30 | Configure Google Cloud Storage | P1 / J07 | Spark connector and delta-rs; credentials; concurrency guarantees. |
| H31 | Address tables by path, metastore, or catalog | P1 / J08 | Path-based tables, Spark session catalog/Hive metastore, Unity Catalog (`uc://` in delta-rs, UC connector in Spark) with links to the UC site. |
| H32 | Read and write catalog-managed tables | — | Canonical in the UC docs (UC H03); linked from H31 and E10, not duplicated. |
| H33 | Upgrade Delta Spark across major versions | P1 / J10 | 3.x → 4.x: Spark/Scala tuple, artifact renames, behavior changes, rollback limits. |
| H34 | Upgrade the deltalake Python package | P1 / J10 | 0.x → 1.x guide plus minor-version notes; pyarrow/arro3 dependency changes. |
| H35 | Troubleshoot concurrent-write conflicts | P0 / J07, J11 | Symptom table: conflict exceptions per engine, partition-disjoint predicates, retry policy, compaction versus writes. |
| H36 | Troubleshoot unsupported-feature and protocol errors | P0 / J05, J11 | Reading the protocol, mapping error text to a feature, options (upgrade the reader, drop the feature, rewrite). |
| H37 | Tune write file sizes and statistics collection | P2 / J04 | Target file size, `dataSkippingNumIndexedCols`/`dataSkippingStatsColumns`, bloom filters in delta-rs. |

### 6.5 How-to: engines and integrations

Each page states the tested version tuple, the operations it supports (read,
append, overwrite, DML, DDL, maintenance), and the table features it can read
and write. It links its row in R10.

| ID | Article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H38 | Configure Spark for Delta Lake | P0 / J06 | `delta-spark` pip/Maven coordinates per Spark version, session extensions and catalog, storage jars. |
| H39 | Use Delta with Spark Connect | P2 / J06 | Delta Connect client/server setup, supported operations. |
| H40 | Query Delta tables from DuckDB | P1 / J06 | `delta` extension, `delta_scan`, attaching, write support status, filter pushdown. |
| H41 | Read and write Delta tables with Polars | P1 / J06 | `scan_delta`, `write_delta` modes and MERGE pass-through, storage options. |
| H42 | Use Delta tables with pandas, Daft, and DataFusion | P1 / J06 | One section per library; what each delegates to delta-rs. |
| H43 | Use the deltalake crate from Rust | P1 / J06 | Feature flags (`s3`, `azure`, `gcs`, `datafusion`), opening, writing RecordBatches, DataFusion `TableProvider`. Link to docs.rs for signatures. |
| H44 | Read Delta tables from Trino | P1 / J06 | Trino Delta connector, metastore requirement, read/write support. |
| H45 | Read and write Delta tables with Flink | P2 / J06 | Flink connector status, version tuple. |
| H46 | Find ecosystem connectors | P2 / J06 | Directory of provider-owned connectors (Presto, Athena, Redshift Spectrum, BigQuery, Snowflake, Starburst, StarRocks, …): protocol, owner, last verified. No untested recipes. |
| H47 | Expose a Delta table to Iceberg readers with UniForm | P1 / J08 | Enable, required features and incompatibilities, reading through an Iceberg REST catalog or metadata path. |
| H48 | Read shared tables with Delta Sharing | P2 / J08 | Profile file, Spark and pandas readers; server out of scope. |

### 6.6 How-to: connector authors

| ID | Article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H49 | Read a table with Delta Kernel (Java) | P2 / J09 | Default engine, scan, predicates; link to the Java API docs. |
| H50 | Write and commit to a table with Delta Kernel | P1 / J09 | Create, append, transaction and commit, idempotent writes, domain metadata, conflict handling. |
| H51 | Test a connector with the Delta Acceptance Tests | P1 / J09 | Download a DAT release, run reader cases, report supported features; how R01 uses DAT results. |

### 6.7 Reference

| ID | Reference unit | Priority / journeys | Source and maintenance rule |
| --- | --- | --- | --- |
| R01 | Features and engine support | P0 / J01, J05 | Feature × engine (Spark, delta-rs Python/Rust, Kernel Rust/Java, DuckDB, Polars, Trino) × read/write. Generated from a support record whose cells link to tests or DAT results; *unverified* is a separate value from *unsupported*. |
| R02 | Table features *(exists, draft)* | P0 / J05, J09 | Every feature with its protocol name, reader/writer, dependencies, enabling property, and source (spec table, spec body, or accepted RFC). Include preview names still found on tables, such as `typeWidening-preview`. |
| R03 | Table properties | P0 / J04, J05 | Every `delta.*` property, default, which writer honors it; generated from the spec plus engine sources. |
| R04 | Protocol specification index | P0 / J09 | Annotated index into `PROTOCOL.md` at the release tag; do not copy the spec. |
| R05 | Spark SQL commands for Delta | P0 / J02 | DDL/DML/utility commands with syntax and links to tasks. |
| R06 | Spark configuration | P1 / J06 | `spark.databricks.delta.*`/`spark.delta.*` session configs that matter in OSS, with defaults by version. |
| R07 | deltalake storage options | P0 / J07 | Every storage option key per backend, environment-variable equivalents, locking and conditional-put options. |
| R08 | Python, Rust, and Spark API references | P1 / J06 | Link hub with version-pinned links to delta-rs Python docs, docs.rs, Spark Scaladoc/PyDoc, Kernel docs. |
| R09 | Concurrency conflict exceptions | P0 / J11 | Each exception/error per engine, the conflicting operation pairs, and fixes. |
| R10 | Engine and client compatibility | P0 / J01, J06 | Tested version tuples and supported operations per engine; links to the engine pages. |
| R11 | Releases and version compatibility | P0 / J10 | Delta × Spark × Scala, deltalake × Kernel × Arrow; user-impacting changes per release with links upstream. |
| R12 | Data types | P1 / J05 | Delta types, Arrow/Spark mappings, `timestampNtz`, variant, type-widening paths. |
| R13 | Kernel API references | P2 / J09 | Link hub for Kernel Rust/Java API docs. |

## 7. Reuse, migration, and published-blog coverage

### Existing factory drafts

| Existing page | Decision | Id |
| --- | --- | --- |
| `explanation/001-what-is-delta-lake.md` | Keep; add the implementations section and link R01. | E01 |
| `explanation/002-delta-kernel-architecture.md` | Keep under Build connectors; recheck against the Kernel guide. | E09 |
| `how-to/001-read-a-delta-table/` | Keep; add a Spark tab. | H01 |
| `how-to/002-query-a-table-as-of-version/` | Keep; add timestamp reads and the retention boundary. | H02 |
| `tutorials/001-your-first-delta-table.md` | Write it (currently a stub); make it folder-mode with snippets. | T01 |
| `tutorials/002-explore-table-history/` | Finish; keep it focused on history, leaving restore to H08. | T02 |
| `reference/001-table-features.md` | Expand per R02; reconcile the spec sources. | R02 |

### docs.delta.io migration map

| Legacy page | New home | Treatment |
| --- | --- | --- |
| `quick-start` | T06, H38 | Split learning from Spark setup. |
| `delta-batch` | H01-H04, H10, H31, R05 | Split by task; options to reference. |
| `delta-streaming` | T07, H17 | Split tutorial and task. |
| `delta-update` | T03, H05, H06 | Split MERGE from update/delete; MERGE examples become tested snippets. |
| `delta-change-data-feed` | H16, E12 | |
| `delta-utility` (history, vacuum, restore, clone, convert, describe) | H07-H09, H18, H21, R05 | One task per command family. |
| `delta-constraints`, `delta-default-columns` | H13, H14 | |
| `versioning`, `delta-drop-feature` | E04, H24, H25, R02 | |
| `delta-column-mapping`, `delta-type-widening` | H11, H12, E07 | |
| `delta-clustering`, `optimizations-oss` | H19, H20, E05 | |
| `delta-deletion-vectors`, `delta-row-tracking` | H23, H26, E06 | |
| `delta-catalog-managed-tables` | E10, UC docs | Explain here; setup in the UC docs. |
| `delta-uniform` | H47, E11 | |
| `delta-sharing` | H48 | |
| `delta-spark-connect` | H39 | |
| `delta-storage` | E08, H27-H30, R07 | Split per cloud; add delta-rs and mixed-engine cases. |
| `concurrency-control` | E03, H35, R09 | |
| `porting` | H33 | |
| `best-practices`, `delta-faq` | Fold into tasks and concepts | No standalone best-practices page; each practice lives where it applies. |
| `table-properties` | R03 | |
| `releases` | R11 | |
| `delta-kernel*`, `delta-standalone` | E09, T09, H49-H51, R13 | Standalone is deprecated; archive with a pointer to Kernel. |
| Connector pages (Trino, Presto, Flink, Hive, Starburst, Redshift, Snowflake, BigQuery, Athena, more-connectors) | H44, H45, H46 | First-party only after tests; others go to the directory. |
| `delta-apidoc` | R08 | |

### delta-rs documentation

| delta-rs section | Treatment |
| --- | --- |
| Usage (create, load, write, merge, delete, manage, optimize, partitions, CDF, constraints) | Becomes the Python tab of the H01-H23 tasks. Coordinate with maintainers before deleting anything upstream. |
| Integrations: object storage | Feeds H27-H30 and R07. |
| Integrations: data frameworks | Feeds H40-H42. |
| API reference | Stays on the delta-rs site; linked from R08. |
| How Delta Lake works | Feeds E02, E03, E05. |
| Feature table | Input to R01, replaced by the test-backed record. |
| Upgrade guides | H34 links to them or absorbs them. |

### Blogs

delta.io has many Delta tutorials in blog form (MERGE, Z-order, vacuum, Polars,
DuckDB, Daft integrations). Use them as seeds for the matching how-to, check
every example against the pinned versions, and point the blog to the durable
page once it exists. Blogs stay narrative and historical.

## 8. Inspiration: patterns worth adopting

| Source | Pattern | Adopt | Avoid |
| --- | --- | --- | --- |
| Databricks Delta docs [D01-D04] | Task-grouped nav (ingest, update, query history, manage files, configure); per-feature requirement boxes; a table-properties reference; isolation levels with a per-exception conflict guide. | A "Requirements" block on every feature page with per-engine minimum versions; R03; R09/H35. | Platform features (predictive optimization, auto optimize, Photon, Lakeflow) or DBR version numbers as if they applied to OSS. |
| Apache Iceberg [D07, D08] | Spec separate from engine docs; a public implementation-status matrix per feature and language; engine sections. | R01 as a generated status matrix; R04 indexing the spec. | Making readers learn the spec before a first task. |
| PyIceberg [D06] | One configuration page for catalogs and FileIO by backend; CLI and API pages; an expression/row-filter reference. | R07 as a single storage-option table; predicate syntax reference inside R05/R07. | One long page for the whole API. |
| LanceDB [D05] | Quickstart that grows step by step; language tabs; integrations directory; `llms.txt`; SDK references per language. | Tabs for Python/Spark/Rust; H46 directory; the site's existing `.md` twins and `llms.txt`. | Mixing a commercial product's features into the OSS path. |
| delta-rs docs [S08] | Short task pages with runnable Python. | Same page size, now tested. | Keeping the feature table as hand-maintained claims. |
| UC plan | Journeys, ids, "what not to promise", test lanes. | Everything in §10 of that plan. | — |

## 9. Delivery sequence and decisions

### Phase 0: agree the boundary

1. Confirm Delta 4.4.0 and `deltalake` 1.6.x as baselines; recheck releases
   right before publishing.
2. Build the R01/R10 support record format first, with DAT and per-page tests as
   inputs. Without it, every engine claim is a guess.
3. Choose the Spark tuple for T06/T07 (Delta 4.4.0 + Spark 4.1 or 4.2) and the
   PySpark install path. Spark 4.1 also matches the UC tuple.
4. Agree the split with delta-rs maintainers: which usage pages move here,
   which stay, and how the two sites link.
5. Agree with Delta maintainers that docs.delta.io paths get redirects to this
   site, and who reviews Spark-specific claims.

### Phase 1: first coherent release

- Start here and foundations: E01-E05, E08, E12; R01-R05, R07, R09-R11.
- Learning: T01-T03, T06.
- Tasks: H01-H06, H10, H20, H21, H24, H27, H35, H36, H38.

### Phase 2: replace docs.delta.io

All P1 entries: schema and data quality, history and CDF, layout, column
mapping, type widening, deletion vectors, Azure/GCS/S3-compatible storage,
catalogs, upgrades, engine pages, UniForm, Kernel connector pages. This is the
point at which docs.delta.io can redirect, provided every legacy page has a
destination.

### Phase 3: optional depth

P2 entries, provider directory, Delta Sharing, Delta Connect, Flink, VARIANT,
Kernel Java.

### Decisions still requiring confirmation

| Decision | Proposed default | Gate/owner |
| --- | --- | --- |
| Supported versions | Current Delta 4.x and deltalake 1.x; archive older docs. | Delta and delta-rs maintainers. |
| Default Spark tuple | Delta 4.4.0 on Spark 4.1 (shared with UC) unless 4.2 is required by a page. | Docs CI proves the tuple. |
| delta-rs content split | Tasks and storage here; API reference and contributor docs there. | delta-rs maintainers. |
| Engine pages | First-party only with tests; directory otherwise. | Named reviewer per engine. |
| Site | A `delta-docs` site config beside `unitycatalog-docs`, emitted by `just emit-docs`. | Follow-up after Phase 0. |

## 10. Authoring and verification contract

The UC plan's §10 applies: colocated `snippets/`, PEP 723 scripts, assertions
outside region markers, pinned versions, and an article is done when its task
passes against the stated release. Delta adds:

| Lane | Coverage | Rule |
| --- | --- | --- |
| Default (Python) | Every Python snippet runs against pinned `deltalake` on local storage. | Required on every content change. |
| Spark | Exact Delta × Spark × Scala tuple in a container; SQL and PySpark tabs run. | Required for any page with a Spark tab. Docker unavailable is not a pass. |
| Storage | `envs/aws-sim` for S3 semantics including conditional writes and DynamoDB locking (via a local DynamoDB). | Required for H27/H28/T08; mock S3 does not certify AWS IAM. |
| Cross-engine | One table written by engine A and read by engine B for every R01 "read" claim, including feature-enabled tables. | R01 cells link to these tests. |
| Connector | DAT reader cases against Kernel Rust (and Java when H49 lands). | Required for T09/H50/H51. |

Feature pages carry a short "Requirements" block: protocol feature name and
whether readers or writers need it, plus minimum versions per tested engine,
taken from R01.

## 11. Convention proposals

1. **`delta_features` is the R01 join key.** Delta pages already carry a
   `delta_features:` frontmatter list. Constrain its values to protocol feature
   names (e.g. `deletionVectors`, `columnMapping`), with a short list of
   non-feature topics (`time-travel`), so R01 can link each feature to its
   pages. The existing values `time-travel` and `table-features` would need
   that list. This needs a vocab entry and a docsnip check before use.
2. **Engine tabs use fixed labels.** `Python`, `Spark SQL`, `PySpark`, `Rust`,
   in that order, so the tab sync in `content/README.md` § "Interface tabs"
   works across the site.
3. **Every engine claim cites its test.** A page saying "engine X supports Y"
   links to the R01 cell, not to the engine's own docs.

## 12. Source register

Consulted 2026-10-04.

### Delta Lake, delta-rs, and Kernel

| ID | Source |
| --- | --- |
| S01 | Delta 4.4.0 release notes: `https://github.com/delta-io/delta/releases/tag/v4.4.0`. |
| S02 | Delta releases and announcements: `https://github.com/delta-io/delta/releases`; `https://delta.io/blog/2026-04-17-delta-4-2-released`; `https://delta.io/blog/2026-06-22-delta-4-3-release/`. |
| S03 | Delta 4.4 / UC Delta API post: `https://delta.io/blog/2026-08-20-simplifying-your-open-lakehouse-with-the-delta-kernel-and-the-uc-delta-apis/`. |
| S04 | Protocol: `https://github.com/delta-io/delta/blob/master/PROTOCOL.md` (local `../delta/PROTOCOL.md`, "Valid Feature Names in Table Features"); resolve to the release tag for article evidence. |
| S05 | Protocol RFCs: `https://github.com/delta-io/delta/tree/master/protocol_rfcs` (accepted: catalog-managed, in-commit-timestamps, type-widening, vacuum-protocol-check, variant-type, variant-shredding). |
| S06 | Live docs: `https://docs.delta.io/`. |
| S07 | Docs source: `https://github.com/delta-io/delta/tree/master/docs` (`astro.config.mjs` sidebar; `src/content/docs/*.mdx`, notably `delta-storage.mdx`, `releases.mdx`, `concurrency-control.mdx`). |
| S08 | delta-rs docs: `https://delta-io.github.io/delta-rs/`; source `../delta-rs/mkdocs.yml` and `../delta-rs/docs/`. |
| S09 | delta-rs feature table and S3 docs: `../delta-rs/docs/feature-table.md`; `../delta-rs/docs/integrations/object-storage/s3.md`; `../delta-rs/docs/usage/writing/writing-to-s3-with-locking-provider.md`. |
| S10 | Python package: `https://pypi.org/project/deltalake/`. |
| S11 | delta-rs workspace and crate versions: `../delta-rs/Cargo.toml`, `../delta-rs/crates/core/Cargo.toml`, `../delta-rs/python/Cargo.toml`, repository tags. |
| S12 | Delta Kernel Rust user guide: `../delta-kernel-rs-user-guide/src/SUMMARY.md`; `https://github.com/delta-io/delta-kernel-rs`. |
| S13 | delta.io website: `../website/src/pages/learn/getting-started.md`. |
| S14 | Delta Acceptance Tests: `https://github.com/delta-incubator/dat`; local `../dat/README.md`. |

### Documentation design sources

| ID | Source |
| --- | --- |
| D01 | Databricks Delta Lake: `https://docs.databricks.com/aws/en/delta/`. |
| D02 | Databricks table properties: `https://docs.databricks.com/aws/en/delta/table-properties.html`. |
| D03 | Databricks isolation levels and write conflicts: `https://docs.databricks.com/aws/en/optimizations/isolation/`. |
| D04 | Databricks Delta best practices: `https://docs.databricks.com/aws/en/delta/best-practices/index.html`. |
| D05 | LanceDB: `https://docs.lancedb.com/`; `https://docs.lancedb.com/llms.txt`. |
| D06 | PyIceberg: `https://py.iceberg.apache.org/`; configuration `https://py.iceberg.apache.org/configuration/`. |
| D07 | Apache Iceberg docs and spec: `https://iceberg.apache.org/docs/latest/`; `https://iceberg.apache.org/spec/`. |
| D08 | Iceberg implementation status: `https://iceberg.apache.org/status/`. |

Local convention evidence: `AGENTS.md`, `content/README.md`,
`content/delta/`, `docs/design/unitycatalog-documentation-plan.md`.
