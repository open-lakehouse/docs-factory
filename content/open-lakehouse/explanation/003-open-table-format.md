---

title: Open table format
summary: The metadata layer that turns a directory of data files in object storage into a transactional table.
diataxis: explanation
project: open-lakehouse
status: draft
explains: lakehouse.tableFormat
references:

- deltaSpec
- icebergSpec
- parquetSpec
- lakehouse.fileFormat
- lakehouse.objectStorage

---

An open table format is an open specification for a metadata layer that turns
a collection of [data files](model:lakehouse.fileFormat) in
[object storage](model:lakehouse.objectStorage) into one logical table. That
layer adds the guarantees people expect from a database: ACID transactions,
schema evolution, and queries against earlier versions of the table (time
travel). It sits above file formats such as [Apache Parquet](model:parquetSpec)
and below the query engines and the [catalog](./catalog.md) that read and write
the data.

## File format and table format

A file format decides how the bytes of a single file are laid out: columns,
encodings, compression, statistics. It says nothing about which files make up a
table, and nothing about what happens when two writers change that table at the
same time.

Before table formats, data lakes answered those questions by convention. A Hive
table was a directory, and its contents were whatever files happened to be in
it. Updating rows meant rewriting files in place, changing the schema meant
hoping every reader agreed on the new one, and a query that ran during a write
could see half of it.

A table format moves the answer out of the directory listing and into metadata.
The metadata records exactly which files belong to each version of the table,
so the storage system holds the bytes and the table format decides what those
bytes mean.

## How a table format works

The formats differ in detail, but they share one model. Each committed version
of a table is a *snapshot*, and the metadata maps every snapshot to its list of
data files and its schema.

- **Reading** resolves the current snapshot to its file list and reads only
those files. Files written by an unfinished commit aren't in the list, so the
reader never sees them.
- **Writing** produces new data files first, then commits new metadata that
points to them in a single atomic step. If two writers race, one commit lands
and the other has to retry against the new version.
- **Older snapshots** stay readable until they're cleaned up. That gives time
travel and rollback, and comparing two snapshots tells an incremental job what
changed between them.
- **Schema and partitioning** live in the metadata, so they can change without
rewriting the files already written.

Something has to make that commit atomic. Often it's the storage system, through
an atomic put-if-absent or rename. It can also be the catalog: in a
[catalog-managed table](../../unitycatalog/explanation/external-and-managed-tables/index.md)
the catalog accepts each commit and becomes the table's source of truth.

## The formats

[Delta Lake](model:deltaSpec) keeps a transaction log beside the Parquet data
files. Each commit adds an entry to the log that records which files were added
or removed, and readers rebuild the table state by replaying the log from the
latest checkpoint. See [What is Delta Lake?](../../delta/explanation/what-is-delta-lake.md).

[Apache Iceberg](model:icebergSpec) keeps a tree of metadata files. A table
metadata file points to the current snapshot, the snapshot points to manifest
lists, and those point to manifests that list the data files. Iceberg is known
for hidden partitioning, where readers filter on columns and the format maps
the filter to partitions, and for changing a table's partitioning without
rewriting its data.

Other formats target narrower workloads. [Apache Hudi](https://hudi.apache.org/)
was built for frequent row-level upserts and incremental ingestion.
[Apache Paimon](https://paimon.apache.org/), which began as Flink Table Store, is
designed for streaming writes. [Lance](https://lancedb.github.io/lance/format/)
pairs its own columnar file format with a table specification aimed at vector
search and random access to machine-learning data.

## Why open matters

Because the specification and the data are both open, a table written by one
engine can be read and written by another, and nobody has to copy the data into
a proprietary store first. The catch is that several formats coexist, so the
formats have been moving closer together.

Delta Lake and Iceberg already share their data layer. With version 3 of the
Iceberg specification, Parquet data files and deletion vectors (side files that
mark rows as deleted without rewriting the data file) are interchangeable
between the two formats without conversion. Their metadata layers are still
separate.

Proposals under community review would close that gap. Iceberg's proposed
version 4 restructures table metadata into an
[adaptive metadata tree](https://github.com/apache/iceberg/issues/16694) that
makes frequent small commits cheaper, and a
[Delta Lake protocol RFC](https://github.com/delta-io/delta/issues/6640) would
adopt that tree as Delta's native metadata format.