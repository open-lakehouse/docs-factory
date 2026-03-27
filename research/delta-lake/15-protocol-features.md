# Delta Protocol Spec Feature Reference

## Summary

The Delta Transaction Log Protocol defines how ACID properties are implemented for large collections of data stored as files in distributed file systems or object stores. The protocol uses a versioning model with two independent version numbers — reader version and writer version — that control which capabilities a client must implement to correctly read or write a given table. Starting at reader version 3 and writer version 7, the protocol introduces a table features system that replaces coarse version bumps with a fine-grained, named feature registry, allowing tables to selectively advertise exactly which capabilities are required.

---

## Protocol Version Reference

### Reader Protocol Versions

| Version | Capabilities unlocked | Backwards-compatible? |
|---------|----------------------|----------------------|
| 1 | Baseline: read Delta tables using the transaction log, data files, and standard partition conventions | Yes (baseline) |
| 2 | Support for Column Mapping (`delta.columnMapping.mode`); readers must interpret physical column names and IDs rather than logical names | Yes — readers supporting v2 can still read v1 tables |
| 3 | Table Features for readers: `readerFeatures` array is added to the protocol action; readers must implement every feature listed there. Writer Version must be 7 when Reader Version is 3 | Yes — but the reader must also support all listed reader features |

### Writer Protocol Versions

| Version | Capabilities unlocked | Backwards-compatible? |
|---------|----------------------|----------------------|
| 1 | Baseline: write Delta commit log entries, data files, and checkpoints | Yes (baseline) |
| 2 | Must respect Append-only Tables (`delta.appendOnly`) and Column Invariants (`delta.invariants` expressions in column metadata) | Yes — v2 writers can write v1 tables |
| 3 | Must enforce `delta.checkpoint.writeStatsAsJson` and `delta.checkpoint.writeStatsAsStruct` configuration flags; must respect CHECK Constraints | Yes — cumulative with v2 |
| 4 | Must respect Change Data Feed (`delta.enableChangeDataFeed`) and Generated Columns (`delta.generationExpression`) | Yes — cumulative with v3 |
| 5 | Must respect Column Mapping | Yes — cumulative with v4 |
| 6 | Must respect Identity Columns | Yes — cumulative with v5 |
| 7 | Table Features for writers: `writerFeatures` array is added to the protocol action; writers must implement every feature listed there. Replaces further version bumps with named feature additions | Yes — cumulative with v6, but feature list must be checked per-table |

---

## Table Feature Reference

| Feature name | Reader/Writer/Both | Min protocol version (reader/writer) | Description | Opt-in or automatic |
|-------------|-------------------|-------------------------------------|-------------|---------------------|
| `columnMapping` | Both | Reader 2 or 3 / Writer 5, 6, or 7 | Assigns physical names and integer IDs to columns, enabling column renaming and dropping without rewriting data files; governed by `delta.columnMapping.mode` table property | Opt-in — must set `delta.columnMapping.mode` to `id` or `name` |
| `deletionVectors` | Both | Reader 3 / Writer 7 | Allows rows to be soft-deleted by recording their positions in a separate deletion vector file rather than rewriting data files | Opt-in — feature must be listed in `readerFeatures` and `writerFeatures` |
| `invariants` | Writer only | Reader 1 / Writer 2 (automatic); Writer 7 (feature-gated) | Enforces SQL boolean expressions stored in column metadata (`delta.invariants`) to validate rows on every write | Automatic for writer versions 2–6; opt-in (feature name required) for writer version 7 |
| `appendOnly` | Writer only | Reader 1 / Writer 2 (automatic); Writer 7 (feature-gated) | Prevents any commit from changing or removing existing data when `delta.appendOnly` table property is `true` | Opt-in — must set `delta.appendOnly = true`; feature name required in `writerFeatures` for writer version 7 |
| `checkConstraints` | Writer only | Reader 1 / Writer 3 (automatic); Writer 7 (feature-gated) | Enforces named SQL boolean CHECK constraints stored in table configuration (`delta.constraints.<name>`) on every write | Opt-in — must define at least one constraint; feature name required in `writerFeatures` for writer version 7 |
| `generatedColumns` | Writer only | Reader 1 / Writer 4 (automatic); Writer 7 (feature-gated) | Computes column values automatically from a SQL generation expression (`delta.generationExpression`) stored in column metadata | Opt-in — must define a generated column; feature name required in `writerFeatures` for writer version 7 |
| `allowColumnDefaults` | Writer only | Reader 1 / Writer 7 | Enables SQL DEFAULT expressions for columns, causing writers to substitute the default value when no explicit value is provided | Opt-in — must set `CURRENT_DEFAULT` in column metadata and list feature in `writerFeatures` |
| `changeDataFeed` | Writer only | Reader 1 / Writer 4 (automatic); Writer 7 (feature-gated) | Requires writers to produce `AddCDCFile` actions capturing row-level changes (inserts, updates, deletes) when `delta.enableChangeDataFeed` is `true` | Opt-in — must set `delta.enableChangeDataFeed = true`; feature name required in `writerFeatures` for writer version 7 |
| `typeWidening` | Both | Reader 3 / Writer 7 | Allows the type of an existing column or field to be widened (e.g., `Int` → `Long`, `Float` → `Double`) without rewriting data; type change history recorded in column metadata | Opt-in — must set `delta.enableTypeWidening = true` in table metadata |
| `v2Checkpoint` | Both | Reader 3 / Writer 7 | Enables V2-spec checkpoints, which may use UUID-named files and sidecar files for scalable checkpoint storage; prohibits multi-part checkpoints | Opt-in — feature must be listed in both `readerFeatures` and `writerFeatures` |
| `rowTracking` | Writer only | Reader 1 / Writer 7 | Assigns stable Row IDs and Row Commit Versions to every row, enabling reliable row-level lineage across table versions; requires `domainMetadata` feature | Opt-in — must set `delta.enableRowTracking = true`; requires `domainMetadata` in `writerFeatures` |
| `domainMetadata` | Writer only | Reader 1 / Writer 7 | Introduces named metadata domain actions (`domainMetadata`) for storing arbitrary key-value configuration associated with a domain; used internally by `rowTracking` and `clustering` | Opt-in — feature must be listed in `writerFeatures`; readers may ignore unless a specific reader-writer feature requires it |
| `icebergCompatV1` | Writer only | Reader 2 or 3 / Writer 7 | Ensures Delta tables conform to constraints required for conversion to Apache Iceberg format (V1); requires column mapping and prohibits deletion vectors | Opt-in — must set `delta.enableIcebergCompatV1 = true`; requires `columnMapping` |
| `icebergCompatV2` | Writer only | Reader 2 or 3 / Writer 7 | Extends Iceberg compatibility constraints for Iceberg V2 format conversion, including nested field IDs, int64 timestamps, and an allowed type list; supersedes V1 | Opt-in — must set `delta.enableIcebergCompatV2 = true`; requires `columnMapping`; mutually exclusive with active `icebergCompatV1` |
| `vacuumProtocolCheck` | Both | Reader 3 / Writer 7 | Requires VACUUM operations to check both reader and writer protocol versions (not just reader), preventing older VACUUM implementations from accidentally deleting files referenced by writer-only features | Opt-in — feature must be listed in both `readerFeatures` and `writerFeatures` |
| `inCommitTimestamp` | Writer only | Reader 1 / Writer 7 | Stores a monotonically increasing `inCommitTimestamp` in every commit's `commitInfo` action, providing stable commit timestamps independent of filesystem clock skew; required by `catalogManaged` | Opt-in — must set `delta.enableInCommitTimestamps = true` |
| `catalogManaged` | Both | Reader 3 / Writer 7 | Delegates commit coordination to an external catalog (rather than direct filesystem writes), enabling catalog-level concurrency control and commit ratification; requires `inCommitTimestamp` | Opt-in — feature must be listed in both `readerFeatures` and `writerFeatures`; catalog infrastructure required |
| `clustering` | Writer only | Reader 1 / Writer 7 | Enables physical clustering of rows by a set of clustering columns for improved data skipping performance; clustering column names are tracked via `domainMetadata`; requires `domainMetadata` feature | Opt-in — feature must be listed in `writerFeatures` at table creation or after (table must not be partitioned); clustering is triggered by explicit clustering operations |

**Note on `managedCommits`:** The task specification uses the name `managedCommits`; the current Delta Protocol spec uses the feature name `catalogManaged` (introduced for catalog-managed tables). There is no feature named `managedCommits` in the spec as of the current PROTOCOL.md. The row above for `catalogManaged` covers this intent.

**Note on `clusteringColumns`:** The task specification uses the name `clusteringColumns`; the current Delta Protocol spec uses the feature name `clustering`. The row above for `clustering` covers this intent.

---

## Notes on Deprecations or Experimental Features

- **`icebergCompatV1`**: The spec does not formally deprecate `icebergCompatV1`, but writer requirements for `icebergCompatV2` explicitly state that `icebergCompatV1` must not be active simultaneously. In practice, `icebergCompatV2` supersedes V1.
- **`variantShredding`**: The spec mentions that a `variantShredding` feature will be introduced separately to extend the `variantType` feature. It does not yet appear in the feature name table and is not listed as active.
- **Multi-part checkpoints**: The spec notes that multi-part checkpoints have known problems and are prohibited when `v2Checkpoint` is enabled. They are considered legacy and discouraged.
- **Writer Version 1**: There is no row for Writer Version 1 in the spec's Writer Version Requirements table; version 1 is implied as the unversioned baseline (no additional requirements beyond basic log writing).
- **Reader Version 1**: Similarly, Reader Version 1 is the baseline with no additional requirements listed in the spec's Reader Version Requirements table.
- **`identityColumns`**: This writer-only feature (supported natively at Writer Version 6, or via feature name at Writer Version 7) is present in the valid feature name appendix but was not included in the task's required feature list. It is included in the spec's appendix table for completeness.
- **`timestampNtz`**: This reader-writer feature (Reader 3 / Writer 7) enabling `TimestampNtz` columns is present in the spec's appendix table but was not included in the task's required feature list.

---

## Source

- Delta Protocol spec: https://github.com/delta-io/delta/blob/master/PROTOCOL.md
