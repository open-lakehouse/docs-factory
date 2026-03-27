# Delta Protocol Feature × Engine Compatibility Matrix

## Summary

This matrix maps every named Delta protocol feature and protocol version requirement against eleven query and processing engines documented in the Wave 1 research series. Each cell indicates whether the engine can fully read **and** write tables that use the feature (✅), can read but not write (⚠️ read-only or partial), is blocked entirely by the feature (❌), has no applicable relationship with the feature (—), or has unconfirmed status from available sources (?). The matrix is derived from the individual engine reports and the canonical feature reference in `15-protocol-features.md`; cells where an engine's write path is write-capable but the specific feature is unimplemented are marked ❌ even if reads succeed. The single most significant cross-engine incompatibility source is **deletionVectors**: tables created or modified by Spark/Databricks Runtime 14+ or delta-rs now default to deletion vectors, which are unreadable by Flink and produce incorrect results in PrestoDB.

---

## Protocol Feature × Engine Matrix

### Reader Protocol Versions

Reader versions govern what a client must implement to correctly open a table. An engine that does not support the required reader version will fail to open the table or return incorrect results.

| Protocol Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|-----------------|-------|----------|--------|--------|------|------------|-------|----------|-------|------------|--------|
| Reader v1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reader v2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ [^f1] | ✅ | ✅ [^a1] |
| Reader v3 | ✅ | ✅ | ✅ [^d1] | ✅ [^p1] | ✅ [^da1] | ✅ | ✅ | ✅ | ❌ [^f1] | ? [^ch1] | ⚠️ [^a1] |

[^f1]: Flink (Delta Standalone) only supports protocol (1,2). Tables at reader v3 raise `InvalidProtocolVersionException`. Source: `12-engine-flink.md` §Known Limitations.
[^d1]: DuckDB supports reader v3 for features it knows about. Tables with unsupported v3 reader features (e.g., `v2Checkpoint`) cause a read error. Source: `03-engine-duckdb.md` issue #182.
[^p1]: Polars supports reader v1 and v3 only with an explicit allowlist (`deletionVectors`). Other v3 features (e.g., `columnMapping`, `v2Checkpoint`, `timestampNtz`) raise `DeltaProtocolError`. Source: `04-engine-polars.md` §Known Limitations #7.
[^da1]: Daft supports v3 reads for features backed by delta-rs, but `deletionVectors` raises `NotImplementedError` unless `ignore_deletion_vectors=True`. Source: `05-engine-daft.md` §Known Limitations.
[^ch1]: ClickHouse uses delta-kernel-rs as the default read path (v25.5+) which claims v3 support in principle, but ClickHouse documentation does not explicitly confirm full reader v3 feature coverage. Source: `13-engine-clickhouse.md` §Summary.
[^a1]: AWS Athena (engine v3) reads Delta tables natively from S3 with reader v1–v3 listed; however, advanced v3 reader features (deletion vectors, v2Checkpoint) are not explicitly confirmed. Source: `09-ecosystem-landscape.md`.

---

### Writer Protocol Versions

Writer versions govern what a client must implement to safely write to a table. An engine that does not implement a required writer version must not write to tables at that version.

| Protocol Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|-----------------|-------|----------|--------|--------|------|------------|-------|----------|-------|------------|--------|
| Writer v1–v2 | ✅ | ✅ | ✅ [^dw1] | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (exp) [^chw1] | ❌ |
| Writer v3–v6 | ✅ | ✅ | ❌ [^dw2] | ✅ [^pw1] | ✅ [^daw1] | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Writer v7 | ✅ | ✅ | ❌ | ✅ [^pw1] | ❌ [^daw1] | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

[^dw1]: DuckDB write support is append-only blind insert. It can write at v1/v2 level (no constraint enforcement). No overwrite, MERGE, DELETE, or UPDATE. Source: `03-engine-duckdb.md` §Operations Coverage.
[^dw2]: DuckDB cannot write tables at writer v3+. Its append-only path does not enforce `writeStatsAsJson/Struct`, CHECK constraints, generated columns, or column mapping. Source: `03-engine-duckdb.md` §Known Limitations.
[^pw1]: Polars delegates all writes to delta-rs. delta-rs supports writer v7 (feature-gated). Writer v3–v6 is supported via delta-rs cumulative enforcement. Source: `04-engine-polars.md` §Summary.
[^daw1]: Daft writes via delta-rs, which supports writer v7 table creation. However, Daft itself does not expose all writer features — schema_mode merge is unsupported, and deletion vectors cannot be written. Source: `05-engine-daft.md` §Operations Coverage.
[^chw1]: ClickHouse write support is experimental (requires `allow_experimental_delta_lake_writes = 1`) and supports only append INSERT on S3/GCS. Writer protocol level is not explicitly documented beyond basic append. Source: `13-engine-clickhouse.md` §Operations Coverage.

---

### Reader Table Features

Reader table features must be listed in a table's `readerFeatures` array and require all reading clients to implement them. A client that does not recognize a listed reader feature must refuse to read the table.

| Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|---------|-------|----------|--------|--------|------|------------|-------|----------|-------|------------|--------|
| columnMapping | ✅ | ✅ [^cm1] | ✅ [^cm2] | ❌ [^cm3] | ❌ [^cm4] | ✅ [^cm5] | ✅ | ⚠️ [^cm6] | ❌ [^cm7] | ✅ [^cm8] | ? |
| deletionVectors | ✅ | ✅ | ✅ [^dv1] | ✅ [^dv2] | ❌ [^dv3] | ✅ | ✅ | ❌ [^dv4] | ❌ [^dv5] | ? [^dv6] | ? |
| v2Checkpoint | ✅ | ✅ | ❌ [^v2c1] | ? [^v2c2] | ? | ✅ | ⚠️ [^v2c3] | ? | ❌ | ? [^v2c4] | ? |
| typeWidening | ✅ | ✅ | ? | ? | ? | ✅ | ⚠️ [^tw1] | ? | ❌ | ? | ? |
| variantType | ✅ [^var1] | ? | ? | ? | ? | ? | ? | ? | ❌ | ? | ? |

[^cm1]: delta-rs reads column-mapped tables (name and id modes) via delta-kernel-rs. delta-rs can write/enable column mapping. Source: `06-engine-datafusion.md`, `14-uniform-interop.md`.
[^cm2]: DuckDB reads column-mapped tables via ID-based column mapping (PR #230). DuckDB cannot perform column mapping DDL or enable it. Source: `03-engine-duckdb.md` §Operations Coverage "Schema evolution".
[^cm3]: Polars's native scan path does not support `columnMapping` as a reader v3 feature — it raises `DeltaProtocolError`. The PyArrow fallback (`use_pyarrow=True`) may work but is not documented as supported. Source: `04-engine-polars.md` §Known Limitations #7.
[^cm4]: Daft raises errors for tables with `delta.columnMapping.mode=name` or `id`. Source: `05-engine-daft.md` §Known Limitations #2.
[^cm5]: DataFusion (delta-rs) fully supports column mapping read and write. Source: `06-engine-datafusion.md` §Summary.
[^cm6]: PrestoDB resolves the logical schema via Delta Kernel (column mapping aware), but physical Parquet column lookup in `id` mode has unconfirmed edge cases. Source: `11-engine-prestodb.md` §Protocol: column mapping.
[^cm7]: The Flink Standalone connector does not support column mapping; requires Delta Kernel which current connector does not use for reads. Source: `12-engine-flink.md` §Protocol: column mapping.
[^cm8]: ClickHouse supports `name` mode column mapping (fix in v25.5 PR #78921); `id` mode behavior is undocumented. Source: `13-engine-clickhouse.md` §Protocol: column mapping.
[^dv1]: DuckDB correctly excludes soft-deleted rows when scanning tables with deletion vectors. Cannot produce deletion vectors on write. Source: `03-engine-duckdb.md` §Operations Coverage.
[^dv2]: Polars supports deletion vectors on read via delta-rs callback (requires `deltalake >= 1.4.2`). Polars cannot write deletion vectors. Source: `04-engine-polars.md` §Operations Coverage "Deletion Vectors".
[^dv3]: Daft raises `NotImplementedError` for tables with deletion vectors unless `ignore_deletion_vectors=True`, which may return stale rows. Source: `05-engine-daft.md` §Known Limitations #1.
[^dv4]: PrestoDB does not call `Scan.transformPhysicalData()` and reads Parquet files directly, so deletion-vector-marked rows are returned. Source: `11-engine-prestodb.md` §Protocol: deletion vectors.
[^dv5]: Flink Standalone only supports protocol (1,2); deletion-vector-enabled tables raise `InvalidProtocolVersionException`. Source: `12-engine-flink.md` §Protocol: deletion vectors.
[^dv6]: ClickHouse uses delta-kernel-rs upstream (which supports deletion vectors) but ClickHouse documentation does not explicitly confirm deletion vector read support. Source: `13-engine-clickhouse.md` §Protocol: deletion vectors.
[^v2c1]: DuckDB issues an unsupported error for tables with `V2Checkpoint` in `readerFeatures`. Source: `03-engine-duckdb.md` issue #182.
[^v2c2]: Polars allowlists only `deletionVectors` as a supported reader v3 feature; `v2Checkpoint` is not in the allowlist and would raise `DeltaProtocolError`. Source: `04-engine-polars.md` §Known Limitations #7.
[^v2c3]: Trino can read tables with v2 checkpoints but does not write them. Source: `10-engine-trino.md` §Known Limitations "V2 Checkpoint".
[^v2c4]: ClickHouse documentation does not confirm v2Checkpoint support; delta-kernel-rs has upstream support but ClickHouse-specific confirmation not found. Source: `13-engine-clickhouse.md` §Protocol: v2 Checkpoint.
[^tw1]: Trino can read type-widened schemas but cannot perform type widening writes. Source: `10-engine-trino.md` §Known Limitations "Type widening".
[^var1]: Variant Type GA in Delta 4.0 / Spark 4.0. No other engine has confirmed support.

---

### Writer Table Features

Writer table features must be listed in a table's `writerFeatures` array. Writers must implement every listed writer feature; clients that cannot implement a listed feature must not write to the table.

| Feature | Spark | delta-rs | DuckDB | Polars | Daft | DataFusion | Trino | PrestoDB | Flink | ClickHouse | Athena |
|---------|-------|----------|--------|--------|------|------------|-------|----------|-------|------------|--------|
| invariants | ✅ | ✅ | ❌ [^inv1] | ✅ [^inv2] | ⚠️ [^inv3] | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| appendOnly | ✅ | ✅ | ⚠️ [^ao1] | ✅ | ⚠️ [^ao2] | ✅ | ✅ | ❌ | ⚠️ [^ao3] | ⚠️ [^ao4] | ❌ |
| checkConstraints | ✅ | ✅ | ❌ [^cc1] | ✅ [^cc2] | ❌ [^cc3] | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| generatedColumns | ✅ | ✅ | ❌ | ⚠️ [^gc1] | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| allowColumnDefaults | ✅ | ✅ | ❌ | ✅ [^acd1] | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| changeDataFeed | ✅ | ⚠️ [^cdf1] | ❌ | ⚠️ [^cdf2] | ❌ | ⚠️ [^cdf3] | ❌ [^cdf4] | ❌ | ❌ | ⚠️ [^cdf5] | ❌ |
| rowTracking | ✅ | ? [^rt1] | ❌ | ? | ❌ | ? | ? | ❌ | ❌ | ❌ | ❌ |
| domainMetadata | ✅ | ✅ [^dm1] | ❌ | ✅ [^dm1] | ❌ | ✅ [^dm1] | ? [^dm2] | ❌ | ❌ | ❌ | ❌ |
| icebergCompatV1 | ✅ | ❌ [^ic1] | ❌ | ❌ [^ic1] | ❌ [^ic1] | ❌ [^ic1] | ⚠️ [^ic2] | ❌ | ❌ | ❌ | ❌ |
| icebergCompatV2 (UniForm) | ✅ | ❌ [^ic3] | ❌ [^ic4] | ❌ [^ic3] | ❌ [^ic3] | ❌ [^ic3] | ⚠️ [^ic5] | ❌ | ❌ | ❌ | ❌ |
| vacuumProtocolCheck | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| inCommitTimestamp | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ⚠️ [^ict1] | ❌ | ❌ | ❌ | ❌ |
| catalogManaged | ✅ | ? [^catm1] | ⚠️ [^catm2] | ? | ❌ | ? | ❌ [^catm3] | ❌ | ❌ | ❌ | ❌ |
| clustering | ✅ | ✅ [^cl1] | ❌ | ✅ [^cl1] | ❌ | ✅ [^cl1] | ⚠️ [^cl2] | ❌ | ❌ | ❌ | ❌ |

[^inv1]: DuckDB's write path is append-only blind insert with no constraint evaluation. Source: `03-engine-duckdb.md` §Known Limitations.
[^inv2]: Polars delegates to delta-rs which enforces invariants on write. Source: `04-engine-polars.md` §Summary.
[^inv3]: Daft writes via delta-rs but does not expose constraint configuration. Invariant enforcement behavior on Daft writes is not explicitly documented. Source: `05-engine-daft.md`.
[^ao1]: DuckDB can only append; it honors `appendOnly` semantics by default but cannot enforce it on its own writes because DuckDB's write path only does append anyway. It cannot read whether `appendOnly` is set and enforce a writer block if a non-append op were attempted. Source: `03-engine-duckdb.md`.
[^ao2]: Daft supports append and overwrite modes; it does not enforce `appendOnly` table properties at the delta-rs level when calling overwrite. Behavior on an `appendOnly=true` table with `mode="overwrite"` is not documented. Source: `05-engine-daft.md`.
[^ao3]: Flink DeltaSink is append-only by design. Source: `12-engine-flink.md` §Operations Coverage.
[^ao4]: ClickHouse writes are append INSERT only (experimental). Source: `13-engine-clickhouse.md`.
[^cc1]: DuckDB has no constraint enforcement in its write path. Source: `03-engine-duckdb.md`.
[^cc2]: Polars (via delta-rs) supports CHECK constraints via `DeltaTable.alter.add_constraint()`. Not directly surfaced in Polars API. Source: `04-engine-polars.md`.
[^cc3]: Daft has no CHECK constraint API. Source: `05-engine-daft.md`.
[^gc1]: Polars does not expose a generated columns API; delta-rs supports them, so they can be used by calling delta-rs directly, but there is no Polars-native generated column creation. Reading generated column values works. Source: `04-engine-polars.md`.
[^acd1]: Polars supports DEFAULT column values via delta-rs. Source: `04-engine-polars.md`.
[^cdf1]: delta-rs (and therefore DataFusion) can read existing CDF data but does not produce CDF change-data files during DML operations. Issue #2095. Source: `06-engine-datafusion.md` §Known Limitations #1.
[^cdf2]: Polars can read CDF via `DeltaTable.load_cdf()` (delegated to delta-rs) but cannot produce CDF on write. Source: `04-engine-polars.md` §Operations Coverage "Change Data Feed".
[^cdf3]: DataFusion can read CDF data via `DeltaOps::load_cdf()` but does not produce CDF during DML. Source: `06-engine-datafusion.md` §Summary.
[^cdf4]: Trino does not expose CDF. Source: `07-engine-spark.md` §Protocol and Table Management note on CDF reads being Spark-centric.
[^cdf5]: ClickHouse can read CDF data via version-range settings, but cannot produce CDF. Source: `13-engine-clickhouse.md` §Operations Coverage.
[^rt1]: Row Tracking requires `domainMetadata` and writer v7. delta-rs supports these at the protocol level but the Row Tracking feature specifically has no confirmed implementation in delta-rs. Source: `15-protocol-features.md`.
[^dm1]: delta-rs supports `domainMetadata` as a writer feature (required for clustering). Polars and DataFusion inherit this via delta-rs. Source: `15-protocol-features.md`, `06-engine-datafusion.md`.
[^dm2]: Trino supports clustering reads (PR #27052 merged); `domainMetadata` is implicitly required for clustering but Trino's write-side support for domain metadata actions is not explicitly confirmed beyond clustering context. Source: `10-engine-trino.md`.
[^ic1]: delta-rs cannot enable UniForm/IcebergCompat features. Source: `14-uniform-interop.md` §Known Limitations.
[^ic2]: Trino can read tables with `icebergCompatV1` enabled (listed in table features matrix in Trino docs) but cannot write `icebergCompatV1` metadata. Source: `10-engine-trino.md` §Protocol: UniForm.
[^ic3]: delta-rs cannot set `delta.enableIcebergCompatV1/V2` or `delta.universalFormat.enabledFormats` (issue #3299). Source: `14-uniform-interop.md`.
[^ic4]: DuckDB writes fail on tables with `icebergWriterCompatV1` (issue #289). Reads of UniForm-enabled Delta tables work. Source: `03-engine-duckdb.md` issue #289, `14-uniform-interop.md`.
[^ic5]: Trino can read tables with `icebergCompatV2` but cannot write UniForm metadata. Source: `10-engine-trino.md` §Protocol: UniForm.
[^ict1]: Trino surfaces `inCommitTimestamp` values in the `$history` metadata table for reads but its write-side support for generating `inCommitTimestamp` is not explicitly confirmed. Source: `10-engine-trino.md` §Protocol: managed commits.
[^catm1]: delta-rs catalogManaged / managed commits is not confirmed in available sources. Source: `14-uniform-interop.md`.
[^catm2]: DuckDB added catalog-managed table support (PR #291, merged 2026-03-17) for reading. Write support on catalog-managed tables is blocked by `icebergWriterCompatV1` (issue #289). Source: `03-engine-duckdb.md` §Operations Coverage.
[^catm3]: Trino has no documented support for managed commits / `catalogManaged`. Source: `10-engine-trino.md` §Protocol: managed commits.
[^cl1]: delta-rs supports the `clustering` writer feature (backed by `domainMetadata`). Polars and DataFusion inherit this via delta-rs. Source: `15-protocol-features.md`, `06-engine-datafusion.md`.
[^cl2]: Trino can read liquid-clustered tables (PR #22330) but cannot create or write them (issue #22811 open). Source: `10-engine-trino.md` §Protocol: liquid clustering.

---

## Interpretation: Cross-Engine Compatibility Risk

### High-Risk Features (most common incompatibility sources)

- **`deletionVectors`** is the single highest-risk feature. Spark (Delta 2.3+) and Databricks Runtime 14+ use deletion vectors as the default mechanism for DELETE and UPDATE. PrestoDB reads deletion-vector tables but silently returns logically deleted rows. Flink completely fails to open such tables. Daft requires a bypass flag that compromises result correctness. Any pipeline that reads Spark/Databricks-authored tables from PrestoDB, Flink, or Daft without knowing whether deletion vectors are enabled is at risk of returning incorrect data with no visible error (PrestoDB, Daft bypass) or hard failure (Flink).

- **`columnMapping`** is the prerequisite for column renaming, column dropping, and UniForm. Polars's native read path does not support it at all; Daft is entirely blocked; Flink has no support. Any table that has had columns renamed or dropped (a routine operation in Databricks) is silently incompatible with these three engines. The PrestoDB id-mode edge case adds further risk in high-governance environments using `id`-mode mapping.

- **`icebergCompatV2` / `icebergWriterCompatV1`** (UniForm) creates a write-block that is invisible unless triggered. DuckDB write operations against any Unity Catalog-managed table with UniForm enabled will fail with an opaque `Unknown feature 'icebergWriterCompatV1'` error. This affects all DuckDB users who point their delta extension at a Databricks-managed table without checking for UniForm. Since UniForm is often enabled automatically on Databricks Lakehouse tables, this is a common operational trap.

- **`changeDataFeed`** is a write-side feature that only Spark correctly produces. delta-rs, DataFusion, and ClickHouse can read existing CDF data but cannot generate CDF entries during DML. Tables configured with `delta.enableChangeDataFeed = true` will produce empty or stale CDF streams when written by any engine other than Spark.

- **`v2Checkpoint`** is an emerging risk as Delta 3+ tables migrate to V2 checkpoints. DuckDB issues a hard read error; Polars's reader v3 allowlist blocks it; Flink cannot read it. Production tables that enable `v2Checkpoint` (which becomes the default checkpoint format in some Databricks environments) will become unreadable by DuckDB and Flink.

### Engine Protocol Ceiling Rankings

Ranked from highest to lowest protocol feature coverage (read + write combined):

1. **Spark** — Full protocol ceiling. Only engine that implements every named feature at write depth, including all optimization features (Liquid Clustering, Auto Compaction, OPTIMIZE), Row Tracking, CDF write, managed commits, schema DDL, and UniForm enablement.
2. **delta-rs (DataFusion)** — Near-complete protocol support. Supports writer v7 with most named features. Gaps: cannot enable UniForm/IcebergCompat (issue #3299), Row Tracking confirmation missing, CDF write not implemented (issue #2095).
3. **Trino** — Strong read+write ceiling for standard analytics features. Full DML (INSERT, UPDATE, DELETE, MERGE), column mapping, deletion vectors, time travel, OPTIMIZE/VACUUM. Gaps: no Liquid Clustering write, no managed commits/`catalogManaged`, no UniForm write.
4. **Polars** — Read+write coverage is good for standard features (inherits delta-rs); some features not surfaced in the Polars API (generated columns, constraints, Row Tracking). Cannot read `columnMapping` in the native path.
5. **DuckDB** — Mature read ceiling (deletion vectors, column mapping read, time travel). Write ceiling is very low: append-only, no constraint enforcement, no writer v3+ features, hard-blocked by UniForm on tables with `icebergWriterCompatV1`.
6. **ClickHouse** — Good read ceiling (column mapping name mode, CDF read, predicate/partition pushdown). Write is experimental, append-only, Azure-blocked.
7. **Daft** — Read ceiling limited by missing deletion vector and column mapping support. Write is constrained (no schema merge, no deletion vectors).
8. **PrestoDB** — Reads at protocol-compliant level via Delta Kernel, but deletion vectors are not applied — a correctness rather than an availability gap. Entirely read-only.
9. **Athena** — Native Delta read (no manifest needed, engine v3), but advanced v3 reader features unconfirmed. Entirely read-only.
10. **Flink** — Severely constrained by Delta Standalone's protocol (1,2) ceiling. Only append-write. Entirely blocked by deletionVectors, columnMapping, v2Checkpoint, and any writer v3+ feature. Maintenance mode; next-generation Kernel-based connector not yet shipped.
11. **ClickHouse (write) / PrestoDB / Athena / Flink (read-only or partial)** — see rankings above.

### Specific Cross-Engine Compatibility Risks

**Risk 1 — Spark writes a table with Deletion Vectors, then PrestoDB queries it**

Spark (Delta 2.3+) or Databricks Runtime 14+ performs a `DELETE` or `UPDATE` using deletion vectors (the default). The table's `readerFeatures` now lists `deletionVectors`. PrestoDB (delta-kernel-rs 3.3.2) resolves the correct file list but its `DeltaPageSourceProvider` reads Parquet files directly without calling `Scan.transformPhysicalData()`. Result: PrestoDB returns rows that were logically deleted by Spark. The data is silently stale/incorrect with no error or warning surfaced to the query user.

**Risk 2 — Databricks enables UniForm on a managed table, then DuckDB appends to it**

A Databricks-managed Delta table has `icebergCompatV2` and `icebergWriterCompatV1` enabled (automatic for Databricks Unity Catalog tables with UniForm). A DuckDB user runs `INSERT INTO` using the delta extension. DeltaKernel's write path rejects the commit because `icebergWriterCompatV1` is listed in `writerFeatures` and DuckDB does not recognise it. Result: DuckDB throws `Unsupported: Unknown feature 'icebergWriterCompatV1'` and the write is rejected entirely. Reads continue to work. This affects all DuckDB users inserting into Databricks-managed tables.

**Risk 3 — Databricks renames a column (column mapping), then Polars or Daft reads the table**

A Spark/Databricks job runs `ALTER TABLE ... RENAME COLUMN old_col TO new_col`. This enables `columnMapping` at the protocol level. Polars's native `scan_delta` raises `DeltaProtocolError` because `columnMapping` is not in its supported reader v3 feature allowlist. Daft raises an error similarly. Result: both engines are entirely unable to read the table. The failure is not a data-quality issue but a hard exception, and the fix (switch to PyArrow fallback in Polars, or wait for Daft issue #1955) requires a code change on the reader side.

**Risk 4 — Flink reads a table written with Spark DELETE using deletion vectors**

A Spark job runs `DELETE FROM table WHERE condition` with deletion vectors enabled (default in Delta 3+). The table's minimum reader version is now 3, writer version 7. The Flink Delta Standalone connector attempts to open the table and encounters a protocol version `(3, 7)` that it does not support (Standalone only handles `(1, 2)`). Result: Flink throws `InvalidProtocolVersionException` and the streaming job crashes. Restarting requires the Spark owner to disable deletion vectors for that table, which is an irreversible protocol downgrade constraint.

**Risk 5 — delta-rs writes a table with CDF enabled, then consumers expect change data**

A `write_deltalake()` or DataFusion `DeltaOps::write()` call writes to a table that has `delta.enableChangeDataFeed = true`. The write succeeds transactionally, but because delta-rs does not produce `AddCDCFile` actions (issue #2095), the `_change_data` directory is not updated. A downstream consumer reading CDF with `DeltaOps::load_cdf()` or `DeltaTable.load_cdf()` sees no change records for those writes. Result: CDF consumers silently miss row-level changes written by delta-rs engines (DataFusion, Polars, Daft), leading to incomplete change tracking or failed CDC pipelines.

---

## Source Notes

| Footnote | Cell | Source file | Detail |
|----------|------|-------------|--------|
| [^f1] | Reader v2/v3 — Flink ❌ | `12-engine-flink.md` | Delta Standalone only supports protocol (1,2); v3 tables throw `InvalidProtocolVersionException` |
| [^d1] | Reader v3 — DuckDB ⚠️ | `03-engine-duckdb.md` issue #182 | Tables using `V2Checkpoint` reader feature cause unsupported error |
| [^p1] | Reader v3 — Polars ⚠️ | `04-engine-polars.md` §Known Limitations #7 | Only `deletionVectors` is in the supported reader v3 feature allowlist |
| [^da1] | Reader v3 — Daft ⚠️ | `05-engine-daft.md` §Known Limitations #1 | `deletionVectors` raises `NotImplementedError`; bypass may return stale rows |
| [^ch1] | Reader v3 — ClickHouse ? | `13-engine-clickhouse.md` | delta-kernel-rs is default but full v3 feature coverage not documented |
| [^a1] | Reader v2/v3 — Athena ⚠️ | `09-ecosystem-landscape.md` | Native read engine v3, reader v1–v3 claimed; advanced v3 features not confirmed |
| [^dw1] | Writer v1-2 — DuckDB ⚠️ | `03-engine-duckdb.md` | Append-only; no constraint enforcement or overwrite |
| [^dw2] | Writer v3-6 — DuckDB ❌ | `03-engine-duckdb.md` | No support for writer v3+ protocol enforcement |
| [^chw1] | Writer v1-2 — ClickHouse ⚠️ | `13-engine-clickhouse.md` | Experimental write flag required; S3/GCS only; no Azure write |
| [^cm3] | columnMapping read — Polars ❌ | `04-engine-polars.md` §Known Limitations #7 | `DeltaProtocolError` raised for column mapping tables in native scan path |
| [^cm4] | columnMapping read — Daft ❌ | `05-engine-daft.md` issue #1955 | Tables with column mapping mode `name`/`id` cannot be read |
| [^cm6] | columnMapping read — PrestoDB ⚠️ | `11-engine-prestodb.md` | Logical schema resolved correctly; physical Parquet lookup in `id` mode unconfirmed |
| [^cm7] | columnMapping read — Flink ❌ | `12-engine-flink.md` | Standalone connector has no column mapping support |
| [^dv3] | deletionVectors read — Daft ❌ | `05-engine-daft.md` issue #1954 | `NotImplementedError`; bypass flag returns stale rows |
| [^dv4] | deletionVectors read — PrestoDB ❌ | `11-engine-prestodb.md` | `transformPhysicalData()` not called; deleted rows returned |
| [^dv5] | deletionVectors read — Flink ❌ | `12-engine-flink.md` issue #2874 | Protocol version exception prevents table opening |
| [^dv6] | deletionVectors read — ClickHouse ? | `13-engine-clickhouse.md` | delta-kernel-rs supports it upstream but ClickHouse docs don't confirm |
| [^v2c1] | v2Checkpoint — DuckDB ❌ | `03-engine-duckdb.md` issue #182 | Hard unsupported error on `V2Checkpoint` reader feature |
| [^v2c2] | v2Checkpoint — Polars ? | `04-engine-polars.md` | Not in supported reader v3 allowlist; likely `DeltaProtocolError` |
| [^v2c3] | v2Checkpoint — Trino ⚠️ | `10-engine-trino.md` | Read supported; write not supported |
| [^ic3] | icebergCompatV1/V2 — delta-rs ❌ | `14-uniform-interop.md` issue #3299 | Cannot set UniForm/IcebergCompat table properties |
| [^ic4] | icebergCompatV2 — DuckDB ❌ | `03-engine-duckdb.md` issue #289, `14-uniform-interop.md` | Write fails with `Unknown feature 'icebergWriterCompatV1'` |
| [^cdf1] | changeDataFeed — delta-rs ⚠️ | `06-engine-datafusion.md` issue #2095 | Reads CDF; does not produce CDF on write |
| [^cdf2] | changeDataFeed — Polars ⚠️ | `04-engine-polars.md` | Reads CDF via delta-rs; cannot produce CDF on write |
| [^cdf3] | changeDataFeed — DataFusion ⚠️ | `06-engine-datafusion.md` | Same as delta-rs |
| [^ict1] | inCommitTimestamp — Trino ⚠️ | `10-engine-trino.md` | Surfaces value in `$history`; write-side generation unconfirmed |
| [^catm2] | catalogManaged — DuckDB ⚠️ | `03-engine-duckdb.md` PR #291 | Read support added; writes blocked by `icebergWriterCompatV1` |
| [^catm3] | catalogManaged — Trino ❌ | `10-engine-trino.md` | No documented managed commits support |
| [^cl2] | clustering — Trino ⚠️ | `10-engine-trino.md` issue #22811 | Read supported (PR #22330); write not yet supported |
| [^tw1] | typeWidening — Trino ⚠️ | `10-engine-trino.md` | Read supported; write not supported |
| [^var1] | variantType — Spark ✅ | `07-engine-spark.md` | GA in Delta 4.0/Spark 4.0; no other engine confirmed |
