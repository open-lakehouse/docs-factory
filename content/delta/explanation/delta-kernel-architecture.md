---
title: Delta kernel architecture
summary: How a shared kernel library lets many engines speak Delta without diverging.
diataxis: explanation
project: delta
engines: []
delta_features: []
status: published
---

As more engines read and write Delta, each one reimplementing the protocol risks
divergence: subtle disagreements about what a table contains. The Delta kernel
addresses this. It is a shared library that implements the protocol once, so
engines consume it rather than rewriting it.

## The idea

A kernel splits responsibilities in two. The kernel owns everything
protocol-specific: reading the transaction log, resolving the current set of
files, applying features like deletion vectors and column mapping, and planning
scans. The engine owns everything environment-specific: reading bytes from
storage, parsing Parquet and JSON, evaluating expressions, and representing data
in memory.

The engine implements a small interface the kernel calls into, and the kernel
hands back a plan the engine executes. Because protocol logic lives in one place,
a new feature is implemented once and every kernel-backed engine gets it
correctly. And because the kernel never touches raw bytes itself, it stays
independent of any particular in-memory format, storage system, or async runtime.

## A two-sided, "C-shaped" API

The kernel's public surface has two distinct sides, which is why the design is
often described as *C-shaped*: control flows in through one side and back out
through the other.

*Table APIs* are what the engine calls. Read a snapshot, list a scan's metadata,
start a transaction. These express intent in Delta terms, saying what the engine
wants from the table. *Engine APIs* are what the kernel calls back into. Read
these Parquet files, evaluate this expression, parse this JSON. These express work
in general data-engine terms: plain capabilities any engine already has, with no
Delta semantics attached.

A single request flows around the C. The engine invokes a table API, the kernel
works out what that requires and drives it by calling engine APIs, and the results
come back to the engine. The engine never learns the protocol, and the kernel
never does I/O.

What matters most is what the kernel produces in the middle. It is moving toward
being purely logical: rather than imperatively orchestrating I/O, it generates a
plan describing the work, and the engine executes it. The engine APIs are being
modelled more explicitly against logical plans to match, so the kernel's output
becomes a plan the engine runs rather than a sequence of individual callbacks the
kernel issues.

## The three layers

Between the compute engine and physical storage, a kernel-backed integration has
three conceptual layers.

The connector adapts a specific compute engine (Spark, Flink, DuckDB, Polars, a
custom query engine) to Delta. It implements whatever data-source interface that
engine defines and fulfills those calls using the kernel. The connector owns
execution: how work is distributed, how many tasks run, which worker reads which
file.

The kernel implements the Delta protocol: log replay, data skipping, schema and
feature enforcement, and transaction coordination. It decides what must happen but
performs no I/O.

The engine interface is the boundary the kernel calls across whenever it needs the
outside world: listing and reading files, parsing JSON, reading and writing
Parquet, evaluating expressions. The connector supplies an implementation, and
most kernels ship a batteries-included default so simple cases work out of the box.

The dividing line is consistent. The kernel handles the protocol, the connector
handles execution, and the engine interface handles I/O and compute.

## The engine side: general capabilities

The engine-API side asks for a handful of well-defined, Delta-agnostic
capabilities:

- Storage: list files in the log directory, read byte ranges, write commit and
  checkpoint files.
- JSON: read and write the log's commit files and checkpoint manifests.
- Parquet: read data and checkpoint files, and write new data files.
- Expression evaluation: apply predicates to file statistics for data skipping,
  and apply the per-file transforms (partition values, column mapping) that turn
  physical files into logical rows.

Nothing about these capabilities is Delta-specific, which is the point. An engine
already knows how to read Parquet and evaluate expressions, so it plugs its
existing machinery into the kernel rather than the kernel reimplementing it.

## How a read works

A read shows the split in motion. What's worth noticing is that even the steps
that look like pure protocol work are still the kernel *directing* the engine, not
doing the work itself. When a connector asks the kernel to scan a table:

1. Log replay. The kernel decides which log files to read to reconstruct the table
   at the requested version: the latest checkpoint, if any, plus the JSON commits
   after it. That set is conditional on what the log contains, so the kernel works
   it out. But it doesn't read anything. It asks the engine to read those JSON and
   Parquet log files, then processes the returned actions through expressions,
   again evaluated by the engine, to arrive at the set of files active for this
   version.
2. Data skipping. If a predicate was supplied, the kernel translates it into
   expressions over the per-file statistics carried in the log (min/max, null
   counts) and has the engine evaluate them. The result is a selection vector that
   marks which files can be dropped because they cannot match. The kernel decides
   *what* to evaluate; the engine does the evaluating.
3. File reading. The kernel hands the engine the surviving data files to read.
4. Transform. The kernel expresses the per-file transformations (partition-value
   injection, column mapping, deletion vectors) as expressions, and the engine
   applies them to produce the final logical data.

The pattern is the same in every step: the kernel supplies metadata, file lists,
and expressions, and the engine performs all the I/O and all the evaluation. The
kernel never touches a byte of storage or evaluates an expression itself. Read
through the C-shaped lens, the connector's single call to a table API (scan) is
answered by the kernel repeatedly driving engine APIs. And the more the kernel
expresses that work as a plan rather than step-by-step callbacks, the more of it
the engine can schedule and parallelize on its own terms.

### An example: rewriting the data-skipping predicate

Data skipping is one good illustration of the Delta-specific logic the kernel
applies during log replay. It is far from the only one (reconciling adds and
removes, resolving deletion vectors, applying column mapping, and enforcing
protocol features all involve comparable reasoning), but it shows the shape of the
work clearly.

Look again at step 2. The engine evaluates a predicate, but it does not evaluate
the *query's* predicate. It evaluates one the kernel derives.

A query filter like `x > 10` is a statement about column values. The log doesn't
store column values; it stores per-file statistics: the minimum and maximum of
each column in a file, and how many nulls it has. So the kernel rewrites the
value-level predicate into a *data-skipping predicate* over those statistics. For
`x > 10`, no row in a file can match unless the file's maximum for `x` exceeds 10,
so the file is safe to skip when `max(x) <= 10`. The kernel emits that rewritten
expression; the engine evaluates it against the statistics; files that provably
cannot match are dropped.

The rewrite is the hard part, and it is pure symbolic reasoning the kernel does
entirely in metadata-space:

- Soundness over three-valued logic. SQL evaluates predicates in three-valued
  logic: a comparison involving null is *unknown*, not true or false, and a row is
  returned only when the filter is definitely true. The skipping predicate is
  subject to the same logic, so the safe rule is asymmetric. A file may be dropped
  only when the skip condition is *definitely true*, a proof that no row can match.
  Both *false* and *unknown* must fall through to reading the file, because unknown
  might conceal a match. This is why missing or absent statistics never cause a
  skip: absent a value to reason about, the condition is unknown, and unknown
  reads. A single wrongly skipped file is a silently wrong query result, so the
  rewrite is deliberately biased toward reading whenever it cannot prove otherwise.
- Pushing negation inward with De Morgan's laws. A `NOT` around a compound
  predicate has no direct min/max form, so the kernel drives negation down to the
  leaf comparisons using [De Morgan's laws](https://en.wikipedia.org/wiki/De_Morgan%27s_laws)
  (`NOT (a AND b)` becomes `NOT a OR NOT b`, and so on) until every leaf is a
  comparison it knows how to turn into a statistics test. Combined with
  simplification, this is what lets complex `AND`/`OR`/`NOT` filters be skipped on
  at all.
- Selecting which statistics to read. The rewritten predicate determines which
  statistics matter, and only those need to be materialized during log replay.
  Reading the required statistics is folded back into the file reads that log
  replay already performs, so skipping costs no extra passes over the log.

None of this changes the division of labor. The kernel still only produces an
expression, and the engine still only evaluates it. But it shows what "the kernel
decides *what* to evaluate" actually means: not merely forwarding the user's
filter, but deriving a provably sound statistics predicate from it. That derivation
is exactly the kind of protocol-shaped complexity a shared kernel exists to
implement once.

## How a write works

Writes follow the same principle through a transaction, and the same asymmetry:
the kernel decides what the physical write must look like, and the engine performs
it.

1. Start. The connector opens a transaction against a snapshot pinned to a
   specific version. The transaction carries all the context the write needs: the
   table's schema, its column-mapping mode, which features are active, and which
   columns require statistics.
2. Prepare the physical write. Data arrives in *logical* form, as the rows the
   user wants to append. Before anything reaches storage it must become *physical*
   data, and the kernel decides what that means. It produces the mapping from
   logical to physical column names (column mapping can rename or reassign columns
   on disk) and accounts for the bookkeeping that active table features require,
   such as assigning identifiers for row tracking. The kernel expresses this as an
   expression over the logical data, exactly as on the read path, plus the physical
   schema to write against and the set of columns to gather statistics for.
3. Write data (engine / connector). The engine applies that expression to turn
   logical rows into physical ones, writes the Parquet files, collects the
   requested statistics, and returns each file's metadata (path, size, stats) to
   the kernel.
4. Commit (kernel + committer). The kernel assembles the protocol actions,
   including the add-file entries built from that returned metadata, and a
   committer lands them atomically: a new JSON log entry for a filesystem table,
   or a catalog call for a catalog-managed table.
5. Resolve. The commit either succeeds, conflicts with a writer that committed
   first, or hits a retryable error.

Two things are worth drawing out. First, step 2 is the write-side mirror of the
read-path transform: in both directions the kernel never moves data itself, it
emits an expression describing the logical/physical conversion and lets the engine
run it. Second, that preparation context is self-contained and serializable, which
is what makes distributed writes possible. A driver can build it once and ship it
to many workers; each worker produces physical files independently and reports its
file metadata back, and the driver commits the collected result as a single
transaction. This mirrors how the read path distributes scan metadata to workers.

Conflict detection is protocol logic, so it lives in the kernel; deciding whether
and how to retry belongs to the connector.

### An example: assigning row IDs

Row tracking is the write-side counterpart to the data-skipping example: a feature
whose correctness rests on how the kernel chooses to express the work, not on the
engine doing anything Delta-aware. Row tracking gives every row in the table a
stable identifier that survives across rewrites. Because there is one ID per row,
the IDs are fundamentally row-level data, so they cannot live purely in log
metadata. But the kernel avoids stamping an explicit ID onto every row.

For freshly written rows the kernel avoids storing an ID per row. It assigns each
*file* a single `baseRowId` and reconstructs the per-row IDs from position. The
kernel tracks a high-water mark, the largest row ID handed out so far, in the log's
domain metadata. When a file is added, the kernel reads the file's row count from
its statistics, sets that file's `baseRowId` to the current high-water mark plus
one, and advances the mark by the row count. A file of ten rows written against an
empty table gets `baseRowId` 0; the next file gets `baseRowId` 10. Only that one
scalar per file is recorded in the log, and a row's ID is `baseRowId + row_index`,
its position within the file added to the file's base.

But position is only a valid offset while a row stays put. The moment a file is
rewritten (compaction, `OPTIMIZE`, a `MERGE`) rows are split and combined across
new files, and their positions no longer reflect their original `baseRowId`.
Deriving from position now would mint *new* IDs and break stability. So a row that
survives a rewrite must carry its original ID explicitly: the writer materializes
it into a physical row-id column in the new file. Not every row needs this, only
those whose derived ID would otherwise change, so the column is sparse.

The kernel reconciles both cases in a single read expression, a coalesce:

```text
row_id = COALESCE(materialized_row_id, baseRowId + row_index)
```

If a row carries a materialized ID, that value wins; otherwise the kernel falls
back to base-plus-position. The engine evaluates this expression per row and never
needs to know which case applies. So the answer to "where do row IDs live" is:
derived from a per-file scalar for rows that have never moved, and materialized
into the data file for rows that have. The kernel decides which rows need
materializing and expresses the read-time reconstruction; the engine writes and
evaluates. This is the same shape as data skipping, applied to a different protocol
requirement.

## Staying data-format agnostic

The kernel never assumes a particular in-memory representation. Rather than
inspecting columns directly, it accesses data through an opaque batch abstraction
and visitor-style accessors: it names the columns it needs and reads values
through callbacks the engine provides. A default engine typically backs this with
a common columnar format (such as Arrow), but a connector with its own format
implements the same abstraction over its native batches, with no conversion
required.

## Reaching many languages

Because the protocol logic is isolated behind a narrow interface, a single kernel
implementation can serve far beyond its own language. Kernels commonly expose a
C-compatible foreign-function-interface layer, letting connectors in C, C++, or
any language with a C FFI drive the same protocol code without reimplementing it.
This is what lets one kernel underpin a broad ecosystem of engines.

## Two implementations

- `delta-kernel-rs` (Rust) powers DuckDB, ClickHouse, and delta-rs, and exposes a
  C/C++ FFI for other languages.
- Java Delta Kernel powers engines such as StarRocks and Apache Druid.

Both expose the same conceptual split, a protocol core plus an engine interface,
so the concepts on this page apply regardless of which one a given engine uses.

## Related

- [What is Delta Lake?](./what-is-delta-lake.md)
- [Table features](../reference/table-features.md)
