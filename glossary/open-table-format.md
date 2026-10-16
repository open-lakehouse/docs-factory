---
title: What is an open table format?
slug: /glossary/open-table-format
meta_description: An open table format is an open specification for a metadata layer that turns data files in object storage into a table with ACID transactions, schema evolution, and time travel.
target: databricks.com/glossary
source: content/open-lakehouse/explanation/003-open-table-format.md
status: draft
---

# What is an open table format?

An open table format is an open specification for a metadata layer that
organizes a collection of data files in cloud object storage into a single
logical table. That metadata layer adds the guarantees people expect from a
database: ACID transactions, schema evolution, and queries against earlier
versions of the table, known as time travel.

Open table formats sit above open file formats such as Apache Parquet and below
the query engines and data catalogs that read and write the data. The most
widely used are Delta Lake, Apache Iceberg, and Apache Hudi, with Apache Paimon
as a more recent entrant. They are the storage foundation of the
[data lakehouse](https://www.databricks.com/glossary/data-lakehouse)
architecture.

## Why do open table formats exist?

A [data lake](https://www.databricks.com/glossary/data-lake) stores data as
files in object storage, usually in a columnar format such as
[Parquet](https://www.databricks.com/glossary/what-is-parquet) or ORC. Object
storage is cheap and scales almost without limit, which is why it became the
default place to keep large volumes of data.

Files alone don't make a table, though. Early data lakes defined a table by
convention: a Hive table was a directory, and its contents were whatever files
happened to be in it. That convention caused familiar problems:

- **No atomic writes.** A job that failed halfway left partial files behind,
  and readers saw them.
- **Unsafe concurrent access.** A query running during a write could see some
  of the new files and not others.
- **Expensive updates and deletes.** Changing a few rows meant rewriting whole
  files or partitions by hand.
- **Fragile schemas.** Changing a column meant hoping every reader and writer
  agreed on the new layout.
- **Slow planning.** Engines had to list directories to find out what a table
  contained, which is slow on object storage.

Teams that needed reliability copied their data into a data warehouse, which
meant two systems, two copies, and pipelines to keep them in sync. Open table
formats emerged between roughly 2016 and 2020 to bring warehouse reliability
directly to the data lake, so the same files can serve BI, data engineering,
and machine learning.

## What is the difference between a file format and a table format?

A **file format** decides how the bytes of one file are laid out: columns,
encodings, compression, and statistics. Parquet is a file format. It says
nothing about which files make up a table or what happens when two writers
change that table at the same time.

A **table format** answers those questions. It keeps metadata that records
exactly which files belong to each version of a table, along with that
version's schema and partitioning. Object storage holds the bytes, the file
format encodes each file, and the table format decides which files form the
table.

| Layer | Answers | Examples |
| --- | --- | --- |
| Object storage | Where are the bytes kept? | Amazon S3, Azure Data Lake Storage, Google Cloud Storage |
| File format | How is each file encoded? | Apache Parquet, ORC, Avro |
| Table format | Which files make up the table, and which version is current? | Delta Lake, Apache Iceberg, Apache Hudi |
| Catalog | What tables exist, and who may access them? | Unity Catalog, Iceberg REST catalogs |

## How does an open table format work?

The formats differ in detail, but they share one model. Each committed version
of a table is a *snapshot*, and the metadata maps every snapshot to its list of
data files and its schema.

- **Reading** resolves the current snapshot to its file list and reads only
  those files. Files from a commit that hasn't finished aren't in the list, so
  readers never see partial results.
- **Writing** produces new data files first, then commits new metadata that
  points to them in a single atomic step. If two writers race, one commit
  succeeds and the other retries against the new version.
- **Older snapshots** remain readable until they're cleaned up, which enables
  time travel, rollback, and auditing. Comparing two snapshots tells an
  incremental job exactly what changed.
- **Schema and partitioning** live in the metadata, so they can evolve without
  rewriting existing files.
- **File statistics** such as per-column minimum and maximum values are kept in
  the metadata, so engines can skip files that can't match a query without
  opening them.

Something has to make each commit atomic. Often that's the storage system,
through an atomic "put if absent" or rename operation. Increasingly, it's the
catalog: when the catalog accepts commits, it becomes the table's source of
truth and can enforce rules and coordinate changes that storage alone can't.

## What are the key features of open table formats?

- **ACID transactions** — every change commits completely or not at all, and
  readers always see a consistent version.
- **Schema enforcement and evolution** — writes that don't match the schema are
  rejected, and columns can be added, renamed, or widened safely.
- **Time travel** — query a table as of an earlier version or timestamp, for
  audits, reproducible ML training, or recovering from a bad write.
- **Row-level updates, deletes, and merges** — change individual rows without
  rewriting whole partitions, often using deletion vectors that mark rows as
  removed instead of rewriting the data file.
- **Partition evolution and data layout** — change how a table is partitioned or
  clustered as query patterns change.
- **Incremental processing** — read only the changes since the last run, for
  efficient streaming and change data capture.
- **Engine independence** — because the specification is open, many engines can
  read and write the same table.

## What are the major open table formats?

### Delta Lake

Delta Lake was created at Databricks and released as open source in 2019; it is
now a Linux Foundation project. A Delta table is a directory of Parquet data
files plus a transaction log, the `_delta_log` folder. Each commit adds an entry
to the log recording which files were added or removed, and readers rebuild the
table state from the latest checkpoint and the entries after it. Spark, Flink,
Trino, DuckDB, Polars, and the Rust and Python `deltalake` libraries all read
Delta tables.

### Apache Iceberg

Apache Iceberg was started at Netflix in 2017 and became a top-level Apache
Software Foundation project in 2020. An Iceberg table keeps a tree of metadata
files: a table metadata file points to the current snapshot, the snapshot points
to a manifest list, and manifests list the data files. Iceberg is known for
hidden partitioning, where readers filter on ordinary columns and the format
maps the filter to partitions, and for changing a table's partitioning without
rewriting data. The Iceberg REST catalog specification defines how engines talk
to an Iceberg catalog.

### Apache Hudi

Apache Hudi (Hadoop Upserts Deletes and Incrementals) originated at Uber around
2016 to support frequent row-level upserts and incremental ingestion. It is now
an Apache Software Foundation project.

### Apache Paimon and newer formats

Apache Paimon began as Flink Table Store and entered the Apache incubator in
2023; it is designed for streaming writes. Formats aimed at AI workloads are
also appearing: Lance, for example, pairs its own columnar file format with a
table specification aimed at vector search and random access.

## Are open table formats compatible with each other?

Increasingly, yes. Several formats coexist, and the industry has moved from
competition toward convergence, most visibly between Delta Lake and Iceberg.

- **A shared data layer.** With version 3 of the Iceberg specification, Delta
  Lake and Iceberg use interchangeable Parquet data files and deletion vectors,
  so the same data files can serve both formats without conversion.
- **Converging metadata.** Proposals under community review for Iceberg
  version 4 would restructure Iceberg's metadata into a tree that makes
  frequent small commits cheaper, and a matching Delta Lake proposal would adopt
  that structure as Delta's native metadata. These are proposals, not shipped
  features.
- **Translation where formats differ.** Delta Lake UniForm writes Iceberg
  metadata for a Delta table over the same data files, so Iceberg clients can
  read it. Apache XTable translates metadata among Delta Lake, Iceberg, and Hudi.

The practical result is that choosing a table format no longer has to lock data
into one ecosystem.

## Open table formats and data catalogs

A table format describes a single table. A catalog tracks which tables exist,
where they live, and who may access them. Engines resolve a table name through
the catalog before reading any data, so the catalog is where governance
applies: permissions, auditing, lineage, and short-lived storage credentials
issued for exactly the data a query needs.

Open catalog interfaces matter for the same reason open table formats do. The
Unity Catalog API and the Iceberg REST catalog specification let many engines
discover and access the same governed tables.

## Open table formats on Databricks

Databricks is built on open table formats and supports both Delta Lake and
Apache Iceberg, governed by Unity Catalog:

- **Delta Lake** is the default table format on Databricks and powers features
  such as liquid clustering, predictive optimization, and change data feed.
- **Managed Iceberg tables** can be created, read, written, optimized, governed,
  and shared directly in Unity Catalog.
- **Foreign Iceberg tables** managed in external catalogs can be registered,
  governed, and queried through Unity Catalog.
- **Iceberg v3** features, including deletion vectors, row tracking, and the
  VARIANT type, are supported across managed, foreign, and UniForm-enabled
  tables.
- **UniForm** lets Iceberg clients read Delta tables without copying data.
- **The Iceberg REST catalog interface** in Unity Catalog lets external engines
  such as Spark, Trino, Flink, DuckDB, and Snowflake access Unity Catalog tables
  with vended, scoped credentials.

Because every table is governed in one catalog, the same access controls,
lineage, and auditing apply whichever format a table uses and whichever engine
reads it.

## Additional resources

- [Delta Lake documentation](https://docs.delta.io/)
- [Apache Iceberg documentation](https://iceberg.apache.org/docs/latest/)
- [Unity Catalog open source project](https://www.unitycatalog.io/)
- [Unity Catalog and the next era of Apache Iceberg](https://www.databricks.com/blog/unity-catalog-and-next-era-apache-icebergtm)
- [What is a data lakehouse?](https://www.databricks.com/glossary/data-lakehouse)
- [What is Parquet?](https://www.databricks.com/glossary/what-is-parquet)

## Frequently asked questions

### Is Delta Lake an open table format?

Yes. Delta Lake is an open source table format with a published protocol,
governed by the Linux Foundation. Many engines outside Databricks read and write
Delta tables.

### Is Parquet a table format?

No. Parquet is a file format: it defines how data is encoded inside a single
file. Table formats such as Delta Lake and Iceberg store their data in Parquet
files and add the metadata that turns those files into a table.

### What is the difference between Delta Lake and Apache Iceberg?

Both add ACID transactions, schema evolution, and time travel on top of Parquet
files. They differ mainly in how they store metadata: Delta Lake uses a
transaction log, and Iceberg uses a tree of metadata and manifest files. Since
Iceberg version 3 they share the same data file and deletion vector layout, and
tools such as UniForm let one table be read as both.

### Do I need a catalog to use an open table format?

Not strictly. Some engines can read a table directly from its storage path. A
catalog adds discovery, access control, auditing, and credential management,
and some features, such as catalog-managed commits, require one.

### Can multiple engines write to the same table?

Yes. Open table formats are designed for concurrent writers: each commit is
atomic, and a writer whose commit conflicts with another retries against the
new version. Routing commits through a catalog makes this coordination more
robust across engines.

### What is time travel in a table format?

Time travel is the ability to query a table as it was at an earlier version or
point in time. It works because the table format keeps older snapshots until
they are explicitly cleaned up.
