---
title: Parquet is engine territory, and Delta Kernel knows it
slug: parquet-is-engine-territory
status: draft
tags: [file-formats, delta-kernel, datafusion, delta-lake, rust]
series: Kernel Inside
series_order: 3
author: Robert Pack
target: delta
post_type: essay
audience: Data engineers and engine builders who use Delta Lake and Parquet and know roughly what delta-rs and DataFusion are.
summary: Parquet readers and writers are now serious engineering. Delta Kernel leaves Parquet to the engine, so delta-rs gets DataFusion's Parquet gains for free.
---

<!-- Author's dump, kept for reference while this evolves:
> Okay, back in the day, public Parquet readers were very basic. Today, these
> are advanced pieces of engineering. We can call out how Data Fusion and
> DuckDB compete for the quickest Parquet reads on Clickbench, both
> open-source projects. -->

Back in the day, public Parquet readers were very basic. Today they are
advanced pieces of engineering, and two open-source engines, DataFusion and
DuckDB, trade the top places on [ClickBench](https://benchmark.clickhouse.com/)'s
Parquet runs. My argument in this post is that this work belongs to the
engine. Delta Kernel deliberately hands Parquet to the engine, so when
DataFusion gains something like Bloom filter folding or content-defined
chunking, delta-rs can pick it up without any change to the Delta table format.

*Where this fits:* this is the third post in **Kernel Inside**, a series on how
the kernel architecture is simplifying the way engines integrate with open
table formats. It stands on its own; the earlier posts cover the bytes proxy
and the Volumes Files API.
<!-- TODO: link posts 1 and 2 once they have slugs in blogs/SERIES.md. -->

:::tldr
- Modern Parquet readers prune with page indexes and Bloom filters, push
  filters into decoding, and cache footers. In DataFusion, page-index pruning
  and Bloom filter reads are on by default.
- arrow-rs folds Bloom filters by default since arrow 58.2.0
  ([arrow-rs#9628](https://github.com/apache/arrow-rs/pull/9628)), so every
  arrow-rs writer that enables Bloom filters gets right-sized ones.
- Content-defined chunking landed in arrow-rs 58.1.0
  ([arrow-rs#9450](https://github.com/apache/arrow-rs/pull/9450)) and is an
  experimental DataFusion 54.0.0 writer option, off by default.
- Delta Kernel's `ParquetHandler` gives Parquet reads, writes, and footers to
  the engine. None of these features needs a Delta protocol change.
- delta-rs support is in progress: a DataFusion kernel executor
  ([delta-rs#4928](https://github.com/delta-io/delta-rs/pull/4928)) and CDC
  through table format options
  ([delta-rs#4590](https://github.com/delta-io/delta-rs/pull/4590)).
:::

<!-- TODO: the TL;DR leans on the CDC and executor items being in progress.
Revisit every bullet against the pre-publish check in "Where delta-rs is on
this path". -->

## What a modern Parquet reader does

A modern Parquet reader does as little work as it can get away with. It reads
the footer once and caches it, skips row groups and individual pages it can
prove don't match the predicate, checks Bloom filters before touching a column
chunk, and decodes the filter columns first so it only materializes the rows
that survive. None of that is exotic any more. It is the baseline the
open-source readers ship.

<!-- Author's dump:
> I got inspired when reading the following blog around folding in Bloom
> filters. https://pydantic.dev/articles/bloom-filter-folding-parquet-logfire -->

I got here by reading Pydantic's
[post on Bloom filter folding in Logfire](https://pydantic.dev/articles/bloom-filter-folding-parquet-logfire),
and it made me look again at how much sits in a Parquet scan today. Take
DataFusion's Parquet options at
[55.2.0](https://github.com/apache/datafusion/blob/55.2.0/datafusion/common/src/config.rs#L1208):

- **Page-index pruning.** `enable_page_index` defaults to `true`. Row-group
  statistics prune whole row groups; the page index goes one level down and
  skips pages inside a row group that can't match.
- **Filter pushdown and late materialization.** With `pushdown_filters`,
  DataFusion applies the filter during Parquet decoding, which its own docs
  call "late materialization": decode the predicate columns, build a
  selection, and decode the other columns only for the rows that pass. It
  defaults to `false`, and `reorder_filters` orders the predicates by cost.
- **Metadata caching.** The runtime keeps a file-metadata cache sized by
  `metadata_cache_limit`
  ([cache_manager.rs](https://github.com/apache/datafusion/blob/55.2.0/datafusion/execution/src/cache/cache_manager.rs#L439)),
  so a repeated scan doesn't refetch and reparse footers. `metadata_size_hint`
  (512 KiB by default) fetches the footer in one read instead of two.
- **Bloom filters.** `bloom_filter_on_read` defaults to `true`: if a file has
  them, DataFusion uses them to rule out row groups for equality predicates
  that min/max statistics can't decide.
  <!-- TODO(source): pin DataFusion's Bloom filter pruning code and check
  which predicate shapes it handles (= only, or IN lists too). -->

<!-- TODO: add DuckDB's equivalents (row-group/zonemap pruning, its Parquet
Bloom filter support, its metadata cache) with pinned sources, so this isn't
DataFusion-only. -->
<!-- TODO: decide if we want to state why pushdown_filters is off by default
in DataFusion, and whether delta-rs's provider changes it. At rust-v1.0.0
delta-rs inherits the session value (see the folding section), so it's off
unless the user sets it. -->

Each of these took years of tuning and benchmarking to get right, and the
people best placed to keep doing it are the ones who own the scan: the engine
teams.

## DataFusion and DuckDB at the top of ClickBench

DataFusion and DuckDB, both open source, compete for the top places on
ClickBench's Parquet runs. DataFusion held first place recently and may again.
I'm not going to declare a winner, because the ranking moves with releases of
either engine, and that churn is the healthy part.

The runs I looked at are pinned at ClickBench
[`360a792`](https://github.com/ClickHouse/ClickBench/tree/360a792):
[DataFusion partitioned, 2026-08-20](https://github.com/ClickHouse/ClickBench/blob/360a792/datafusion-partitioned/results/20260820/c6a.4xlarge.json)
and
[DuckDB Parquet partitioned, 2026-05-11](https://github.com/ClickHouse/ClickBench/blob/360a792/duckdb-parquet-partitioned/results/20260511/c6a.4xlarge.json),
both on `c6a.4xlarge`.

<!-- TODO: recheck the live board (https://benchmark.clickhouse.com/) right
before publish and adjust "took first place recently" to whatever it shows.
Note the two pinned results are three months apart; decide whether that
matters for the framing. -->
<!-- TODO: decide whether to quote any numbers (hot/cold totals) from the
pinned files. If we do, read them from the JSON, don't eyeball the board. -->

What matters for a Delta user is that two independent teams push Parquet
scans this hard in the open. A table format that lets its engine do the
reading gets that work every time it upgrades.

## Bloom filter folding: right-sized filters without guessing

Bloom filter folding lets a Parquet writer size a Bloom filter after it has
seen the data instead of before. A split-block Bloom filter has to be
allocated up front from an expected number of distinct values (NDV), and the
writer rarely knows that number. Guess low and the false-positive rate climbs;
guess high and every column chunk carries a filter far bigger than it needs.
With folding, the writer allocates for the configured maximum NDV and target
false-positive probability, then folds the filter down to the smallest size
that still meets that probability once all values are in.

arrow-rs added folding in
[arrow-rs#9628](https://github.com/apache/arrow-rs/pull/9628)
([`c6ea0a5`](https://github.com/apache/arrow-rs/commit/c6ea0a5e0)), released in
arrow 58.2.0, and it is on by default. There is no switch to turn it off;
[arrow-rs#11892](https://github.com/apache/arrow-rs/pull/11892) proposes one
and is open. The
[Logfire post](https://pydantic.dev/articles/bloom-filter-folding-parquet-logfire)
is the deep dive on how it works and what it saved them, so I won't retell it.

<!-- Author's dump:
> and the Bloom folding also landed in Data Fusion -->

DataFusion gets folding by upgrading arrow, and it didn't need any change of
its own. DataFusion 54.0.0 builds on arrow 58.3.0 and 55.2.0 on arrow 59.2.0,
so any DataFusion write with Bloom filters on produces folded filters. Folding
is a write-side feature that pays off on every later read: the filters are
smaller to fetch and still selective, and no reader has to know they were
folded.

### Does a delta-rs write pick up DataFusion's Parquet settings?

It doesn't, at least not at delta-rs
[`rust-v1.0.0`](https://github.com/delta-io/delta-rs/tree/rust-v1.0.0)
(`41f1ce2`). The read and write paths behave differently:

- **Reads inherit the session.** The DataFusion scan builds its
  `TableParquetOptions` from the session:
  [`datafile/properties.rs`](https://github.com/delta-io/delta-rs/blob/rust-v1.0.0/crates/core/src/datafile/properties.rs#L22)
  sets `global: session.config().options().execution.parquet.clone()`, and
  the table provider's scan uses it
  ([`next/scan/mod.rs`](https://github.com/delta-io/delta-rs/blob/rust-v1.0.0/crates/core/src/delta_datafusion/table_provider/next/scan/mod.rs#L691)).
  So `bloom_filter_on_read`, `enable_page_index`, and `pushdown_filters` set
  on the `SessionContext` apply to Delta scans.
- **Writes build their own `WriterProperties`.** When the caller passes no
  writer properties, `WriterConfig::new` falls back to
  [`default_writer_properties`](https://github.com/delta-io/delta-rs/blob/rust-v1.0.0/crates/core/src/parquet_utils.rs#L4)
  ([`datafile/writer.rs`](https://github.com/delta-io/delta-rs/blob/rust-v1.0.0/crates/core/src/datafile/writer.rs#L379)),
  which sets only `created_by` and Snappy compression (Zstd level 4 for
  `OPTIMIZE`). The DataFusion `insert_into` path goes through the same
  constructor with `None`
  ([`data_sink.rs`](https://github.com/delta-io/delta-rs/blob/rust-v1.0.0/crates/core/src/delta_datafusion/table_provider/data_sink.rs#L162)).
  Nothing on the write path reads `execution.parquet`, so
  `datafusion.execution.parquet.bloom_filter_on_write` has no effect on a
  Delta write.

That also answers whether delta-rs writes Bloom filters by default: it
doesn't. In parquet-rs a column gets a Bloom filter only when its
`BloomFilterProperties` are set, and delta-rs's defaults don't set them.
DataFusion's own default is the same (`bloom_filter_on_write` is `false` at
[55.2.0](https://github.com/apache/datafusion/blob/55.2.0/datafusion/common/src/config.rs#L1377)).
To get Bloom filters, and so folding, a delta-rs user passes
`WriterProperties` explicitly: `with_writer_properties(...)` on the write,
merge, update, delete, and optimize builders in Rust, or
`BloomFilterProperties` on the `ColumnProperties` of a `WriterProperties` in
Python.

<!-- TODO: verify with a snippet: write a small Delta table with delta-rs at
rust-v1.0.0, once with defaults and once with Bloom filters enabled via
WriterProperties, and read the footer back to confirm (a) no Bloom filter by
default, (b) a folded filter when enabled. Also confirm that setting
bloom_filter_on_write=true on the session changes nothing for insert_into. -->
<!-- TODO(open question): is "writes ignore the session" a deliberate choice
or a gap? If delta-rs should map TableParquetOptions into WriterProperties
(DataFusion has a conversion for its own sink), is there an issue or PR for
it? Check open delta-rs issues before publish. This could become an argument
point: the engine's knob should reach the engine's writer. -->
<!-- TODO: any measured effect of folding on a Delta table (filter size,
file size, scan time). Unsourced; leave out until we have a number. -->

## Content-defined chunking: Parquet pages that deduplicate

Content-defined chunking (CDC) makes Parquet page boundaries follow the data
instead of fixed sizes, so a file rewritten with mostly the same rows produces
mostly the same pages. Content-addressed storage can then deduplicate those
pages across files and versions. Hugging Face built this for their
storage, and their
[write-up on Parquet CDC](https://huggingface.co/blog/parquet-cdc) explains
why it matters for datasets that are re-uploaded with small edits.

<!-- Author's dump:
> Furthermore, I believe there are efforts to integrate Hugging Face's Parquet
> [content-defined chunking] into a Data Fusion. -->

The path into the Rust stack is short and public:

1. **arrow-rs.** Krisztián Szűcs (kszucs) added CDC to the arrow writer in
   [arrow-rs#9450](https://github.com/apache/arrow-rs/pull/9450)
   ([`bc74c71`](https://github.com/apache/arrow-rs/commit/bc74c7192)), released
   in arrow 58.1.0.
2. **DataFusion.** [datafusion#21110](https://github.com/apache/datafusion/pull/21110)
   (`a51971b`) exposes it as a writer option in DataFusion 54.0.0. It is
   experimental and off by default; the
   [CDC user guide](https://datafusion.apache.org/user-guide/parquet-content-defined-chunking.html)
   has the knobs.
3. **delta-rs.** [delta-rs#4590](https://github.com/delta-io/delta-rs/pull/4590),
   also from kszucs, is open. It reads the CDC settings from the table's
   `Metadata.format.options` and applies them on every write path, including
   `OPTIMIZE`, `DELETE`, and `insert_into`. It is blocked on
   [delta-kernel-rs#3323](https://github.com/delta-io/delta-kernel-rs/pull/3323),
   which adds `metadata.format.options` to the kernel's FFI metadata visitor
   and has to land in the kernel version delta-rs depends on.
   <!-- TODO: confirm the exact reason #4590 needs #3323 (the PR's own
   comment says CDC "needs the kernel to read metadata.format.options") and
   restate it in one plain clause. -->

<!-- TODO: the arrow-rs#9450 "58.1.0" and datafusion#21110 "54.0.0" release
attributions come from the plan; re-verify against the arrow-rs and
DataFusion CHANGELOGs at publish. -->
<!-- TODO: confirm the exact Hugging Face storage term we want (Xet?) and
whether to name it. -->
<!-- TODO: any measured dedup ratio on a Delta table. Unsourced. -->

Notice where #4590 puts the settings: in `format.options`, a map the Delta
protocol carries without interpreting, rather than in a new table property or
protocol feature. I think that placement is the whole argument in miniature.

## Why Parquet belongs to the engine

Parquet belongs to the engine because none of these features changes what a
Delta table means. Folding changes how big a Bloom filter is, and CDC changes
where pages break. A Delta reader that knows nothing about either still reads
the table correctly. Delta Kernel's design follows from that: it owns the
protocol (the log, the snapshot, which files make up a version, how to apply
deletion vectors and column mapping) and hands the bytes of each Parquet file
to the engine.

<!-- Author's dump:
> So if Hugging Face supports lands in Data Fusion and the Bloom folding also
> landed in Data Fusion, this means all of these features are optimizations
> that only engines care about. It's exactly how the kernel architecture
> isolates things. -->

If Hugging Face's chunking lands in DataFusion and Bloom folding also lands in
DataFusion, these are optimizations only engines care about. That is exactly
how the kernel architecture isolates things. The seam is
[`ParquetHandler`](https://github.com/delta-io/delta-kernel-rs/blob/v0.30.1/kernel/src/lib.rs#L769)
in delta-kernel-rs (`v0.30.1`, `89bb084`): the engine implements
`read_parquet_files`, `write_parquet_file`, and `read_parquet_footer`, and the
kernel tells it which files, which physical columns, and which predicate. The
kernel never decides how many pages to write or whether to check a Bloom
filter.

So I disagree with two ideas I still hear:

- **That a table-format library should own Parquet I/O and tune it.** A
  format library that ships its own Parquet reader has to keep up with
  DataFusion's and DuckDB's, and it won't. The engine teams compete on
  ClickBench; a format library doesn't, and shouldn't need to.
- **That every Delta integration has to re-implement the Parquet
  optimizations.** With the kernel, an integration's Parquet is whatever its
  engine already has. Every gain the engine picks up lands on every Delta
  table that engine reads or writes.

CDC through `format.options` is the concrete case. The Delta spec defines
`format` as the provider plus an options map for the file format and leaves
the options to that format. #4590 uses that gap as designed: the table records
"write with these chunking parameters", the kernel passes the map through,
and the engine's writer does the chunking. The kernel learns nothing new about
Parquet.

<!-- TODO: pin the Delta PROTOCOL.md section for Metadata.format (provider +
options) and quote the exact wording on options. -->
<!-- TODO: does a non-CDC-aware writer drop or ignore these options on
rewrite? If a different engine rewrites the files, the table silently loses
CDC page layout but stays correct. Worth one sentence; needs a source. -->

The fragmentation argument, why every engine re-implementing the protocol is
the real cost, is in
[How a Kernel becomes a (AS)Tree](../kernel-becomes-tree/), so I won't repeat
it here.
<!-- TODO: kernel-becomes-tree is status: idea and not in this series. Check
the link target and the title before publish, and decide if it joins Kernel
Inside. -->

## DataFusion's reader doing the kernel's work

On the plan-based path, the kernel describes its work as a plan and a
DataFusion executor runs it with DataFusion's own Parquet scan. The kernel
says "read these files with this schema and this predicate, then apply these
transforms", and DataFusion does the reading with everything from the first
section: page index, Bloom filters, pushdown, metadata cache.

The pieces in delta-kernel-rs are merged behind the experimental
`declarative-plans` feature flag:

- [delta-kernel-rs#2590](https://github.com/delta-io/delta-kernel-rs/pull/2590)
  introduces the `PlanExecutor` trait and a basic plan IR.
- [delta-kernel-rs#2621](https://github.com/delta-io/delta-kernel-rs/pull/2621)
  adds `PlanBasedEngine` and a `SyncPlanExecutor`.
- [delta-kernel-rs#3079](https://github.com/delta-io/delta-kernel-rs/pull/3079)
  converts plans and scalar and filter operators.

The kernel repository also carries a
[`datafusion-executor/`](https://github.com/delta-io/delta-kernel-rs/tree/v0.30.1/datafusion-executor)
crate at `v0.30.1` that runs those plans on DataFusion. It isn't published on
crates.io.

<!-- Author's dump:
> Certainly, there are other integrations and seams that sometimes can
> directly be implemented, but this leverages the engine's most native
> primitives. We should focus on the plan-based implementation. -->

There are other seams. An engine can implement `ParquetHandler` and the other
handlers directly, and for some integrations that's the right call. But the
plan-based path uses the engine's most native primitive, its own scan
operator, instead of wrapping it behind a callback, and that's the one I want
delta-rs on. The full plan-based story belongs in
[How a Kernel becomes a (AS)Tree](../kernel-becomes-tree/).

<!-- TODO: one sentence or a small LikeC4 view (blog-views.likec4) showing
kernel -> plan -> DataFusion executor -> ParquetSource, if it helps. Would
also be the post's original asset. -->
<!-- TODO: does the datafusion-executor build its Parquet scan with the
session's TableParquetOptions (like delta-rs's provider does) or with its
own? Same question as the write path, on the read side of the new path. -->

## Where delta-rs is on this path

delta-rs is moving onto this path, and the work is in progress. We're
improving the kernel integration in delta-rs so that it can, and should, lean
on DataFusion's Parquet reader:

- [delta-rs#4928](https://github.com/delta-io/delta-rs/pull/4928) adds a
  DataFusion kernel executor crate. It's a draft.
- [delta-rs#4951](https://github.com/delta-io/delta-rs/pull/4951) fills the
  executor's gaps: object-store I/O and file scans.
- [delta-rs#4590](https://github.com/delta-io/delta-rs/pull/4590) adds Parquet
  CDC through `Metadata.format.options`, waiting on the kernel dependency.

<!-- Author's dump:
> We're currently working on improving the kernel integration in Delta RS.
> And we're also working on improving the kernel integration into Delta RS,
> which can or should leverage Data Fusion's Parquet reader.
> Again, the Delta RS implementation is ongoing work. We may call it out as
> such or, if it lands early enough, claim it as shipped. -->

<!-- PRE-PUBLISH CHECK (state as of 2026-10-25). Before release, re-validate
every item below, the delta-rs PRs and the delta-kernel-rs PRs and releases
they depend on. Call something shipped only if it is merged AND released, and
update this section and the TL;DR to match.
T1 delta-rs#4928: DataFusion kernel executor crate. Open, draft (head c0be711).
T2 delta-rs#4951: executor gaps (object-store I/O, file scans). Open (head ed89e82).
T3 delta-rs#4590: Parquet CDC via Metadata.format.options. Open (head 7482f2e), blocked on T7.
T4 delta-rs#4484: superseded. Don't cite.
T5 datafusion#26561: open. NOTE: its title on 2026-10-25 is "feat: add
   coerce_primitive in json", which looks unrelated; confirm the intended PR.
T6 delta-kernel-rs#2590 (398104e), #2621 (c42a5f5), #3079 (4a1cfc4): merged,
   behind the experimental declarative-plans flag.
T7 delta-kernel-rs#3323 (2ceebda): merged, in kernel v0.29.0, not in
   delta-rs's kernel dependency.
T8 delta-kernel-rs datafusion-executor/: not on crates.io.
T9 kernel version delta-rs depends on: 0.28 line at rust-v1.0.0 (41f1ce2).
   Record the version at publish.
-->

## What to watch next

If you run delta-rs with DataFusion, follow
[delta-rs#4928](https://github.com/delta-io/delta-rs/pull/4928): that's where
the kernel executor lands, and with it DataFusion's scan on the kernel's plans.
In the meantime, turn on Bloom filters through `WriterProperties` on your
delta-rs writes. Folding sizes them for you on arrow 58.2.0 and later, and
DataFusion reads them by default. If deduplicated storage matters to you, try
CDC through DataFusion's writer and watch
[delta-rs#4590](https://github.com/delta-io/delta-rs/pull/4590) for the Delta
side.

<!-- TODO: prev/next links within Kernel Inside (post 2: Volumes + Files API;
no post 4 yet). -->
<!-- TODO: once the session-config question is settled (is ignoring
execution.parquet on writes a gap?), the CTA may become "set it on the
session" instead of "pass WriterProperties". -->
