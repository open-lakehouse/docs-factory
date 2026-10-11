# Delta Lake documentation plan

Date: 2026-10-11 (v2; supersedes the 2026-10-04 draft from #160)

Status: Proposal for scope and sequencing; not an implementation commitment

Scope: The Delta Lake table format as used through four interfaces: **Spark
SQL**, **PySpark**, the Python **`deltalake`** package (delta-rs), and
**DuckDB** (the `delta` extension). Other engines, the Rust crate, and Delta
Kernel are later phases (§10).

Baselines (recheck before pinning examples):

- Delta Spark `v4.4.0`, published 2026-08-20. It supports Spark 4.2, 4.1, and
  4.0.1; the artifacts without a Spark suffix (`delta-spark_2.13`) target
  Spark 4.2. [S01, S02]
- Python `deltalake` `1.6.6`, uploaded 2026-09-24. [S10]
- DuckDB `1.5.x` with the core `delta` extension. The UC docs already pin
  `duckdb==1.5.4`. [S18]
- Protocol: `PROTOCOL.md` plus the accepted RFCs under `protocol_rfcs/accepted/`
  at the release tag. [S04, S05]

Companion to [`unitycatalog-documentation-plan.md`](./unitycatalog-documentation-plan.md).
That plan's authoring contract (§10), convention proposals (§11), and emitter
requirements (now [`docs-site-emission.md`](./docs-site-emission.md)) apply here
unless this document says otherwise. Navigation lives in
[`content/delta/nav.yml`](../../content/delta/nav.yml). The living record of
what each engine supports, and how each claim is verified, is the private
coverage page
[`content/delta/reference/090-coverage/`](../../content/delta/reference/090-coverage/index.md).

> **What changed from the 2026-10-04 draft.** Four interfaces are first-class,
> and **Spark SQL leads**: it opens every tab group and the default tutorial
> track. A no-JVM track (T11) uses `deltalake` and DuckDB. The scenario review
> of docs.delta.io and the Databricks docs (§3) drives the backlog. Polars,
> pandas/Daft/DataFusion, the Rust crate, Trino, Flink, UniForm readers, and
> connector authoring move to later phases. The engine-by-scenario matrix
> moved out of this plan into the coverage page. Backlog ids are unchanged
> where the topic survives; T06 is retired, and T11, H52–H54, E13, and R14
> are new.

## 1. Recommendation

Build a **format-first** Delta Lake site. Delta is a specification with
several independent implementations, so the docs should be organized the same
way: what the format guarantees, which tasks readers perform on a table, and
which engine performs each task. docs.delta.io today treats Delta as a Spark
connector with stub pages for other engines, and it mentions neither delta-rs
nor DuckDB.

Reader-facing sections:

- **Start here**: what Delta is, a feature-by-engine matrix, a first table in
  Spark SQL, a first table without a JVM, and how to choose an engine.
- **Set up an engine**: one page each for Spark (SQL and PySpark),
  `deltalake`, and DuckDB, plus one page on sharing a table between them.
- **Use Delta tables**: tutorials and task guides for reading, writing, schema,
  history, layout, and table features.
- **Run in production**: object storage and concurrent writers, catalogs,
  upgrades, and troubleshooting.
- **Concepts** and **Reference**, shared by every section above.

Four decisions shape everything else:

1. **Four interfaces, fixed tab order.** `Spark SQL`, `PySpark`, `Python`,
   `DuckDB`. Spark SQL is the reference writer and supports every feature, so
   the first tab almost never has to say "not supported". PySpark covers the
   DataFrame reader and writer, `DeltaTable`, and Structured Streaming.
   `Python` is the `deltalake` package. DuckDB is SQL through the `delta`
   extension.
2. **Spark SQL leads.** Tutorials use Spark SQL unless the task has no SQL
   form (streaming uses PySpark). T11 gives readers who don't want a JVM their
   own path: write with `deltalake`, query with DuckDB.
3. **Support is stated, never implied.** Each how-to opens with a line naming
   the interfaces that do the task and the ones that can't, with the reason. A
   missing tab is explained, not silent: when docs say nothing, readers and
   agents assume an engine supports the task.
4. **API reference links out.** The delta-rs site, the Spark Python API docs,
   and the DuckDB extension page stay authoritative for signatures. This site
   owns the task-level and cross-engine material none of them has.

Keep Diátaxis as the content architecture. Every page has one canonical home
in `tutorials/`, `how-to/`, `explanation/`, or `reference/`; the sections above
are a `nav.yml` projection over those folders.

The backlog (§7) has 11 tutorial ids (T06 retired), 13 explanations, 54 how-to
ids, and 14 reference units. About a fifth are later-phase. As in the UC
plan these are planning units, and several reference units are derived.

## 2. Evidence and research boundaries

### Method

This revision adds a scenario review, done on 2026-10-11:

- **docs.delta.io**: all 46 pages (about 12,000 lines) in the `delta-io/delta`
  `docs/` source, read for every reader task, the interfaces each page shows,
  and the Diátaxis types it mixes. The local checkout (v4.3.0) matches the
  live navigation; the `docs/` tree at v4.4.0 has the same page list. The
  separate `delta-docs-factory` repository is only an orchestration layer for
  the docs build and has no newer content. [S06, S07]
- **The Databricks Delta docs**: the Delta navigation groups (get started,
  convert and ingest, update and modify, incremental and streaming, history,
  schema enhancements, files and indexing, settings) and the table-feature
  compatibility and isolation pages. Used for task coverage and page patterns,
  never as evidence of OSS behavior. [D01-D04, D09-D10]
- **Engine sources**: the Delta SQL grammar and the `delta-spark` Python API at
  v4.4.0, the `deltalake` 1.6.6 Python source and feature table, and the
  DuckDB `delta` extension docs. [S15-S18]
- **Tested pages in this repo**: the UC docs already run Spark SQL and DuckDB
  against Delta tables; the coverage page cites them. [S20]

The 2026-10-04 inputs (delta-rs docs, the Kernel guide, LanceDB, PyIceberg,
Iceberg) still apply. [S08-S14, D05-D08]

Authority order when sources disagree:

1. Behavior reproduced with a pinned published artifact.
2. Release-tagged implementation and tests, including DAT results.
3. `PROTOCOL.md` and accepted RFCs at the release tag.
4. Current official documentation (docs.delta.io, delta-rs docs, DuckDB docs).
5. Published blogs and release announcements.
6. Databricks documentation, issues, roadmaps, and research reports: leads only.

`research/table-formats/` is a secondary artifact with many single-source
cells. Use it to decide where to look, never as the source of an engine
support claim.

### Limits of this audit

This is a scope audit, not a conformance test. Apart from the UC pages that
already run in CI, no Spark session, `deltalake` write, or DuckDB query was run
for it. The coverage page marks every claim `tested`, `documented`, `no`, or
`?`, and only a script in this repo makes a cell `tested`.

Two corrections from the review, recorded so they aren't repeated. UniForm,
shallow clone, `REORG … APPLY (PURGE)`, `CONVERT TO DELTA`, and `DROP FEATURE`
are OSS: they're in the Delta SQL grammar [S16]. Deep clone, `COPY INTO`, Auto
Loader, predictive optimization, automatic liquid-clustering keys, auto-TTL,
row-level concurrency, and Lakeflow pipelines are Databricks-only.

### Release history that changes documentation scope

| Release | Published | Consequence for the docs |
| --- | --- | --- |
| Delta 3.0–3.3 | 2023–2025 | Spark 3.5 line. Liquid clustering, row tracking, UniForm, and the type-widening preview (3.2) arrive here. Keep an archived version boundary instead of carrying 3.x examples forward untested. |
| Delta 4.0 | 2025 | Spark 4.0. Delta Connect (preview), fully supported type widening (3.2 tables carry `typeWidening-preview`), and catalog-managed tables from 4.0.1. [S07] |
| Delta 4.2.0 | 2026-04-17 | Spark 4.0/4.1. [S02] |
| Delta 4.3.0 | 2026-06-22 | Spark 4.0/4.1; Iceberg 1.11 for UniForm. [S02] |
| Delta 4.4.0 | 2026-08-20 | Spark 4.2 default (4.1 and 4.0.1 supported). Identity columns in SQL DDL, so docs.delta.io's "SQL APIs for identity columns are not supported yet" is out of date. `SHOW PARTITIONS`; VOID columns preserved on Spark 4.1+. [S01, S03] |
| deltalake (Python) 1.0 | 2025 | Breaking API changes with an upgrade guide; the 1.x line is the baseline. [S08] |
| deltalake (Python) 1.6.6 | 2026-09-24 | Current pin candidate. [S10] |
| DuckDB `delta` extension | current | Reads, blind `INSERT` appends through `ATTACH … (TYPE delta)`, idempotent appends, time travel by version only. No UPDATE, DELETE, or MERGE. [S18] |

### Current capability boundary

This is the scope baseline. The per-scenario detail is in the coverage page.

| Area | Evidence | Documentation implication |
| --- | --- | --- |
| Table features | `PROTOCOL.md`'s "Valid Feature Names" table lists 19 features. `variantType` and `variantShredding` are specified in the body but missing from that table; type widening is an accepted RFC that isn't in `PROTOCOL.md`. [S04, S05] | R02 reconciles the spec body, accepted RFCs, and the feature-name table, and says which source each entry comes from. |
| Spark SQL | The grammar and docs cover every DDL, DML, and maintenance command. No OSS SQL streaming. [S07, S16] | The lead interface. Its version tuple (Delta × Spark × Scala) appears in each Spark page's prerequisites. |
| PySpark | `DeltaTable` covers DML, history, restore, clone, optimize, vacuum, convert, and feature support; schema DDL, constraints, column mapping, and clustering changes are SQL only. Streaming is PySpark only. [S15] | Show a PySpark tab only where the API differs from `spark.sql(...)`. |
| `deltalake` | DML, MERGE (including by-source clauses and schema evolution), restore, CDF reads, optimize, vacuum, checkpoints, constraints, and properties. No clone, column rename or drop, type widening, clustering, or feature drop. The feature table marks identity columns unsupported and says nothing about deletion vectors, row tracking, v2 checkpoints, or variant. [S09, S17] | Strong for practitioner tasks. No writer-feature claim until a test proves it. |
| DuckDB | Reads with pushdown, version time travel, blind appends, idempotent appends, deletion-vector reads. No other DML or DDL. [S18] | A read-and-append engine. Every DuckDB tab says what it can't do. Whether its appends respect constraints and other writers' locking is unknown. |
| Storage | Spark: S3 single-cluster by default, multi-cluster through `S3DynamoDBLogStore`; Azure, GCS, HDFS. `deltalake`: DynamoDB locking or conditional put. DuckDB: secrets for S3, Azure, and GCS. [S07, S09, S18] | Multi-writer safety differs per engine **and** writers must share one mechanism. H27 and E08 carry it. |
| Catalog-managed tables | `catalogManaged` is a reader-writer feature. Spark and DuckDB (through `unity_catalog`) read and write UC managed tables in tested UC pages; `deltalake` refuses them. [S04, S20] | Explain the protocol here (E10). Catalog setup stays canonical in the UC docs. |
| Kernel, UniForm, Sharing | Kernel underlies delta-rs and the DuckDB extension. UniForm and Delta Sharing are Spark-side. [S07, S12] | Later phases; E13 explains why Kernel matters for support. |

### What not to promise

Do not write procedural documentation that implies the following unless a test
proves it for the named engine and version:

- Databricks platform features: predictive optimization, auto optimize as a
  service, Photon, automatic liquid-clustering keys, auto-TTL, row-level
  concurrency, serverless, Lakeflow pipelines, `COPY INTO`, Auto Loader, or
  Databricks-only SQL syntax.
- `deltalake` writing deletion vectors, row tracking, identity columns, type
  widening, or liquid-clustered layouts; or reading any feature its own
  feature table does not list.
- DuckDB doing anything beyond reads and blind appends, timestamp time travel
  in DuckDB, or DuckDB appends being safe next to other writers on S3.
- Constraint enforcement on writes from an engine that hasn't been tested
  against a constrained table.
- Safe concurrent writes from mixed engines on S3 just because each engine has
  *a* locking option. Writers must share one mechanism.
- Identical semantics for the same SQL across engines (MERGE, schema
  evolution, overwrite modes, and constraint enforcement differ).

Lakehouse estate work (catalogs, governance, Breakwater, Mangrove) belongs in
`content/open-lakehouse/` or the UC site.

## 3. Scenario inventory and gaps

### 3.1 Scenario families

Each scenario has a stable key (`family.scenario`, e.g. `write.append`,
`merge.not-matched-by-source`). The keys, one row per scenario with its
support in each interface, live in the coverage page. They later become R01's
public row ids. This table maps each family to its sources and its pages.

| Family | docs.delta.io source | Databricks nav group | Databricks-only, excluded | Backlog |
| --- | --- | --- | --- | --- |
| Create and write | `quick-start`, `delta-batch` | Updating and modifying; converting and ingesting | `COPY INTO`, Auto Loader, file-upload tables, streaming tables | T01, T11, H03, H04, H54 |
| Modify rows | `delta-update` | Upsert with merge; selective overwrite | Row-level concurrency | T03, H05, H06 |
| Read and query | `delta-batch` | Querying previous versions | Photon, SQL warehouses | H01, H02 |
| History and time travel | `delta-batch`, `delta-utility` | Work with table history | — | T02, H02, H08, H09, H18 |
| Schema and data quality | `delta-batch`, `delta-constraints`, `delta-default-columns`, `delta-column-mapping`, `delta-type-widening` | Schema enhancements; update table schemas; custom metadata | Informational PK/FK constraints, collations | T04, H10-H14 |
| Change data and streaming | `delta-change-data-feed`, `delta-streaming` | Incremental and streaming workloads | Lakeflow pipelines, streaming tables | T07, H16, H17 |
| Layout and maintenance | `optimizations-oss`, `delta-clustering`, `delta-utility` | Managing files and indexing data | Predictive optimization, automatic clustering keys, auto-TTL, file-size auto-tuning | T05, H19-H23, H37 |
| Table features and protocol | `versioning`, `delta-drop-feature`, `delta-deletion-vectors`, `delta-row-tracking`, `table-properties` | Configuring and reviewing settings; feature compatibility | Runtime-version tables | H24-H26, R02, R03 |
| Storage and concurrency | `delta-storage`, `concurrency-control` | Isolation levels and write conflicts | Row-level concurrency | T08, H27-H30, H35, E08, R09 |
| Catalogs and interop | `delta-catalog-managed-tables`, `delta-uniform`, `delta-sharing` | Managed, external, and foreign tables | Databricks-managed table behavior | H31, E10 (UniForm, Sharing later) |
| Migration and upgrade | `porting`, `delta-utility` (CONVERT), `releases` | Convert to Delta; incremental clone of Parquet and Iceberg | Incremental Parquet/Iceberg clone | H07, H33, H34, R11 |

### 3.2 Gaps

| Gap | Evidence | Response |
| --- | --- | --- |
| No non-Spark engine anywhere. | docs.delta.io mentions neither delta-rs nor DuckDB; connector pages for Trino, Flink, Hive, Starburst, and others are 5–8 line stubs. [S07] | Four first-class interfaces; set-up pages H38, H52, H40; H53 for sharing one table. |
| Pages mix every Diátaxis type. | `delta-batch` (1,872 lines) and `delta-update` (1,054) combine setup, walkthroughs, every option, and caveats. [S07] | Task-sized how-tos; options move to R03, R05, R06. |
| No feature-by-engine view. | Spark documents everything, delta-rs keeps a partial table, DuckDB lists a few reader features. Nothing answers "can my reader open this table?" [S07, S09, S18] | The coverage page, then R01 and R14. |
| Spark SQL coverage lags the Python and Scala APIs. | Identity columns: "SQL APIs … are not supported yet" (fixed in 4.4.0); generated columns and identity examples are Python/Scala only. [S07, S01] | Spark SQL leads every page, so each task gets a SQL form first. |
| No troubleshooting and no conflict guide. | `delta-faq` is 50 lines; `concurrency-control` names isolation levels but no exception-by-exception diagnosis. Databricks' isolation page has no exception matrix either. [S07, D10] | R09 (errors per engine, verbatim), H35, H36. |
| Idempotent writes and commit metadata are mentioned but not shown end to end. | `txnAppId`/`txnVersion` are described as options; `foreachBatch` upserts aren't shown with them. [S07] | H54; H17 absorbs the `foreachBatch` MERGE. |
| Retention interplay is spread out. | CDF, VACUUM, time travel, and streaming retention sit on four pages. [S07] | E12 plus warnings in H16, H21, H17. |
| Newer utilities are reference-only. | Shallow clone, `VACUUM LITE`/`INVENTORY`, `OPTIMIZE FULL`, row-tracking backfill appear with little or no example; FSCK appears only as a history metric. [S07] | H09, H21, H19, H26; FSCK noted in R05. |
| Versions are stale. | `releases.mdx` links out; `quick-start` targets an older release; delta.io's getting-started targets Delta 2.1.0. [S07, S13] | R11 and pinned tuples in each page's prerequisites. |
| Requirement boxes and limitations are rare. | Databricks feature pages open with requirements and close with limitations; OSS pages mostly don't. [D01, D09] | A Requirements block and engine-support line on every feature page (§11). |

## 4. Engine coverage model

### Interfaces

| Interface | What it is | How the reader opens it | Table addressing |
| --- | --- | --- | --- |
| Spark SQL | Delta's SQL commands in a Spark session | The `spark-sql` shell from the pip `pyspark` package (the wheel ships `bin/spark-sql` and the Hive thriftserver jar), with `--packages io.delta:delta-spark_2.13:<v>` and Delta's extension and catalog confs | `delta.\`/path\``, or `CREATE TABLE … LOCATION` for a name |
| PySpark | `delta-spark` Python API, DataFrame reader/writer, Structured Streaming | `pip install delta-spark`, then `configure_spark_with_delta_pip` | Path, or a session catalog name |
| Python | `deltalake` (delta-rs) | `pip install deltalake` | Path or URI, with `storage_options` |
| DuckDB | `delta` extension | `INSTALL delta; LOAD delta;` in the CLI or the `duckdb` package | `delta_scan('<path>')` or `ATTACH '<path>' AS t (TYPE delta)` |

Path-based tables are the common denominator, so examples address tables by
path unless the page is about catalogs. Catalog-managed tables stay in the UC
docs.

### Coverage shape

The full matrix is in the coverage page. Its shape: Spark SQL and PySpark do
almost everything, and streaming is PySpark only. `deltalake` covers writes,
DML, MERGE, history, restore, CDF reads, and maintenance, but few writer
features. DuckDB reads and appends. The open questions with the most impact are
what a DuckDB append does to a constrained or feature-enabled table, and
whether DuckDB and `deltalake` appends are safe next to Spark writers on S3.

### Page rules

1. A tab exists only for an interface that does the task and has a test.
2. The engine-support line names each unsupported interface with a reason and
   links its R01 row: "DuckDB can't update rows: the `delta` extension only
   appends."
3. No PySpark tab that only wraps `spark.sql(...)`. The setup section says
   once that PySpark runs any Spark SQL statement through `spark.sql()`.
4. Semantics that differ across engines (MERGE clauses, overwrite modes,
   schema-evolution flags, constraint enforcement) get a short "Differences"
   note under the task.
5. A tutorial uses one interface. Other interfaces are how-to tabs, not
   tutorial branches.

## 5. Audiences and user journeys

Personas are entry points:

- **Evaluator**: wants to know what Delta gives over plain Parquet, and whether
  their engines can use it.
- **Data practitioner**: writes pipelines and notebooks in SQL, PySpark, or
  Python.
- **Analyst on a laptop**: queries tables with DuckDB or `deltalake` and
  doesn't want a JVM.
- **Platform engineer**: runs tables on object storage with several writers and
  engines, and owns upgrades.

Connector authors (Kernel, DAT) are a later-phase persona.

| Journey | Starting question | Reading path | Completion condition |
| --- | --- | --- | --- |
| J01 Evaluate | "What is Delta and can my stack use it?" | E01 → R01 → T01 or T11 → R10 | A table exists locally; the reader knows which of their engines can read and write it. |
| J02 Build and modify a table | "How do I keep a table correct as data changes?" | T01 → T03 → H03-H06 → E03 | Appends, overwrites, upserts, and deletes produce the expected versions. |
| J03 History and changes | "What changed, and can I go back?" | T02 → H02/H18 → H16 → H08 → E12 | Reader reads an old version and a change feed, and restores within retention. |
| J04 Keep it fast | "Why is my table slow or expensive?" | E05 → T05 → H19-H22 → R03 | Small files compacted, layout chosen deliberately, unreferenced files vacuumed without breaking readers. |
| J05 Evolve safely | "Can I change the schema or enable a feature without breaking readers?" | E04/E07 → T04 → H10-H14 → H24/H25 → R01/R02 | Change applied; every existing reader still opens the table, or the reader knows which won't. |
| J06 Use an engine | "How do I use Delta from my engine?" | R10 → H38/H52/H40 → H53 | Reader configures one engine and knows what it can and can't do on a shared table. |
| J07 Production storage | "Can several jobs write this table on S3?" | E08 → T08 → H27-H30 → H35 | Concurrent writers succeed or fail with retryable conflicts, never corrupt the log. |
| J08 Interoperate | "Can a catalog manage this table?" | E10 → H31 → UC docs | Table registered with the right protocol; limits stated. |
| J09 Build a connector | Later phase | E09 → T09 → H50 → H51 | — |
| J10 Upgrade and migrate | "How do I move to Delta 4.x, deltalake 1.x, or from Parquet?" | R11 → H33/H34 → H07 | Upgrade applied; tables and jobs verified after it. |
| J11 Troubleshoot | "Why did my write fail?" | H35/H36 → R09 → E03/E04 | Error mapped to a cause and a fix. |

## 6. Proposed navigation and Diátaxis mapping

```text
Start here
  What is Delta Lake?                         -> E01
  Features and engine support                 -> R01
  Create your first Delta table               -> T01 (Spark SQL)
  Build a table in Python, query it in DuckDB -> T11
  Choose an engine or client                  -> R10

Set up an engine                              -> H38, H52, H40, H53

Use Delta tables
  Tutorials                                   -> T01-T05, T07
  How-to guides
    Read and query                            -> H01-H02
    Create and write                          -> H03-H08, H54
    Schema and data quality                   -> H10-H14
    History and changes                       -> H16-H18
    Layout and maintenance                    -> H19-H23
    Table features and protocol               -> H24-H25

Run in production
  Tutorials                                   -> T08
  How-to guides
    Storage and concurrent writers            -> H27-H30
    Catalogs                                  -> H31
    Upgrade and migrate                       -> H33-H34
    Troubleshoot                              -> H35-H36

Concepts                                      -> E01-E10, E12, E13
Reference                                     -> R01-R12, R14
Internal (private, never emitted)             -> coverage page
```

`nav.yml` lists the P0 and P1 entries. P2 and later-phase entries stay here
until they have an owner. Planned ids appear once, so R01 and R10 sit under
Start here and are repeated under Reference as `page:` entries once written.
E09 is written, so it stays in Concepts even though its journey is deferred.

Source layout follows the UC plan: `content/delta/<bucket>/NNN-<slug>/index.md`
(folder mode with `snippets/`) or `NNN-<slug>.md`.

## 7. Article backlog

Priority:

- **P0**: the first coherent release: Start here, the set-up pages, core
  writes and reads, history, compaction and vacuum, enabling features, S3
  multi-writer safety, troubleshooting, and the matrices.
- **P1**: needed to replace docs.delta.io and the cross-engine parts of the
  delta-rs docs.
- **P2**: optional depth that needs an owner and tests.
- **Later**: engines and personas outside the four-interface scope (§10).

"Interfaces" lists the tabs in order, then what can't do the task. Abbreviations:
SQL = Spark SQL, PyS = PySpark, Py = `deltalake`, Duck = DuckDB.

### 7.1 Tutorials

| ID | Article | Priority / journeys | Interface | Scope and success check |
| --- | --- | --- | --- | --- |
| T01 | Create your first Delta table *(exists, stub)* | P0 / J01 | SQL | Open `spark-sql` with the pinned tuple, `CREATE TABLE … LOCATION`, insert, query, `DESCRIBE HISTORY`, look at `_delta_log`. Assert row count and versions. |
| T02 | Explore a Delta table's history *(exists, draft)* | P0 / J03 | SQL | Several commits, `DESCRIBE HISTORY`, `VERSION AS OF` and `TIMESTAMP AS OF`. The current `deltalake` script moves to the H02/H18 Python tabs. |
| T03 | Upsert changing data with MERGE | P0 / J02 | SQL | Initial load, then a change batch with inserts, updates, and deletes through one MERGE; assert final state and the operation metrics in history. |
| T04 | Evolve a table's schema without breaking readers | P1 / J05 | SQL | Add a column on write, add a nested field, rename with column mapping; check which interfaces still read it (R01). |
| T05 | Keep a table fast with compaction, clustering, and vacuum | P1 / J04 | SQL | Many small appends, `OPTIMIZE`, `CLUSTER BY`, `VACUUM … DRY RUN`; assert file counts and that time travel inside retention still works. |
| T06 | *Retired: merged into T01.* | — | — | — |
| T07 | Stream changes between tables with PySpark | P1 / J03 | PyS | Structured Streaming source and sink with a checkpoint, a restart, and an exactly-once assertion in the declared configuration. |
| T08 | Read and write a Delta table on S3-compatible storage | P1 / J07 | SQL | `envs/aws-sim`; storage settings outside the snippet; a second writer with the shared locking mode; assert both commits land. Phase 0 confirms which locking works on aws-sim. |
| T09 | Read your first table with Delta Kernel (Rust) | Later / J09 | Rust Kernel | Default engine, snapshot, scan with a predicate, a DAT table as fixture. |
| T10 | Expose a table to Iceberg readers with UniForm | Later / J08 | SQL + PyIceberg | Enable `icebergCompatV2`, read through an Iceberg client. |
| T11 | Build a Delta table in Python and query it with DuckDB | P0 / J01, J06 | Py, then Duck | No JVM. Write `orders` with `write_deltalake`, append, then query with `delta_scan` and `AT (VERSION => 0)`; assert counts in both engines. Doubles as a cross-engine test. |

Reuse the seeded `orders` dataset for T01–T05 and T11 so readers meet one
schema.

### 7.2 Explanations

| ID | Article | Priority / journeys | Questions it answers |
| --- | --- | --- | --- |
| E01 | What is Delta Lake? *(exists)* | P0 / J01 | Format versus engine versus catalog; what Delta adds over Parquet; the implementations. |
| E02 | The transaction log, checkpoints, and snapshots | P0 / J03 | Commits as JSON actions, checkpoints (classic, multi-part, v2 with sidecars), `_last_checkpoint`, log replay, why listing order matters. |
| E03 | ACID transactions and optimistic concurrency | P0 / J02, J11 | What a commit guarantees; conflict detection; WriteSerializable versus Serializable; which retries are safe; idempotent writes. |
| E04 | Protocol versions and table features | P0 / J05 | Reader/writer versions, the table-features mechanism, why enabling a feature can lock out readers, dropping features and history truncation. |
| E05 | How data layout drives performance | P0 / J04 | File statistics and data skipping, partitioning versus liquid clustering versus Z-order, file size. |
| E06 | Copy-on-write, deletion vectors, and row tracking | P1 / J02, J04 | How DML rewrites or marks rows, the reader cost of DVs, row IDs, which engines handle each. |
| E07 | Schema evolution and column mapping | P1 / J05 | Physical versus logical names, field IDs, rename and drop, type widening rules. |
| E08 | Object-store guarantees and multi-writer safety | P0 / J07 | The storage requirements, how S3 conditional writes and DynamoDB locking provide them, why mixed-engine writers must agree. |
| E09 | Delta Kernel architecture *(exists)* | Later / J09 | Kernel's split between protocol logic and the engine trait. Stays in nav because it exists. |
| E10 | Catalog-managed tables and catalog commits | P1 / J08 | `catalogManaged`, ratified versus published commits, what a catalog must provide; links to the UC docs for setup. |
| E11 | Delta, Iceberg, and UniForm | Later / J08 | How UniForm writes Iceberg metadata and what Iceberg readers see. |
| E12 | Retention, time travel, and VACUUM | P0 / J03, J04 | `logRetentionDuration`, `deletedFileRetentionDuration`, how VACUUM and log cleanup bound time travel, CDF, and streaming readers. |
| E13 | Why engine support differs | P1 / J01, J06 | The reference writer versus delta-rs versus DuckDB; Kernel underneath delta-rs and the DuckDB extension; why "supports writer v7" doesn't mean "supports every feature". |

Each explanation declares `explains:` against the architecture model where the
concept exists (`deltaSpec`, `deltaSpark`, `deltaRs`, `duckdb`). If a concept
is missing, propose a model change instead of inventing an id.

### 7.3 How-to: tables

| ID | Article | Priority / journeys | Interfaces | Required content |
| --- | --- | --- | --- | --- |
| H01 | Read a Delta table *(exists)* | P0 / J01 | SQL, PyS, Py, Duck | Projection, filters, partition filters; DuckDB pushdown modes. |
| H02 | Query a Delta table as of a version *(exists)* | P0 / J03 | SQL, PyS, Py, Duck | Version and timestamp; retention boundary. DuckDB: version only. |
| H03 | Create a table with a schema, partitioning, and properties | P0 / J02 | SQL, PyS, Py; Duck ? | Explicit schema, partition columns, properties at create, create-if-not-exists, CTAS, comments. |
| H04 | Append, overwrite, and selectively overwrite data | P0 / J02 | SQL, PyS, Py, Duck (append) | Append/overwrite, `REPLACE WHERE`/`predicate=`, dynamic partition overwrite, how each shows in history. |
| H05 | Upsert and deduplicate with MERGE | P0 / J02 | SQL, PyS, Py; ✗ Duck | All clauses, by-source clauses, multiple source matches, schema evolution in MERGE; per-engine differences. |
| H06 | Update and delete rows | P0 / J02 | SQL, PyS, Py; ✗ Duck | Predicates, metrics, copy-on-write versus DVs, physical deletion only after VACUUM. |
| H07 | Convert Parquet data to a Delta table | P1 / J10 | SQL, PyS, Py; ✗ Duck | `CONVERT TO DELTA`/`convert_to_deltalake`, partition schema, statistics, what isn't converted. |
| H08 | Restore a table to an earlier version | P1 / J03 | SQL, PyS, Py; ✗ Duck | By version or timestamp, missing-file behavior, restore is a new commit. |
| H09 | Clone a table | P2 / J03 | SQL, PyS; ✗ Py, Duck | Shallow clone only in OSS; storage implications. |
| H10 | Evolve the schema on write | P0 / J05 | SQL, PyS, Py; ✗ Duck | `mergeSchema`/`schema_mode="merge"`, overwrite schema, nested fields, what's rejected. |
| H11 | Rename and drop columns with column mapping | P1 / J05 | SQL; ✗ Py, Duck | Enable `columnMapping`, rename/drop, which readers open the result, effect on streaming readers. |
| H12 | Widen column types | P1 / J05 | SQL; ✗ Py, Duck | `typeWidening`, supported widenings, reader support. |
| H13 | Enforce CHECK and NOT NULL constraints | P1 / J02 | SQL, Py; Duck ? | Add/drop constraints, enforcement per writer, existing violating rows. |
| H14 | Use generated, identity, and default columns | P1 / J02 | SQL, PyS; Py (generated only) | Generated columns, identity columns (4.4.0 DDL) and their concurrency limits, defaults; support per writer. |
| H15 | Store semi-structured data with VARIANT | P2 / J05 | SQL; Duck (read) | `variantType`, shredding, reader support. |
| H16 | Read the change data feed | P1 / J03 | SQL, PyS, Py; ✗ Duck | Enable CDF, batch reads by version/timestamp, `_change_type`, retention interplay. |
| H17 | Stream from and to Delta tables with PySpark | P1 / J03 | PyS only | Source options, sinks, checkpoints, schema changes in a stream, `foreachBatch` MERGE with idempotent writes. |
| H18 | Inspect table history, details, and files | P1 / J03 | SQL, PyS, Py, Duck (files) | History fields, operation metrics, `DESCRIBE DETAIL`, the file list, protocol and properties. |
| H19 | Choose and change liquid clustering keys | P1 / J04 | SQL (PyS at create); ✗ Py, Duck | `CLUSTER BY`, changing keys, `OPTIMIZE FULL`, migration from partitions; no automatic key selection in OSS. |
| H20 | Compact small files and Z-order | P0 / J04 | SQL, PyS, Py; ✗ Duck | Target size, partition filters, conflicts with concurrent writes. |
| H21 | Vacuum unreferenced files safely | P0 / J04 | SQL, PyS, Py; ✗ Duck | Dry run, retention, `LITE`/`INVENTORY`, the safety check, `vacuumProtocolCheck`. |
| H22 | Manage checkpoints and log retention | P1 / J04 | SQL, Py | Checkpoint interval, explicit checkpoints (`deltalake`), v2 checkpoints, log cleanup. |
| H23 | Enable and use deletion vectors | P1 / J04 | SQL; Py ?, Duck (read) | Enabling, `REORG … APPLY (PURGE)`, reader support. |
| H24 | Enable a table feature without breaking readers | P0 / J05 | SQL, PyS, Py | Check the current protocol, check reader support in R01, enable, verify. |
| H25 | Drop a table feature | P1 / J05 | SQL, PyS; ✗ Py | `DROP FEATURE`, history truncation, the wait period. |
| H26 | Enable row tracking and in-commit timestamps | P2 / J04 | SQL | Use cases, backfill, reader support. |
| H54 | Write idempotently and attach commit metadata | P1 / J02, J07 | SQL, PyS, Py, Duck | `txnAppId`/`txnVersion`, `userMetadata`, `CommitProperties`/`Transaction`, DuckDB `delta_set_transaction_version()`; how retries stay exactly-once. |

### 7.4 How-to: production

| ID | Article | Priority / journeys | Interfaces | Required content |
| --- | --- | --- | --- | --- |
| H27 | Write safely to S3 from multiple writers | P0 / J07 | SQL, Py; Duck ? | `S3DynamoDBLogStore`, the `deltalake` DynamoDB provider and conditional put, the shared DynamoDB table, IAM, mixing engines, why unsafe rename isn't a production setting. |
| H28 | Use S3-compatible object stores | P1 / J07 | SQL, Py, Duck | Endpoints, path style, conditional-put support per store; tested on aws-sim. |
| H29 | Configure Azure storage | P1 / J07 | SQL, Py, Duck | ADLS Gen2 and Blob; credential options; DuckDB secrets. |
| H30 | Configure Google Cloud Storage | P1 / J07 | SQL, Py, Duck | Connector, credentials, concurrency guarantees. |
| H31 | Address tables by path, metastore, or catalog | P1 / J08 | SQL, PyS, Py, Duck | Path-based tables, the Spark session catalog, Unity Catalog with links to the UC site. |
| H32 | Read and write catalog-managed tables | — | — | Canonical in the UC docs; linked from H31 and E10. |
| H33 | Upgrade Delta Spark across major versions | P1 / J10 | SQL, PyS | 3.x → 4.x: Spark/Scala tuple, artifact names, behavior changes, rollback limits. |
| H34 | Upgrade the deltalake Python package | P1 / J10 | Py | 0.x → 1.x plus minor-version notes. |
| H35 | Troubleshoot concurrent-write conflicts | P0 / J07, J11 | SQL, PyS, Py | Symptom table: conflict errors per engine, partition-disjoint predicates, retry policy, compaction versus writes. |
| H36 | Troubleshoot unsupported-feature and protocol errors | P0 / J05, J11 | SQL, PyS, Py, Duck | Each engine's error text mapped to a feature, and the options: upgrade the reader, drop the feature, or rewrite. |
| H37 | Tune write file sizes and statistics collection | P2 / J04 | SQL, Py | Target file size, `dataSkippingNumIndexedCols`/`dataSkippingStatsColumns`. |

### 7.5 How-to: set up an engine

Each page states the tested version tuple, what the interface can do (read,
append, overwrite, DML, DDL, maintenance) and can't, and links its R10 row.

| ID | Article | Priority / journeys | Required content |
| --- | --- | --- | --- |
| H38 | Configure Spark SQL and PySpark for Delta Lake | P0 / J06 | `delta-spark` pip and Maven coordinates per Spark version, the `spark-sql` shell from the pip install, session extensions and catalog, storage jars. |
| H52 | Set up the deltalake Python package | P0 / J06 | Install, open by path or URI, `storage_options`, Arrow and pandas interop, what it doesn't do. |
| H40 | Query and append to Delta tables from DuckDB | P0 / J06 | `delta_scan` versus `ATTACH … (TYPE delta)`, `VERSION`, pushdown options, secrets, appends and idempotent appends, what it can't do. |
| H53 | Read and write one table from several engines | P0 / J06, J07 | Check a table's features against every engine before enabling one, which engine to use for which operation, one shared locking setup. |
| H39 | Use Delta with Spark Connect | Later / J06 | Delta Connect client and server. |

### 7.6 Later phases

Kept so their ids stay stable. They return to `nav.yml` when they have an
owner and tests.

| ID | Article | Notes |
| --- | --- | --- |
| H41 | Read and write Delta tables with Polars | `scan_delta`, `write_delta`. |
| H42 | Use Delta tables with pandas, Daft, and DataFusion | One section per library. |
| H43 | Use the deltalake crate from Rust | Feature flags, DataFusion `TableProvider`; docs.rs for signatures. |
| H44 | Read Delta tables from Trino | Connector, metastore requirement. |
| H45 | Read and write Delta tables with Flink | Connector status. |
| H46 | Find ecosystem connectors | Directory: protocol, owner, last verified. Includes symlink manifests for Presto/Athena. |
| H47 | Expose a Delta table to Iceberg readers with UniForm | With E11 and T10. |
| H48 | Read shared tables with Delta Sharing | Reader side only. |
| H49 | Read a table with Delta Kernel (Java) | |
| H50 | Write and commit to a table with Delta Kernel | |
| H51 | Test a connector with the Delta Acceptance Tests | |

### 7.7 Reference

| ID | Reference unit | Priority / journeys | Source and maintenance rule |
| --- | --- | --- | --- |
| R01 | Features and engine support | P0 / J01, J05 | Derived from the coverage page: `tested` cells become "Tested here", `documented` cells "Upstream", `no` cells "Not supported". A `?` never reaches readers. Rows use the scenario keys. |
| R02 | Table features *(exists, draft)* | P0 / J05 | Every feature with its protocol name, reader/writer, dependencies, enabling property, and source (spec table, spec body, or accepted RFC), including preview names such as `typeWidening-preview`. |
| R03 | Table properties | P0 / J04, J05 | Every `delta.*` property, default, which writer honors it. |
| R04 | Protocol specification index | P1 / J05 | Annotated index into `PROTOCOL.md` at the release tag. |
| R05 | Spark SQL commands for Delta | P0 / J02 | DDL, DML, and utility commands with syntax and links to tasks; notes FSCK and `GENERATE`. |
| R06 | Spark configuration | P1 / J06 | Session configs that matter in OSS, with defaults by version. |
| R07 | deltalake storage options | P0 / J07 | Every storage option per backend, environment variables, locking and conditional-put options. |
| R08 | API references for Spark, deltalake, and DuckDB | P1 / J06 | Version-pinned links to the Spark Python API, delta-rs Python docs, and the DuckDB extension page. |
| R09 | Concurrency conflict errors | P0 / J11 | Each error per engine, verbatim, the conflicting operation pairs, and fixes. |
| R10 | Engine and client compatibility | P0 / J01, J06 | Tested version tuples and what each interface can do, with the UC R10 labels (Tested here, Upstream, Provider). |
| R11 | Releases and version compatibility | P0 / J10 | Delta × Spark × Scala, `deltalake` × Arrow, DuckDB × extension; user-facing changes per release. |
| R12 | Data types | P1 / J05 | Delta types and their Spark, Arrow, and DuckDB mappings; `timestampNtz`, variant, type-widening paths. |
| R13 | Kernel API references | Later / J09 | |
| R14 | Operation equivalents across engines | P0 / J06 | One row per scenario key with the command in each interface, or why it has none. The lookup page for agents. |

## 8. Reuse, migration, and published-blog coverage

### Existing factory drafts

| Existing page | Decision | Id |
| --- | --- | --- |
| `explanation/001-what-is-delta-lake.md` | Keep; add the implementations section and link R01. | E01 |
| `explanation/002-delta-kernel-architecture.md` | Keep in Concepts; recheck against the Kernel guide when J09 starts. | E09 |
| `how-to/001-read-a-delta-table/` | Keep; add Spark SQL (first), PySpark, and DuckDB tabs. | H01 |
| `how-to/002-query-a-table-as-of-version/` | Keep; add the tabs, timestamp reads, and the retention boundary. | H02 |
| `tutorials/001-your-first-delta-table.md` | Rewrite as the Spark SQL tutorial, folder-mode with snippets. | T01 |
| `tutorials/002-explore-table-history/` | Rewrite in Spark SQL; move its `deltalake` steps to H02/H18 tabs. | T02 |
| `reference/001-table-features.md` | Expand per R02; reconcile the spec sources. | R02 |
| `reference/090-coverage/` | Private coverage page; R01 and R10 derive from it. | — |

### docs.delta.io migration map

| Legacy page | New home | Treatment |
| --- | --- | --- |
| `quick-start` | T01, H38 | Split learning from Spark setup. |
| `delta-batch` | H01-H04, H10, H14, H31, H54, R05 | Split by task; options to reference. |
| `delta-streaming` | T07, H17 | Split tutorial and task. |
| `delta-update` | T03, H05, H06 | Split MERGE from update/delete. |
| `delta-change-data-feed` | H16, E12 | |
| `delta-utility` (history, detail, vacuum, restore, clone, convert, manifest) | H07-H09, H18, H21, R05 | One task per command family; `VACUUM LITE`/`INVENTORY` in H21. |
| `delta-constraints`, `delta-default-columns` | H13, H14 | |
| `versioning`, `delta-drop-feature` | E04, H24, H25, R02 | |
| `delta-column-mapping`, `delta-type-widening` | H11, H12, E07 | |
| `delta-clustering`, `optimizations-oss` | H19, H20, H22, E05 | `OPTIMIZE FULL` in H19. |
| `delta-deletion-vectors`, `delta-row-tracking` | H23, H26, E06 | |
| `delta-catalog-managed-tables` | E10, UC docs | Explain here; setup in the UC docs. |
| `delta-storage` | E08, H27-H30, R07 | Split per cloud; add `deltalake`, DuckDB, and mixed-engine cases. |
| `concurrency-control` | E03, H35, R09 | |
| `porting` | H33 | |
| `best-practices`, `delta-faq` | Fold into tasks and concepts | Each practice lives where it applies. |
| `table-properties` | R03 | |
| `releases` | R11 | |
| `delta-uniform`, `delta-sharing`, `delta-spark-connect` | H47, H48, H39 (later) | Keep the legacy pages reachable until then. |
| `delta-kernel*`, `delta-standalone` | E09, T09, H49-H51, R13 (later) | Standalone is deprecated; archive with a pointer to Kernel. |
| Connector pages | H44-H46 (later) | First-party only after tests. |
| `delta-apidoc` | R08 | |

### delta-rs and DuckDB documentation

| Source | Treatment |
| --- | --- |
| delta-rs usage pages (create, load, write, merge, delete, manage, optimize, CDF, constraints) | Become the `Python` tabs. Coordinate with maintainers before anything moves upstream. |
| delta-rs object-storage pages | Feed H27-H30 and R07. |
| delta-rs feature table | Input to the coverage page, replaced for readers by R01. |
| delta-rs API reference | Stays upstream; linked from R08. |
| DuckDB `delta` extension page | Feeds H40 and the DuckDB tabs. Options stay upstream and are linked. |

### Blogs

delta.io has many Delta tutorials in blog form (MERGE, Z-order, vacuum,
DuckDB, Polars). Use them as seeds for the matching how-to, check every
example against the pinned versions, and point the blog to the durable page
once it exists.

## 9. Agent-optimized documentation

The emitted site already serves `.md` twins, `llms.txt`, a Copy page menu, and
whole-runnable scripts. The content itself has to do the rest:

1. **One task per page**, with an intro that answers the question and names
   Delta and the interfaces, so a quoted paragraph stands alone.
2. **An engine-support line and a Requirements block at the top** of each
   feature page: protocol feature name, whether readers or writers need it, and
   the minimum version per interface, from R01.
3. **Explicit negatives.** "DuckDB can't run MERGE" is a fact with a source,
   not an absence.
4. **Lookup pages keyed by scenario.** R14 gives the command in each
   interface; R01 gives support. An agent translating a task between engines
   needs both.
5. **Error strings verbatim** in R09, H35, and H36, each mapped to a cause and
   a fix, so an agent can match the text of a failure.
6. **Machine-readable frontmatter.** `engines:` lists the interfaces a page
   covers, and `delta_features:` uses protocol feature names (§12). `llms.txt`
   can then group pages by engine.
7. **Stable anchors and pins.** Imperative, unique `##` task headings; exact
   version pins; no release numbers in prose (the UC versioning rule).

Patterns worth adopting:

| Source | Pattern | Adopt | Avoid |
| --- | --- | --- | --- |
| Databricks Delta docs [D01-D04, D09-D10] | Task-titled pages grouped by job; requirement boxes; a feature-compatibility table; "when to use" framing; limitations sections; a table-properties reference. | The Requirements block, R02/R03, "when to use" notes in H19/H20, limitations under each task. | Platform features or runtime versions as if they applied to OSS. |
| Apache Iceberg [D07, D08] | Spec separate from engine docs; an implementation-status matrix per feature and language. | R01 as a status matrix; R04 indexing the spec. | Making readers learn the spec before a first task. |
| DuckDB [S18] | One short, task-oriented page per extension, with options in tables. | H40's shape; options linked, not copied. | Nightly extension builds as an unexplained default. |
| PyIceberg [D06] | One configuration page for storage by backend. | R07 as a single storage-option table. | One long page for the whole API. |
| LanceDB [D05] | A quickstart that grows step by step; language tabs; `llms.txt`. | Tabs in fixed order; T11 as the quick path. | Mixing a commercial product into the OSS path. |
| UC plan | Journeys, ids, "what not to promise", test lanes, R01 known issues. | Everything in §10 of that plan. | — |

## 10. Delivery sequence and decisions

### Phase 0: agree the boundary and settle the open checks

1. Pin the Spark tuple. Recommended: PySpark 4.2.x with `delta-spark` 4.4.0,
   because `configure_spark_with_delta_pip` and the unsuffixed
   `delta-spark_2.13` artifact both resolve to Spark 4.2. Alternative: Spark
   4.1, which matches the UC docs' tuple.
2. Confirm the `spark-sql` shell from the pip install runs Delta headless in
   CI, and that tutorial regions can run through `spark.sql()` statement by
   statement.
3. Pin DuckDB and the `delta` extension channel (core, not nightly, for
   path-based tables).
4. Add `content/delta/release.yml` and a `just bump-delta` recipe, mirroring
   the UC manifest.
5. Agree the table-addressing convention (§4) and the tab label for
   `deltalake` (§12).
6. Work the coverage page's open checks with small scripts. The first two
   (DuckDB appends to feature-enabled tables, mixed-engine S3 appends) decide
   what H53 and H27 can say.
7. Agree the split with delta-rs maintainers, and docs.delta.io redirects with
   Delta maintainers.

### Phase 1: first coherent release

- Start here and set-up: E01, R01, T01, T11, R10; H38, H52, H40, H53.
- Foundations: E02-E05, E08, E12; R02, R03, R05, R07, R09, R11, R14.
- Learning: T02, T03.
- Tasks: H01-H06, H10, H20, H21, H24, H27, H35, H36.

### Phase 2: replace docs.delta.io

All remaining P1 entries: schema and data quality, CDF and streaming, layout,
deletion vectors, Azure, GCS, and S3-compatible storage, catalogs, upgrades,
H54, E06, E07, E10, E13. At this point docs.delta.io can redirect, provided
every legacy page in §8 has a destination (later-phase pages keep their legacy
URL until then).

### Phase 3: more engines and depth

Polars, pandas/Daft/DataFusion, the Rust crate, Trino, Flink, UniForm readers,
Kernel and connector authoring (J09), Delta Sharing, Spark Connect, VARIANT,
and the remaining P2 entries. Each new engine adds a column to the coverage
page first.

### Decisions still requiring confirmation

| Decision | Proposed default | Gate/owner |
| --- | --- | --- |
| Supported versions | Current Delta 4.x, `deltalake` 1.x, DuckDB 1.5.x; archive older docs. | Delta and delta-rs maintainers. |
| Spark tuple | Delta 4.4.0 on Spark 4.2; 4.1 if CI or UC alignment requires it. | Docs CI proves the tuple. |
| Table addressing | Paths everywhere except catalog pages. | Phase 0 review. |
| `deltalake` tab label | `Python`, unless review finds it confusing next to `PySpark`; then `deltalake`. | Phase 0 review. |
| DuckDB extension channel | Core `delta`; nightly only where a page needs it and says why. | Docs CI. |
| delta-rs content split | Tasks and storage here; API reference and contributor docs there. | delta-rs maintainers. |
| Site | A `delta-docs` site config beside `unitycatalog-docs`, emitted by `just emit-docs`. | Follow-up after Phase 0. |

## 11. Authoring and verification contract

The UC plan's §10 applies: colocated `snippets/`, PEP 723 scripts, assertions
outside region markers, pinned versions, and an article is done when its task
passes against the stated release. Delta adds:

| Lane | Coverage | Rule |
| --- | --- | --- |
| Python | `deltalake` snippets on local storage. | Default lane; required on every content change. |
| DuckDB | `.sql` regions run by a PEP 723 driver through the `duckdb` package. | Default lane; no Docker needed. |
| Spark | `.sql` regions run through `spark.sql()` in one session per driver; PySpark snippets run as scripts; exact Delta × Spark × Scala tuple. | Needs Java and the Maven proxy, not Docker. Required for every page with a Spark tab. |
| Cross-engine | A table written by one engine and read by another, for every `tested` read cell in the coverage page, including feature-enabled tables. | T11 and H53 double as these. |
| Storage | `envs/aws-sim` for S3 semantics, conditional writes, and DynamoDB locking. | Required for H27, H28, T08. |

Displayed SQL should be exactly what runs. Proposed helper: `docsnip.sqlregions`,
a sibling of `tools/docsnip/src/docsnip/shellregions.py` with the same
`--8<--` regions, a Spark or DuckDB runner, and statement splitting. A
`verifies = "<name>.sql"` key in `[tool.docs-factory]` publishes the `.sql`
file as the runnable example, as the CLI drivers do today.

Feature pages carry a Requirements block and an engine-support line:

```markdown
:::note[Requirements]
Table feature `<name>` (writers only, or readers and writers).
Spark SQL and PySpark: Delta <version>. Python: deltalake <version>.
DuckDB: <version, or "reads only">.
:::

Works in <interfaces>. <Interface> can't <task>: <reason>.
```

The values come from R01, never from memory.

The coverage page is the support record. A PR that adds or changes a script
updates the cells that script proves.

## 12. Convention proposals

1. **Tab labels are fixed**: `Spark SQL`, `PySpark`, `Python`, `DuckDB`, in
   that order, so the tab sync in `content/README.md` § "Interface tabs" works
   across the site.
2. **`engines:` frontmatter.** A vocab-checked list (`spark-sql`, `pyspark`,
   `deltalake`, `duckdb`) of the interfaces a page covers.
3. **`delta_features:` is the R01 join key.** Constrain its values to protocol
   feature names, with a short list of non-feature topics (`time-travel`). The
   existing values `time-travel` and `table-features` need that list. This
   needs a vocab entry and a docsnip check before use.
4. **The coverage page is the support record.** Markdown tables for now, no
   generator. A later lint could check that every `tested` cell links a page
   whose scripts run in a lane.
5. **The engine-support line and Requirements block** become part of the Delta
   how-to anatomy, as an addendum to `content/README.md` § "How-to page
   anatomy".
6. **Every engine claim cites its R01 row**, which cites a test.
7. **A Delta release manifest** mirrors `content/unitycatalog/release.yml`.

## 13. Source register

S01–S14 and D01–D08 were consulted on 2026-10-04; S15–S20 and D09–D10 on
2026-10-11. Databricks URLs were updated to their current paths.

### Delta Lake, delta-rs, DuckDB, and Kernel

| ID | Source |
| --- | --- |
| S01 | Delta 4.4.0 release notes: `https://github.com/delta-io/delta/releases/tag/v4.4.0`. |
| S02 | Delta releases and announcements: `https://github.com/delta-io/delta/releases`; `https://delta.io/blog/2026-04-17-delta-4-2-released`; `https://delta.io/blog/2026-06-22-delta-4-3-release/`. |
| S03 | Delta 4.4 / UC Delta API post: `https://delta.io/blog/2026-08-20-simplifying-your-open-lakehouse-with-the-delta-kernel-and-the-uc-delta-apis/`. |
| S04 | Protocol: `https://github.com/delta-io/delta/blob/master/PROTOCOL.md` ("Valid Feature Names in Table Features"); resolve to the release tag for article evidence. |
| S05 | Protocol RFCs: `https://github.com/delta-io/delta/tree/master/protocol_rfcs` (accepted: catalog-managed, in-commit-timestamps, type-widening, vacuum-protocol-check, variant-type, variant-shredding). |
| S06 | Live docs: `https://docs.delta.io/`. |
| S07 | Docs source: `https://github.com/delta-io/delta/tree/v4.4.0/docs/src/content/docs` (46 pages; sidebar in `docs/astro.config.mjs`). |
| S08 | delta-rs docs: `https://delta-io.github.io/delta-rs/`; source `delta-rs/docs/`. |
| S09 | delta-rs feature table and S3 docs: `https://github.com/delta-io/delta-rs/blob/python-v1.6.6/docs/feature-table.md`; `docs/integrations/object-storage/s3.md`; `docs/usage/writing/writing-to-s3-with-locking-provider.md`. |
| S10 | Python package: `https://pypi.org/project/deltalake/`. |
| S11 | delta-rs workspace and crate versions: `delta-rs/Cargo.toml`, `delta-rs/python/Cargo.toml`, repository tags. |
| S12 | Delta Kernel Rust user guide and repository: `https://github.com/delta-io/delta-kernel-rs`. |
| S13 | delta.io website: `website/src/pages/learn/getting-started.md`. |
| S14 | Delta Acceptance Tests: `https://github.com/delta-incubator/dat`. |
| S15 | `delta-spark` Python API at v4.4.0: `https://github.com/delta-io/delta/blob/v4.4.0/python/delta/tables.py`. |
| S16 | Delta SQL grammar at v4.4.0: `https://github.com/delta-io/delta/blob/v4.4.0/spark/src/main/antlr4/io/delta/sql/parser/DeltaSqlBase.g4`. |
| S17 | `deltalake` 1.6.6 Python source: `https://github.com/delta-io/delta-rs/tree/python-v1.6.6/python/deltalake` (`table.py`, `writer/writer.py`, `transaction.py`, `_internal.pyi`). |
| S18 | DuckDB `delta` extension: `https://duckdb.org/docs/current/core_extensions/delta.html`; `https://github.com/duckdb/duckdb-delta`. |
| S19 | The `pyspark` 4.2.0 wheel: ships `pyspark/bin/spark-sql` and `jars/spark-hive-thriftserver_2.13-4.2.0.jar`. |
| S20 | Tested UC pages in this repo: `content/unitycatalog/tutorials/007-managed-delta-table/` (Spark SQL), `content/unitycatalog/how-to/008-duckdb/` (DuckDB), `content/unitycatalog/reference/001-features-and-limitations/` (known issues). |

### Documentation design sources

| ID | Source |
| --- | --- |
| D01 | Databricks Delta Lake: `https://docs.databricks.com/aws/en/delta/`. |
| D02 | Databricks table properties: `https://docs.databricks.com/aws/en/tables/table-properties`. |
| D03 | Databricks task pages: merge `/aws/en/delta/merge`, selective overwrite `/aws/en/delta/selective-overwrite`, schema evolution `/aws/en/tables/update-schema`, streaming `/aws/en/structured-streaming/delta-lake`, history `/aws/en/tables/history`, clustering `/aws/en/tables/clustering`, optimize `/aws/en/tables/operations/optimize`, vacuum `/aws/en/tables/operations/vacuum`, file size `/aws/en/tables/tune-file-size`. |
| D04 | Databricks Delta best practices: `https://docs.databricks.com/aws/en/delta/best-practices`. |
| D05 | LanceDB: `https://docs.lancedb.com/`; `https://docs.lancedb.com/llms.txt`. |
| D06 | PyIceberg: `https://py.iceberg.apache.org/`; configuration `https://py.iceberg.apache.org/configuration/`. |
| D07 | Apache Iceberg docs and spec: `https://iceberg.apache.org/docs/latest/`; `https://iceberg.apache.org/spec/`. |
| D08 | Iceberg implementation status: `https://iceberg.apache.org/status/`. |
| D09 | Databricks table feature compatibility: `https://docs.databricks.com/aws/en/tables/features/feature-compatibility`. |
| D10 | Databricks isolation levels and write conflicts: `https://docs.databricks.com/aws/en/optimizations/isolation-level`. |

Local convention evidence: `AGENTS.md`, `content/README.md`,
`content/delta/`, `docs/design/unitycatalog-documentation-plan.md`.
