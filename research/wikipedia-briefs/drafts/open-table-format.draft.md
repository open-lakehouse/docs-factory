# Open table format

> **Markdown rendering** of the Wikipedia draft
> [`open-table-format.draft.wiki`](./open-table-format.draft.wiki), for easy
> sharing/review. The wikitext file is the source of truth; this copy converts
> wikilinks to plain text, `<ref>` tags to numbered footnotes, and drops
> Wikipedia templates. Scope: publishable baseline (lead + core sections);
> deeper sections deferred.

**Short description:** Open specification for a metadata layer that turns files
in object storage into a database-like table.

---

An **open table format** is an open specification for a metadata layer that
organizes a collection of data files in object storage into a single logical
table, adding database-like guarantees such as ACID transactions, schema
evolution, and point-in-time ("time travel") queries. Open table formats sit
above open file formats such as Apache Parquet and below the query engines and
data catalogs that read and write the data, and they are a foundational storage
layer of the data lakehouse architecture.[^isurvey]

The most widely used open table formats are Delta Lake, Apache Iceberg, and
Apache Hudi, together with the more recent Apache Paimon. They emerged between
roughly 2016 and 2020 to bring the reliability and management features of a data
warehouse to the low-cost, open storage of a data lake.[^isurvey][^cidr2023]

## Concept and motivation

A data lake stores data as files in object storage, typically in open columnar
formats such as Apache Parquet or ORC. A file format defines how the bytes of an
individual file are laid out, but it does not define which files make up a table,
nor does it coordinate concurrent readers and writers. Early conventions such as
Apache Hive tables tracked table membership through directory layout, which made
operations like updating rows, changing a table's schema, or reading a table
while it was being written unreliable.[^cidr2023]

An open table format addresses this by maintaining a separate metadata layer that
records the exact set of files belonging to each version of a table. This lets
engines commit changes atomically and read a consistent view of the table while
it is being written. It also lets a table's schema and partitioning change over
time without rewriting existing data. Because the specification and the data are
both open, multiple independent engines can read and write the same
table.[^isurvey][^cidr2023]

## How they work

Although the formats differ in detail, they share a common model: a metadata
layer tracks which data files constitute each committed version, or *snapshot*,
of a table. Reading a table means resolving the current snapshot to a list of
files; writing means producing new data files and then atomically committing new
metadata that points to them. Retaining older snapshots enables time-travel
queries and rollback, and comparing snapshots supports incremental
processing.[^cidr2023][^isurvey]

## Major formats

**Delta Lake** was developed at Databricks and released as open source in 2019;
it was later contributed to the Linux Foundation. It stores table metadata in a
transaction log kept alongside the Parquet data files.[^tc2019]

**Apache Iceberg** was started at Netflix by Ryan Blue and Dan Weeks in 2017 and
became a top-level Apache Software Foundation project in 2020. It is known for
hidden partitioning and schema and partition evolution that do not require
rewriting existing data.[^icebergasf][^icebergincubator]

**Apache Hudi** (from "Hadoop Upserts Deletes and Incrementals") originated at
Uber around 2016 to support efficient row-level upserts and incremental data
ingestion, and later became an Apache Software Foundation project.[^uberhudi]
**Apache Paimon** began as Flink Table Store within the Apache Flink project and
entered the Apache incubator in 2023, where it was renamed; it is designed as a
streaming-first lake format.[^paimonflink] Newer entrants target machine-learning
and multimodal data; for example, Lance, introduced in 2022 and developed by the
company LanceDB, is oriented toward vector search and random-access workloads and
includes its own table-format specification alongside a columnar file
format.[^dremiolance][^lancedocs]

## Interoperability

Because several formats coexist, interoperability between them has become an
active area of development. By the mid-2020s, reporting on Delta Lake and Iceberg
described the two formats as converging rather than competing.[^regcollide] One
marker of that convergence was Databricks' 2024 acquisition of Tabular, a company
founded by Iceberg's original creators, after which Databricks said it aimed to
move the two formats toward a common standard.[^cnbctabular]

### Format-level convergence

Convergence has occurred at the level of the on-disk format itself, most visibly
between Iceberg and Delta Lake. With version 3 of the Iceberg specification, the
two formats aligned their data layer: Parquet data files and deletion vectors
(side files that mark deleted rows without rewriting data) became interchangeable
between them without conversion. Their metadata layers, however, remained
separate.[^delta6640]

More recent proposals, still unratified as of 2026, would align the metadata
layer too. Apache Iceberg's proposed version 4 adds an "adaptive metadata tree"
that restructures table metadata to make frequent, small commits
cheaper.[^iceberg16694] A corresponding proposal in the Delta Lake project would
adopt the Iceberg v4 metadata tree as Delta's native metadata format, which its
authors describe as work done "collaborating with the Iceberg community." Both
remain proposals under community review rather than shipped features.[^delta6640]

### Translation tools

Where the formats have not converged, translation tools bridge them. Databricks'
UniForm, introduced with Delta Lake 3.0 in 2023, lets a Delta table also expose
Iceberg- and Hudi-compatible metadata over a single copy of the data, and Apache
XTable (formerly OneTable) translates table metadata among the three formats
without rewriting the underlying data files.[^siunif]

## See also

- Data lakehouse
- Data lake
- Apache Parquet
- Delta Lake
- Apache Iceberg

## References

[^isurvey]: "Data Lakehouse: A survey and experimental study," *Information Systems*, vol. 127, 2024. doi:10.1016/j.is.2024.102460
[^cidr2023]: "Analyzing and Comparing Lakehouse Storage Systems," Conference on Innovative Data Systems Research (CIDR), 2023. <https://www.cidrdb.org/cidr2023/papers/p92-jain.pdf>
[^tc2019]: Frederic Lardinois, "Databricks brings its Delta Lake open source project to the Linux Foundation," *TechCrunch*, 2019-10-15. <https://techcrunch.com/2019/10/15/databricks-brings-its-delta-lake-open-source-project-to-the-linux-foundation/>
[^icebergasf]: "Apache Iceberg," Apache Software Foundation. <https://iceberg.apache.org/>
[^icebergincubator]: "Apache Iceberg — Project Incubation Status," Apache Software Foundation. <https://incubator.apache.org/projects/iceberg.html>
[^cnbctabular]: "Databricks is buying data optimization startup Tabular," *CNBC*, 2024-06-04. <https://www.cnbc.com/2024/06/04/databricks-is-buying-data-optimization-startup-tabular.html>
[^uberhudi]: "Apache Hudi at Uber: Engineering for Trillion-Record-Scale Data Lake Operations," Uber Engineering Blog. <https://www.uber.com/en-US/blog/apache-hudi-at-uber/>
[^paimonflink]: "What is Paimon (incubating) (formerly Flink Table Store)?," Apache Software Foundation. <https://flink.apache.org/what-is-flink-table-store/>
[^dremiolance]: "Exploring the Evolving File Format Landscape in the AI Era: Parquet, Lance, Nimble and Vortex," Dremio. <https://www.dremio.com/blog/exploring-the-evolving-file-format-landscape-in-ai-era-parquet-lance-nimble-and-vortex-and-what-it-means-for-apache-iceberg/>
[^lancedocs]: "Lance format," LanceDB. <https://lancedb.github.io/lance/format/>
[^regcollide]: Lindsay Clark, "Delta Lake and Iceberg communities collide – in a good way," *The Register*, 2025-04-15. <https://www.theregister.com/2025/04/15/iceberg_delta_lake_collab/>
[^delta6640]: "[PROTOCOL RFC] Adopt the Iceberg v4 manifest tree as Delta's native content metadata format," delta-io/delta issue #6640, Linux Foundation. <https://github.com/delta-io/delta/issues/6640>
[^iceberg16694]: "v4: add manifest write support," apache/iceberg issue #16694, Apache Software Foundation. <https://github.com/apache/iceberg/issues/16694>
[^siunif]: "Databricks' Delta Lake 3.0 bridges compatibility gaps with Apache Iceberg and Hudi," SiliconANGLE, 2023-06-28. <https://siliconangle.com/2023/06/28/databricks-delta-lake-3-0-bridges-compatibility-gaps-apache-iceberg-hudi/>
