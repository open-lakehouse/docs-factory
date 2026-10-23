---
title: "Delta and Iceberg feature crosswalk"
summary: Internal record pairing each Delta table feature with its Apache Iceberg counterpart, and the compatibility journeys that test each side.
diataxis: reference
project: open-lakehouse
references:
  - deltaSpec
  - icebergSpec
  - icebergRestSpec
status: private
---

This page pairs what a Delta table feature does with how an Iceberg table does
the same thing, so pages that span both formats can say which engine handles
which side. It's private: the working record for the planned explanation
pages in this project and for the
[format compatibility plan][plan]. The support itself lives in two matrices,
never here. Delta features are rows of the Delta
[coverage record](../../../delta/reference/090-coverage/index.md#table-features-by-engine),
and Iceberg features are rows of the Unity Catalog
[clients and engines](../../../unitycatalog/reference/002-clients-and-engines/index.md#iceberg-tables-by-client)
tables, read through its Iceberg REST API. The journey ids name those rows.

## Features

| What it does | Delta feature (journeys) | Iceberg feature (journeys) | How they differ |
| --- | --- | --- | --- |
| Delete rows without rewriting files | `deletionVectors` (`deletion-vectors.*`) | v2 position deletes (`iceberg.merge-on-read`); v3 deletion vectors (`iceberg.v3-deletion-vectors`) | v3 writers must use deletion vectors instead of position delete files. Iceberg also has equality deletes (`iceberg.equality-deletes`), which Delta has no counterpart for. |
| Keep a column's identity across renames and drops | `columnMapping` (`column-mapping.*`) | Field ids, in every format version (`iceberg.schema-evolve`) | Delta opts in per table, by name or id; Iceberg always resolves columns by field id. |
| Give each row a stable id | `rowTracking` (`row-tracking.write`) | v3 row lineage (`iceberg.v3-row-lineage`) | |
| Change a column's type without rewriting | `typeWidening` (`type-widening.*`) | Type promotion (`iceberg.type-promotion`) | |
| Store semi-structured values | `variantType`, `variantShredding` (`variant.*`, `variant-shredding.*`) | v3 `variant` (`iceberg.v3-variant`) | |
| Store timestamps without a time zone | `timestampNtz` (`timestamp-ntz.*`) | `timestamp` (every version); v3 `timestamp_ns` (`iceberg.v3-timestamp-ns`) | Delta timestamps are microsecond only. |
| Fill omitted columns with a default | `allowColumnDefaults` (`column-defaults.write`) | v3 default values (`iceberg.v3-default-values`) | Iceberg also fills a default for rows written before the column existed. |
| Lay data out for pruning | `clustering`, partition columns (`clustering.write`) | Hidden partitioning, partition evolution, sort order (`iceberg.hidden-partitioning`, `iceberg.partition-evolve`, `iceberg.sort-order`) | Delta partitions by column value; Iceberg partitions by a transform and can change it later. |
| Commit through the catalog | `catalogManaged` (`managed.*`) | Every commit through an Iceberg REST catalog (`iceberg.append`) | |
| Read row changes | `changeDataFeed` (`change-data-feed.write`, `cdf.read`) | No change files in the spec; engines derive changes from snapshots | |
| Reject invalid rows | `checkConstraints`, `invariants` (`check-constraints.write`, `invariants.write`) | Required fields only | |
| Generate values | `generatedColumns`, `identityColumns` (`generated-columns.write`, `identity-columns.write`) | None | |
| Read an earlier state | Versions and timestamps (`read.version`, `read.timestamp`) | Snapshots (`iceberg.time-travel`), branches and tags (`iceberg.branch-tag`) | Delta has no branches; a shallow clone is the nearest equivalent. |
| Record commit time | `inCommitTimestamp` (`in-commit-timestamp.write`) | Each snapshot's `timestamp-ms` | |
| Store geospatial values | None | v3 geometry and geography (`iceberg.v3-geo`) | |
| Read one format as the other | `icebergCompatV1`, `icebergCompatV2` (UniForm: `iceberg-compat-v2.write`) | Delta tables read through Iceberg REST (`iceberg.read-uniform`) | |

[plan]: https://github.com/open-lakehouse/docs-factory/blob/main/docs/design/format-compatibility-plan.md
