# Ecosystem Fragmentation in Open Lakehouse Table Formats: Delta Lake vs Apache Iceberg

**Date:** 2026-06-26
**Method:** Deep-research harness — 5 search angles → 25 sources fetched → 120 claims extracted → 25 adversarially verified (3-vote, 2/3-to-kill) → synthesis. 23 claims confirmed, 2 refuted.
**Companion data:** [`delta-matrix.json`](./delta-matrix.json), [`iceberg-matrix.json`](./iceberg-matrix.json) — parseable feature × engine support matrices.

> **Confidence labels.** Each non-obvious claim below is tagged:
> - **[V]** = adversarially verified (survived 3-vote refutation, 2/3 needed to kill).
> - **[S]** = single-source extracted (from a fetched primary/secondary source, not independently re-verified).
> - **[V-med]** = verified but downgraded (single interested-party framing).
> Refuted claims are listed explicitly in §9 — do not cite them.

---

## 1. Executive summary

Both major open lakehouse table formats fragment their ecosystems through **versioned, feature-flag-based capability negotiation** — but by different mechanisms, and the practical consequence is the same: *a client can be "compatible" with the format yet unable to read or correctly interpret a given table.*

- **Delta Lake** replaced continuous integer protocol versioning with a discrete **table-features** scheme anchored at **reader version 3 / writer version 7**. A client may read a table only if the table's `readerFeatures` are a **subset** of what the client supports, and write only if `writerFeatures` are a subset. Missing one feature (e.g. `deletionVectors`) **hard-bars** the client from the table entirely. **[V]**
- **Apache Iceberg** fragments along **format-version lines (v1/v2/v3)**. v2 added row-level deletes (position + equality); v3 added Puffin binary deletion vectors, row lineage, VARIANT/geo types, nanosecond timestamps, and default column values. Engine support arrives **unevenly** — v3 is GA in Spark/Flink but absent or roadmap-only in Trino (OSS), Snowflake, Athena, BigQuery, StarRocks, Dremio, ClickHouse, Impala as of late 2025/early 2026. **[V] / [S]**

**The single most dangerous fragmentation vector — for both formats — is deletion vectors.** DVs soft-delete rows by recording invalidated positions in a side file rather than rewriting data. A reader that *ignores* DVs does not error — it **silently returns rows the writer considers deleted** (a correctness bug, not a crash). And these features are increasingly **default-on** in writers (Databricks runtimes; "All Apache Iceberg v3 tables include deletion vectors by default"). Worse, enabling them **automatically and usually irreversibly upgrades the table protocol**. **[V] / [S]**

**The counter-trend is consolidation through shared kernels.** Rather than each engine reimplementing the protocol (and diverging), engines increasingly adopt a **kernel/library**: `delta-kernel-rs` (Rust) powers DuckDB, ClickHouse, and delta-rs; the **Java Delta Kernel** powers StarRocks and Apache Druid. On the Iceberg side, `iceberg-rust`, PyIceberg, iceberg-go, and the Java reference library play the equivalent role. Iceberg v3 was also **deliberately aligned with Delta** (row lineage ↔ row tracking; a single shared VARIANT binary encoding ratified in the Apache Parquet community) to reduce divergence. **[V] / [V-med]**

> **Scope honesty.** The adversarially-verified core (§2–§4) is strongest on Delta protocol mechanics and a few engines (Trino, DuckDB, StarRocks). The wider engine matrix, Unity Catalog detail, and interop (§5–§7) draw on single-source extraction from primary docs/blogs/issues — labeled **[S]** and reflected as lower-confidence cells in the JSON. Iceberg v3 engine support is changing rapidly (v3 only reached GA across engines in 2025–2026); treat all v3 cells as time-sensitive.

---

## 2. How Delta Lake fragments: the table-features mechanism

### 2.1 The mechanism
- The table-features mechanism is introduced at **reader version 3 / writer version 7**, adding `readerFeatures` and `writerFeatures` lists to the protocol action. These are the **final** protocol versions — all subsequent features are enabled via individual feature flags, never another version bump. **[V]** (`PROTOCOL.md`; delta.io blog 2023-07-27; Databricks feature-compatibility docs)
- Versions: `minReaderVersion` ∈ {1, 2, 3}; `minWriterVersion` ∈ {2…7} (writer versions start at 2). **[V]**
- Two feature categories:
  - **Reader-writer features** — listed in *both* lists; require reader 3 **and** writer 7; impact reads and writes. All reader features are also writer features.
  - **Writer-only features** — listed in `writerFeatures` only; require writer 7; **do not block readers** (legacy read-only workloads keep working). **[V]**
- Shipped in **Databricks Runtime 12.2 LTS / OSS Delta 2.3.0**. **[V]**

### 2.2 The subset-negotiation rule (the precise fragmentation mechanism)
> A client can **read** only if the table's `readerFeatures` ⊆ client's `supportedReaderFeatures`, and **write** only if `writerFeatures` ⊆ `supportedWriterFeatures` (writers must also satisfy the reader subset). A client missing **any one** listed feature is barred **entirely** — there is no partial/degraded read. **[V]** (delta.io blog; `PROTOCOL.md`)

### 2.3 Named feature → protocol version map
Under the table-features mechanism all features are expressed at reader 3 / writer 7; the lower numbers below are the **legacy** protocol-version requirements. **[V]** (Databricks feature-compatibility docs; `PROTOCOL.md`)

| Feature | Legacy reader | Legacy writer | Class |
|---|:---:|:---:|---|
| `columnMapping` | 2 | 5 | reader-writer |
| `deletionVectors` | 3 | 7 | reader-writer |
| `timestampNtz` | 3 | 7 | reader-writer |
| `variantType` | 3 | 7 | reader-writer |
| `catalogManaged` (catalog commits) | 3 | 7 | reader-writer |
| `checkConstraints` | — | 3 | writer-only |
| `changeDataFeed` | — | 4 | writer-only |
| `invariants`, `appendOnly`, `generatedColumns` | — | ≤7 | writer-only |
| `identityColumns` | — | 6 | writer-only (mixed) |

The spec also defines `v2Checkpoint`, `typeWidening`, `rowTracking`, `domainMetadata`, `icebergCompatV1/V2`, `vacuumProtocolCheck`, `inCommitTimestamp`, `clustering` (liquid clustering), and `collations`, each carrying a reader-writer vs writer-only classification. **[S]** (`PROTOCOL.md`)

### 2.4 Irreversibility amplifies the risk
> "When you enable a feature on a table, the table protocol is automatically upgraded. … **Most protocol version upgrades are irreversible**, and upgrading … might break existing Delta Lake table readers, writers, or both." **[V]** (Databricks docs; corroborated by vendor-neutral docs.delta.io)

Deletion vectors are a partial exception: the DV feature **can be dropped** to restore compatibility, supported in **Databricks Runtime 14.1+**. **[S]** (Databricks deletion-vectors docs)

---

## 3. How Apache Iceberg fragments: format versions v1 → v2 → v3

- **v1** — management of large analytic tables over immutable files (Parquet/Avro/ORC): schema evolution, hidden partitioning (partition specs/transforms), partition evolution, sort orders, snapshots/time travel. **[S]** (iceberg.apache.org/spec)
- **v2** — adds **row-level updates and deletes** for immutable files via **position deletes** (data-file path + row position) and **equality deletes** (by column values, e.g. `id = 5`). This is the merge-on-read foundation. **[V]** (Iceberg spec)
- **v3** — extends types and metadata: **[V]** (Iceberg spec)
  - New primitive types: **nanosecond** `timestamp(tz)` (`timestamp_ns`/`timestamptz_ns`), `unknown`, **VARIANT**, **geometry**, **geography**.
  - **Binary deletion vectors** (Puffin format, `content_offset` / `content_size_in_bytes`).
  - **Row lineage** (`_row_id` + `_last_updated_sequence_number`).
  - **Default column values** (`initial-default` / `write-default`).
- Backward compatibility: all v1 files remain valid after upgrade to v2; **readers are kept permissive, writers must follow stricter version-specific requirements**. **[S]** (Iceberg spec)

### 3.1 Cross-format alignment (v3 designed toward Delta)
- Iceberg v3 **row lineage** is *compatible with* Delta's **row tracking** (`_metadata.row_id` + `_metadata.row_commit_version`). **[V-med]** — field equivalence is independently checkable, but the explicit "compatible" framing traces primarily to Databricks (an interested party driving both formats).
- Iceberg v3 **VARIANT** shares a **single binary encoding** with Delta's `variantType`, ratified in the Apache Parquet community. **[V]** (independently confirmed across Snowflake/AWS/Google engineering blogs)

---

## 4. The core fragmentation risk: silent, default-on, irreversible writer features

This is where "ecosystem fragmentation" stops being academic. The failure modes:

1. **Silent correctness, not a crash (Delta DVs).** Spec: a DV file "describes the set of invalidated (or 'soft deleted') rows," and records remain "physically present in the underlying data file." The spec mandates invalidated records "must not be returned" — so a non-DV-aware reader **violates the spec and returns deleted rows**. **[V]** (`PROTOCOL.md`)

2. **Hard failure for some clients (delta-rs).** `delta-rs` 0.26.2 (~June 2025) **cannot open** a table with the `DeletionVectors` reader feature — it fails with `Unsupported reader features required: [DeletionVectors]`. This is a long-standing gap (issue #3543 closed as duplicate of the much older #1094). The failure is a **hard refuse-to-open**, not a degraded read. **[S]** (delta-rs issue #3543)

3. **Default-on writers create tables most readers can't use.** "Once deletion vectors are enabled … clients without deletion vector support cannot read the table." DVs default on in recent Databricks runtimes; Trino's DV write defaults on (`delta.deletion-vectors-enabled`). On the Iceberg side, "**All Apache Iceberg v3 tables include deletion vectors by default**." **[S]** (Databricks docs; ryft.io)

4. **Late and uneven implementation.** Trino's Delta connector did **not** read DVs until **Sept 2023** (PR #17477); DV *writes* came in release 454, MERGE in 469. So "Trino supports Delta" hid a years-long window where DV tables were unreadable. **[V] / [S]** (Trino issue #16903; Trino docs)

**Takeaway:** the fragmentation that matters most is not "engine X doesn't support format Y" — it's "engine X *claims* to support format Y but silently mishandles a default-on feature written by engine Z."

---

## 5. Kernels and libraries — the consolidation counter-trend

The clearest structural answer to fragmentation: **stop reimplementing the protocol per engine; adopt a shared kernel.**

### 5.1 Delta Kernel (two implementations)
- **Java Delta Kernel** (in the main `delta-io/delta` repo) — for JVM engines. **Rust kernel `delta-kernel-rs`** — Rust + C library with FFI usable from Rust, C, C++, Python. **[V] / [S]** (delta.io blog; delta-kernel-rs repo)
- **What the kernel unlocks for adopters:** Type Widening, VARIANT, In-Commit Timestamps, **Deletion Vectors**, Column Mapping, and logical↔physical schema reconciliation. **[S]** (delta.io blog)
- **Maturity asymmetry — important:** kernel **read** APIs have largely stabilized; **write** APIs are still evolving and (in `delta-kernel-rs`) experimental, limited to **blind appends only** (no update/delete/merge via the kernel write path). The Rust kernel is still in the 0.x line with unstable APIs. **[S]** (delta-kernel-rs repo; delta.io state-of-project)

**Which clients support Delta *via a kernel* (the user's specific ask):**

| Client | Kernel | Adoption status |
|---|---|---|
| **DuckDB** (delta extension) | `delta-kernel-rs` (Rust) | Built on the kernel; **not** a bespoke reimpl. Pinned via GIT_TAG. **[V]** |
| **delta-rs / Delta Lake (Rust/Python)** | `delta-kernel-rs` (Rust) | **Migrating** to the kernel as its protocol layer (in progress, not complete). **[S]** |
| **ClickHouse** | `delta-kernel-rs` (Rust) | Adopted the Rust kernel as the abstraction layer, replacing its bespoke native impl. Writes are **partial** (kernel coordinates metadata; ClickHouse writes the Parquet itself; cannot create empty tables). CDF surfaced via kernel in 25.12. **[S]** |
| **StarRocks** | **Java** Delta Kernel | Integrated in the Frontend; reads DV-enabled tables; uses `minReaderVersion`/`readerFeatures` for compatibility. **Read-only.** **[V]** |
| **Apache Druid** (v29) | **Java** Delta Kernel | Adopted for Delta **read** support, not bespoke. **[S]** |
| **Apache Flink** (Delta 3.1 Sink) | **Java** Delta Kernel | **Experimental, not default**; cut pipeline init time 45×. **[S]** |

> Note the maturity caveat as of the source's writing: kernel feature coverage was still incomplete (time travel was only arriving in Delta 3.2). **[S]**

### 5.2 Iceberg libraries (the equivalent layer)
Iceberg's engine support flows through the **Java reference library**, **`iceberg-rust`** (Rust), **PyIceberg** (Python), and **iceberg-go**. These are libraries/SDKs rather than a single "kernel" abstraction with the same framing as Delta Kernel, but they serve the analogous role of letting engines consume Iceberg without reimplementing the spec. *(Detailed per-library feature coverage was not independently verified in this run — see §10 open questions.)*

---

## 6. Unity Catalog: managed (Databricks) vs OSS (unitycatalog.io)

The user specifically asked to distinguish these two. Both expose **open REST APIs**, but their surface differs.

### 6.1 Managed Unity Catalog (Databricks platform) **[S]**
- Exposes **two** open REST interfaces: the **Unity REST API** (external + managed Delta tables) and the **Iceberg REST Catalog (IRC)** endpoint at `/api/2.1/unity-catalog/iceberg-rest` (configured `https://<workspace-url>/api/2.1/unity-catalog/iceberg-rest`).
- **Iceberg read/write via IRC depends on table type:**
  - **Managed Iceberg tables** → full **read + write** from Iceberg clients (plus optimize/govern/share, Predictive Optimization, Liquid Clustering).
  - **Foreign Iceberg**, **Managed Delta (Iceberg reads enabled)**, **External Delta (Iceberg reads enabled)** → **read-only** for Iceberg clients.
- **Apache Iceberg v3 is GA on UC** (deletion vectors, row tracking, VARIANT across managed/foreign/UniForm tables).
- **Credential vending** issues temporary cloud credentials (AWS session tokens / Azure delegation SAS) after UC-token auth (PAT/OAuth), using downscoping — **not** supported on Foreign Iceberg tables.
- **Engines that can talk to managed UC** (external access): Spark, DuckDB, Daft, StarRocks, Microsoft Fabric, and IRC-capable Trino and Dremio; documented Iceberg-client coverage names Spark, Flink, Trino, Snowflake, PyIceberg. Access requires `EXTERNAL USE SCHEMA` + `SELECT` privileges.

### 6.2 Open-source Unity Catalog (Apache-licensed Java server, unitycatalog.io) **[S]**
- Implements the **Iceberg REST Catalog API** (built leveraging Tabular expertise), enabling access from the Iceberg engine ecosystem.
- Supports **Delta Lake** and **Apache Iceberg (the latter via UniForm)**, plus Parquet/CSV/JSON.
- Supports **credential vending** to gate cloud-storage access; supports **managed and external tables** under unified access controls.
- Named integration paths: DuckDB, Trino, Spark — "data … can be read by virtually all compute engines" via the open APIs.

> **Practical distinction:** managed UC has the richer surface (managed Iceberg read+write, v3 GA, foreign-table federation, Predictive Optimization). OSS UC provides the open IRC + credential-vending core and Delta + UniForm-Iceberg, but the verified evidence does not confirm OSS-UC managed-Iceberg *write* or v3 parity — treat OSS-UC Iceberg as primarily UniForm/read-oriented pending direct confirmation (§10).

---

## 7. Cross-format interop

- **UniForm (Delta → Iceberg/Hudi).** When you write a Delta table, **Iceberg metadata is automatically generated** alongside the DeltaLog, colocated with the Parquet files — **one copy of data**. It is **one-directional** (Delta as source). Enables e.g. reading a Delta table as Iceberg in Snowflake (which only supports Iceberg). **[S]** (delta.io blog)
- **Apache XTable (formerly OneTable).** **Omni-directional** metadata translation between **Hudi ↔ Delta ↔ Iceberg** — reads existing metadata, writes out other formats' metadata (`_delta_log`, `metadata/`, `.hoodie/`) **without rewriting data files**. Incubating in the ASF. Contrast with UniForm's Delta-only-source model. **[S]** (xtable.apache.org; delta.io)
- **Iceberg → Delta conversion.** UniForm supports a **one-time zero-copy in-place conversion** of Iceberg tables to Delta. **[S]** (delta.io state-of-project)
- **Convergence point:** the **Iceberg REST Catalog** is becoming the shared control plane (both managed and OSS UC implement it), and Delta's `catalogManaged` / catalog-commit feature plus Iceberg v3's deliberate alignment (row lineage, VARIANT) point toward reduced divergence over time. **[V-med] / [S]**

---

## 8. Engine support at a glance (read the JSON for cell-level detail + sources)

> Legend: **R** = read, **R/W** = read+write, **R/W*** = write is partial/append-only, **✗** = unsupported, **?** = unconfirmed. Cells condensed from §2–§7; full per-feature detail and per-cell sources in the JSON files.

### Delta Lake
| Engine | Overall | Via kernel? | Notable |
|---|---|---|---|
| Spark / Databricks | R/W (reference) | — (reference impl) | DV/CM/all features; DV default-on in recent runtimes |
| Trino | R/W | bespoke | DV R/W (454+), CM R/W; typeWidening & v2Checkpoint **read-only** |
| delta-rs (Rust/Python) | R/W* | `delta-kernel-rs` (migrating) | **Cannot read DV tables** as of 0.26.2 (#3543) |
| DuckDB (delta ext) | R, W blind-insert | `delta-kernel-rs` | Reads DV tables; VARIANT; INSERT GA (May 2026); no UPDATE/MERGE/DELETE |
| ClickHouse | R, W partial | `delta-kernel-rs` | Metadata via kernel, CH writes Parquet; CDF in 25.12; can't create empty tables |
| StarRocks | R (DV-aware) | **Java** kernel | Read-only Delta catalog |
| Flink | R/W* (append) | Java kernel (Sink, experimental) | Append-only sink; no overwrite/upsert |
| BigQuery | R | bespoke | Reads reader v3 w/ DV + column mapping; no schema modify, no CDC |
| Hive / PrestoDB / Athena (Delta) | R | bespoke | Read-only connectors |
| Apache Druid (v29) | R | **Java** kernel | Read support via kernel |

### Apache Iceberg
| Engine | Overall | v3 status | Notable |
|---|---|---|---|
| Spark 3.5+ | R/W | **v3 GA** | DV + row lineage stable |
| Flink | R/W (streaming + batch) | **v3 GA** | Continuous streaming reads/writes |
| Trino (OSS) | R/W | **v3 ✗** (V1/V2) | INSERT/CTAS; no streaming |
| DuckDB (iceberg ext) | R | v3 ✗ | Read-only; COW-only, no delete files / MoR |
| ClickHouse | R | v3 ✗ (rejects DV tables) | Read-only (write/compaction roadmap) |
| Snowflake | R (external) | **v3 ✗** | Read-oriented; no time travel on external |
| BigQuery | R (external/BigLake) | v3 ✗ (V1/V2) | No time travel on external |
| Athena | R/W | **v3 ✗** | No DV/row-lineage/VARIANT |
| StarRocks | R/W* | v3 ✗ (V1/V2) | INSERT; no UPDATE/DELETE/MERGE |
| Impala (4.4+) | R/W* | ? | Position deletes only; **no equality deletes** |
| Dremio | R/W | v3 ✗ (V1/V2) | |
| Databricks UniForm-Iceberg | R (Iceberg clients) | targets **v2 only** (DBR 14.3+ path) | Read-only to Iceberg clients |

---

## 9. Refuted claims — do **not** cite these

Two plausible-sounding claims were **killed in verification**:

1. ✗ "Iceberg v3 deletion vectors use the **same binary encoding** as Delta DVs, enabling cross-format DV compatibility." — **refuted 1–2.** Do not assert binary-level DV interop between the formats. (VARIANT *does* share an encoding; DVs do not.)
2. ✗ "Iceberg v3 **replaces** v2 positional/equality deletes with deletion vectors, requiring a single DV per file at write time." — **refuted 0–3.** v3 adds binary DVs but does not wholesale replace v2 delete files in the manner described.

---

## 10. Open questions / gaps (lower confidence, needs direct confirmation)

The verified core did not fully cover:

1. **Full Iceberg feature × engine matrix** — per-feature (hidden partitioning, partition/schema evolution, position vs equality deletes, v3 Puffin DVs, branching/tagging WAP, REST catalog, VARIANT/geo, row lineage, default values) across all engines. Current JSON cells for Iceberg are coarser than for Delta.
2. **OSS UC vs managed UC parity** — does OSS UC support managed-Iceberg *writes* and v3, or only UniForm/read? Which engines reach OSS UC vs only managed UC?
3. **Interop behavior in practice** — UniForm metadata staleness/lag, bidirectional Delta↔Iceberg fidelity, XTable edge cases, catalogManaged + IRC convergence status.
4. **Iceberg library coverage** — exactly which features `iceberg-rust` / PyIceberg / iceberg-go expose, and how each engine's support flows through them.
5. **Time-sensitivity** — Iceberg v3 GA is mid-rollout (2025–2026); DuckDB Delta writes expanding (INSERT May 2026, MERGE/UPDATE/DELETE roadmap); Trino DV/MERGE landed across releases 454–469. Re-verify v3 cells before relying on them.

---

## 11. Sources

Primary specs and docs are weighted highest; blogs and issues corroborate implementation status.

**Specs / protocol (primary):**
- Delta protocol — https://github.com/delta-io/delta/blob/master/PROTOCOL.md
- Delta feature compatibility — https://docs.databricks.com/aws/en/delta/feature-compatibility
- Delta table features (blog) — https://delta.io/blog/2023-07-27-delta-lake-table-features/
- Delta versioning — https://docs.delta.io/latest/versioning.html
- Iceberg spec — https://iceberg.apache.org/spec/

**Kernels / libraries (primary):**
- Delta Kernel — https://delta.io/blog/delta-kernel/
- delta-kernel-rs — https://github.com/delta-io/delta-kernel-rs
- DuckDB delta extension — https://github.com/duckdb/duckdb-delta
- ClickHouse + Rust kernel — https://delta.io/blog/2026-05-18-integrating-the-rust-delta-kernel-into-clickhouse/
- StarRocks + Java kernel — https://delta.io/blog/starrocks-kernel/
- StarRocks Delta catalog docs — https://docs.starrocks.io/docs/data_source/catalog/deltalake_catalog/
- Delta state of the project — https://delta.io/blog/state-of-the-project-pt2/

**Engines (primary/secondary):**
- Trino Delta connector — https://trino.io/docs/current/connector/delta-lake.html
- Delta without Spark (delta-rs/engines) — https://delta.io/blog/delta-lake-without-spark/
- Iceberg query-engine matrix — https://olake.io/iceberg/query-engine/
- Iceberg engine comparison — https://estuary.dev/blog/comparison-query-engines-for-apache-iceberg/
- DuckDB Delta/UC updates — https://duckdb.org/2026/05/07/delta-uc-updates

**Unity Catalog (primary):**
- UC external access via open APIs — https://www.databricks.com/blog/secure-external-access-unity-catalog-assets-open-apis
- UC Iceberg external access — https://docs.databricks.com/aws/en/external-access/iceberg
- UC + next era of Iceberg — https://www.databricks.com/blog/unity-catalog-and-next-era-apache-icebergtm
- Open-sourcing UC — https://www.databricks.com/blog/open-sourcing-unity-catalog

**Interop:**
- Apache XTable — https://xtable.apache.org/
- Unifying open table formats (UniForm) — https://delta.io/blog/unifying-open-table/
- Iceberg v3 unification — https://www.databricks.com/blog/apache-icebergtm-v3-moving-ecosystem-towards-unification

**Fragmentation evidence (issues / blogs):**
- delta-rs DV read failure #3543 — https://github.com/delta-io/delta-rs/issues/3543
- Delta deletion vectors docs — https://docs.databricks.com/aws/en/delta/deletion-vectors
- Trino DV read support #16903 — https://github.com/trinodb/trino/issues/16903
- Iceberg v3 readiness — https://www.ryft.io/blog/apache-iceberg-v3-is-it-ready

---

*Generated by the deep-research harness (107 agents, 25 sources, 23/25 claims verified). Verified facts tagged **[V]**; single-source extractions tagged **[S]**; see per-cell `source` and `confidence` fields in the JSON matrices.*
