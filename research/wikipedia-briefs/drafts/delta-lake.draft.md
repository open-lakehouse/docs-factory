# Delta Lake

> **Markdown rendering** of the Wikipedia draft
> [`delta-lake.draft.wiki`](./delta-lake.draft.wiki), for easy sharing/review.
> The wikitext file is the source of truth; this copy converts wikilinks to plain
> text, `<ref>` tags to numbered footnotes, and Wikipedia templates (infobox,
> short description) to a readable box. Target article title: *Delta Lake
> (software)*. Scope: publishable baseline (lead + core sections); deeper sections
> deferred.

**Short description:** Open-source storage framework and table format for data
lakes.

| | |
|---|---|
| **Developer** | Databricks; Linux Foundation |
| **Initial release** | April 2019 |
| **Repository** | github.com/delta-io/delta |
| **Written in** | Scala, Java, Rust, Python |
| **License** | Apache License 2.0 |
| **Type** | Open table format, data storage |

---

**Delta Lake** is an open-source open table format and storage framework for data
lakes. It adds ACID transactions, schema enforcement and evolution, and
point-in-time ("time travel") queries to data stored as Apache Parquet files in
object storage, and it is one of the storage layers used to build a data
lakehouse architecture.[^ibm] Its central mechanism is an ordered transaction
log, stored alongside the data files, that records every change to a table as an
atomic commit.[^vldb2020]

Delta Lake was developed at Databricks and released as open source in 2019. Later
that year it was contributed to the Linux Foundation under an open governance
model, and in 2022 the remaining Databricks-only features were also released as
open source.[^tc2019][^iw2022]

## History

Delta Lake originated at Databricks. According to the Linux Foundation, the
project was launched in October 2017; it was announced publicly and released as
open source in 2019.[^lfpress] On October 16, 2019, the Linux Foundation
announced it would host the project under an open governance
model.[^lfpress][^tc2019]

In June 2022, Databricks released the remaining Databricks-only Delta Lake
features as open source in Delta Lake 2.0, including performance features such as
data skipping via Z-ordering and Change Data Feed.[^iw2022] Later releases added
a table-features mechanism for enabling individual protocol capabilities, and the
UniForm interoperability feature (2023).[^tablefeatures]

## Architecture

A Delta Lake table consists of Parquet data files together with a transaction
log, conventionally stored in a `_delta_log` directory. Each change to the table,
such as adding or removing files or changing the schema, is recorded as an atomic
commit in the log. Reading a table means reconstructing its current state by
replaying the log; because each commit is versioned, an engine can also read an
earlier version of the table, which supports time-travel queries and
rollback.[^vldb2020]

The log design lets multiple readers and writers operate on the same table while
seeing a consistent view, and it enforces the table's declared schema on writes.
The 2020 paper describing Delta Lake reported that this approach improved
performance and manageability compared with storing raw files directly, using the
log to enable optimizations such as data skipping.[^vldb2020] The log protocol is
published as an open specification.[^protocol]

## Governance and ecosystem

Delta Lake is a project of the Linux Foundation and is licensed under the Apache
License 2.0. Its reference implementation is developed in the public
`delta-io/delta` repository and integrates with Apache Spark and other JVM engines
including Trino, PrestoDB, Apache Flink, and Apache Hive.[^protocol][^ibm]

Beyond the JVM, a native Rust library, `delta-rs`, provides access to Delta tables
without Spark. It is built on Apache Arrow and uses the DataFusion query engine
for SQL, which lets it interoperate with Arrow-based tools such as pandas, Polars,
and DuckDB. The project ships Python bindings (the `deltalake` package), which
complement the PySpark interface, and community-maintained Go and .NET bindings
are developed in the `delta-incubator` organization.[^deltars][^withoutspark] Some
engines, including DuckDB, reach Delta tables through the Delta Kernel (described
below) rather than a bespoke implementation.[^kernel]

## Ecosystem fragmentation and the Delta Kernel

As Delta Lake added optional capabilities over time, tables could use protocol
features that a given engine did not implement. Delta uses a table-features
mechanism in which a table declares the reader and writer features it requires; a
client can read or write a table only if it supports all of the features the table
declares.[^tablefeatures][^protocol] Because each engine implemented the protocol
separately, support for newer features arrived unevenly, and a table written by
one tool could be unreadable by another.[^tablefeatures]

To address this, the Delta Lake community developed the Delta Kernel, a library
that implements the protocol's semantics behind a stable API, so an engine can
support Delta tables without reimplementing the specification. It is developed in
two implementations: a Java kernel and a Rust kernel (`delta-kernel-rs`). By 2025
a range of tools consumed Delta tables through the kernel rather than through a
bespoke implementation, including the query engines DuckDB and ClickHouse, the
analytics database StarRocks, and streaming-ingest tools such as Confluent
Tableflow.[^kernel][^kernelrepo][^starrocks][^tableflow] The `delta-rs` library
also began adopting the Rust kernel as its protocol layer during
2025.[^deltars][^kernelrepo] The kernel is an ongoing effort; as of 2025 its read
interfaces were more mature than its write interfaces.[^kernelrepo]

## Relation to other table formats

Delta Lake is one of several open table formats, alongside Apache Iceberg and
Apache Hudi. To ease interoperability, Databricks introduced UniForm in 2023,
which lets a Delta table also expose Iceberg- and Hudi-compatible metadata over a
single copy of the data.[^siunif] The relationship between Delta Lake and Iceberg
has often been described as a rivalry; in 2024 Databricks acquired Tabular, a
company founded by Iceberg's original creators, and said it aimed to move the two
formats toward a common standard.[^cnbctabular]

## See also

- Open table format
- Data lakehouse
- Apache Iceberg
- Apache Parquet
- Databricks

## References

[^ibm]: "What is Delta Lake?," IBM. <https://www.ibm.com/think/topics/delta-lake>
[^vldb2020]: Michael Armbrust et al., "Delta Lake: High-Performance ACID Table Storage over Cloud Object Stores," *Proceedings of the VLDB Endowment*, vol. 13, no. 12, pp. 3411–3424, 2020. doi:10.14778/3415478.3415560
[^tc2019]: Frederic Lardinois, "Databricks brings its Delta Lake open source project to the Linux Foundation," *TechCrunch*, 2019-10-15. <https://techcrunch.com/2019/10/15/databricks-brings-its-delta-lake-open-source-project-to-the-linux-foundation/>
[^iw2022]: Anirban Ghoshal, "Databricks open sources its Delta Lake data lakehouse," *InfoWorld*, 2022-06-28. <https://www.infoworld.com/article/2335877/databricks-open-sources-its-delta-lake-data-lake.html>
[^lfpress]: "The Delta Lake Project Turns to Linux Foundation to Become the Open Standard for Data Lakes," Linux Foundation, 2019-10-16. <https://www.linuxfoundation.org/press/press-release/the-delta-lake-project-turns-to-linux-foundation-to-become-the-open-standard-for-data-lakes>
[^tablefeatures]: "Delta Lake Table Features," delta.io, 2023-07-27. <https://delta.io/blog/2023-07-27-delta-lake-table-features/>
[^protocol]: "Delta Transaction Log Protocol (PROTOCOL.md)," delta-io/delta, Linux Foundation. <https://github.com/delta-io/delta/blob/master/PROTOCOL.md>
[^deltars]: "delta-io/delta-rs: A native Rust library for Delta Lake, with bindings into Python," Linux Foundation. <https://github.com/delta-io/delta-rs>
[^withoutspark]: "Delta Lake without Spark," delta.io. <https://delta.io/blog/delta-lake-without-spark/>
[^kernel]: "Delta Kernel," delta.io. <https://delta.io/blog/delta-kernel/>
[^kernelrepo]: "delta-io/delta-kernel-rs," Linux Foundation. <https://github.com/delta-io/delta-kernel-rs>
[^starrocks]: "Delta Kernel: A Game-Changer for Customer-Facing Analytics," delta.io. <https://delta.io/blog/starrocks-kernel/>
[^tableflow]: "Tableflow for Delta Lake and Databricks Unity Catalog is Now Generally Available," Confluent. <https://www.confluent.io/blog/tableflow-delta-lake-databricks-unity-catalog-ga/>
[^siunif]: "Databricks' Delta Lake 3.0 bridges compatibility gaps with Apache Iceberg and Hudi," SiliconANGLE, 2023-06-28. <https://siliconangle.com/2023/06/28/databricks-delta-lake-3-0-bridges-compatibility-gaps-apache-iceberg-hudi/>
[^cnbctabular]: "Databricks is buying data optimization startup Tabular," *CNBC*, 2024-06-04. <https://www.cnbc.com/2024/06/04/databricks-is-buying-data-optimization-startup-tabular.html>
