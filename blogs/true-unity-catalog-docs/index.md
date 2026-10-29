---
title: "Trust but Verify: Building the New Unity Catalog Documentation"
slug: true-unity-catalog-docs
status: draft
tags: [unity-catalog, delta-lake, lakehouse]
author: Robert Pack
target: [unitycatalog, openlakehouse]
post_type: deep-dive
audience: Data and platform engineers evaluating Unity Catalog OSS who have read conflicting claims about what works with it
summary: Every runnable example in the Unity Catalog docs is a script CI runs against the pinned release, so what works, and what doesn't, is proven, not asserted.
---

:::tldr
- Every runnable example on a page is a marked region of a script that sits
  next to the page and runs in CI. The few other blocks, session commands and
  printed output, are labeled as what they are.
- Compatibility tables are rendered from claims the scripts make. A claim
  that something *fails* is tested too, so when we bump to a release that
  adds support, CI flags the cell.
- The deployments the docs describe (a local server, simulated S3 with
  PostgreSQL) are generated environments, and the scripts run against them.
- One release manifest pins the server and every declared client version. A
  few inputs still move, like DuckDB's nightly `unity_catalog` extension, and
  the nightly CI run catches it when they break.
:::

The Unity Catalog docs state only what a script has proven. Every runnable
example on a page is a region of a script that CI runs against the pinned
release, Unity Catalog 0.7.0 today. If the docs say DuckDB can append to a
managed table, a script appended to one. If they say DuckDB can't create one, a
script tried, and asserted the error. Trust, but verify: you shouldn't have to
take our word for any of it, so every tested claim comes with the script that
checked it.

## Prove it or don't write it

Ask in any lakehouse community channel whether engine X works with catalog Y
and you'll get three answers. One comes from a slide deck from two releases
ago. One comes from someone who tried it once on their laptop. One says "it's
on the roadmap". All three are delivered with the same confidence. Then the
question gets asked again a month later, because nobody can tell which answer
was right. And the ground keeps moving: the open source server ships fast, and
so do the clients, so last quarter's right answer can be wrong today.

At Databricks we're taught to be truth-seeking: find out what's actually true,
and say that, even when it's less flattering than the pitch. For docs, I think
that comes down to one rule. **A page may only state what something in the
repository has proven.** If we can't prove it, we don't write it. If we prove
it fails, we write that down too, with the error message.

The rest of this post is the machinery that enforces the rule, and the places
where it stops. We built it for the restructured Unity Catalog and Delta Lake
docs.

## Every code block is a test

A docs page never contains example code that only exists on the page. Each
page that shows code is a folder: the page's `index.md` sits next to a
directory of runnable scripts. The page holds an empty code fence whose info
string points at a region of a script, and the renderer pulls that region in at
build time:

```text
python file=./snippets/duckdb_tables.py start=start:append end=end:append
```

None of this is new.
[mdBook's `include` anchors](https://rust-lang.github.io/mdBook/format/mdbook.html#including-portions-of-a-file)
and the
[MkDocs snippets extension](https://facelessuser.github.io/pymdown-extensions/extensions/snippets/)
have pulled regions of real files into pages for years, and Python's
[doctest](https://docs.python.org/3/library/doctest.html) and Rust's
[documentation tests](https://doc.rust-lang.org/rustdoc/write-documentation/documentation-tests.html)
run the examples a page shows. We borrowed the idea. What we add is the rule:
every runnable example on a page is a script region CI runs.

A page holds two other kinds of block, and I won't pretend otherwise. One is
the literal command that opens a session, like
`uv run --with duckdb==1.5.6 python`, whose pin the validator checks against
the release manifest. The
other is printed output, labeled as output, which shows what the script
printed and whose rows the script asserts. Neither is code you're asked to
take on faith.

Inside the script, region markers wrap exactly what the reader should see.
Setup, teardown, and the assertions that make the script a test stay outside
the markers. Each Python script declares its own dependencies with
[PEP 723](https://peps.python.org/pep-0723/) inline metadata, so `uv run`
installs what the file you download from the docs needs. This is the top of
[the DuckDB page's script](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/content/unitycatalog/how-to/008-duckdb/snippets/duckdb_tables.py):

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.6", "pyspark==4.1.0", "unitycatalog-client==0.7.0"]
# …
# ///
```

A script that talks to a server also needs a Docker Compose environment, and
the docs offer that for download too (more on those environments below).

Our validator, `docsnip check`, fails the build when a `file=` fence points at
a region that doesn't exist. There's nothing to copy, so example code can't
drift away from the test. If a page shows an example, CI ran it.

## One harness, many languages

Readers don't all write Python, so the harness doesn't assume they do. Today
the docs run:

| Language | How it runs |
| --- | --- |
| Python | PEP 723 scripts, run with `uv` |
| Shell and SQL | Region-marked files driven by a Python harness that runs each region and checks its output |
| Scala | `scala-cli`, with `//> using dep` lines for dependencies |
| Java | JBang, with `//DEPS` lines |
| Rust | Examples in a snippets crate, run with `cargo run --example` |

A small pytest plugin of our own,
[`content/conftest.py`](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/content/conftest.py),
collects every script and sorts it into a CI lane by what it needs. It's plain
pytest, nothing you couldn't write yourself. A default lane runs scripts that
need nothing beyond their own dependencies, and separate lanes cover Spark,
the JVM, Rust, and Docker-backed services.

Only scripts on `ready` pages gate. A draft page's scripts still run, but as
non-strict expected failures: a broken draft shows up as a warning in the run,
not a red build. A pull request runs the scripts its changes reach, which
impact analysis selects. Main, the nightly run, and manual runs execute the
whole suite.

## Claims, not adjectives

"DuckDB supports Unity Catalog" is an adjective. It doesn't say which
operations, against which kind of table, at which version. So the docs don't
say it. A script states what it proves instead, in its metadata (abridged from
`duckdb_tables.py`):

```python
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# claims.duckdb-sql = [
#   { journey = "table.list", region = "list" },
#   { journey = "managed.read", region = "query" },
#   { journey = "managed.append", region = "append", api = "INSERT INTO" },
#   { journey = "managed.create", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.update", fails = true, anchor = "create-change-and-drop-tables" },
#   # …
# ]
```

A *journey* is something a reader sets out to do, like reading a managed
table or appending to one, however many calls it takes. The Unity Catalog and
Delta Lake matrices already track more than 200 journeys, across engines and
clients like Spark, DuckDB, Polars, Daft, pandas, PyIceberg, `delta-rs`,
MLflow, and the Unity Catalog CLI and SDKs, and the list keeps growing.
`docsnip compat --fix` renders the compatibility tables on the docs pages
from these claims, and `docsnip check` fails when a table on a page is stale.
Nobody edits a ✓ by hand.

Each ✓ links to the section of the page whose code proves it. If you doubt a
cell, you can read the code and run it.

Journeys are also how I measure coverage, and I'm adding them on purpose, not
when someone happens to ask. Each journey names the spec obligations it
exercises, from the Delta protocol, the Iceberg table spec, and the Iceberg
REST spec. `docsnip compat --coverage` measures every engine against those
specs, not against the rows we chose to write. That report is humbling. It
shows engines where most of a spec is still unanswered, and those gaps are
the work list. The goal is full coverage: every obligation answered for every
engine we document, with a ✓, a ✗, or a documented cell.

## A failure is a fact too

The `fails = true` lines above matter as much as the others. When the harness
records that DuckDB 1.5.6 can't create a Unity Catalog table, the script
asserts the failure, and when the claim names an error string, that string
has to appear in the script. When we bump the DuckDB pin to a release that
adds `CREATE TABLE` support, the assertion breaks and CI flags the cell. A ✗
in our tables isn't "we didn't try". It's "we tried, here's what happened, and
we'll know when that changes."

Some cells nothing in the repo can prove, like a feature the server doesn't
have at all. Those carry explicit evidence in the matrix definitions that
[`docsnip compat`](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/tools/docsnip/src/docsnip/compat.py)
reads: an outcome, a reason, a source link, and the release it was verified
against. They render as documented, not tested, and a script's claim always
beats them.

Every limitation a reader might hit lives in one place, the tested support
record we keep in the repo,
[`features-and-limitations`](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/content/unitycatalog/reference/001-features-and-limitations/index.md),
not scattered as footnotes across tutorials. Each known issue names the client
and version it affects and what you see. Two rows from it, with the path that
does work:

| Client | Issue | What you see | Working path |
| --- | --- | --- | --- |
| DuckDB 1.5.6 | `CREATE TABLE`, `CREATE TABLE … AS SELECT`, `DROP TABLE` | `Not implemented Error` | Create the table with Spark, then read and append from DuckDB, as the DuckDB script does |
| Polars, Daft, pandas (`deltalake`) | Catalog-managed tables | `Max catalog version is required when loading a catalog-managed table` | Use Spark or DuckDB |

A page doesn't send you off to that record. When a limitation blocks its
task, it says so inline, in one sentence, and points to the path that works.
This is the part I care about most for the community discussion. "Unity
Catalog OSS doesn't support X" usually has a much narrower true version: one
engine, one table type, one release. We publish the narrow version, and we
let the broad myth die.

That rule has limits, and I'd rather name them than have you find them. A
cell is proven against the pinned release and nothing else: a ✓ for DuckDB
1.5.6 says nothing about 1.4. Documented cells rest on hand-recorded evidence
and a source link, not a run. And some problems are intermittent enough that
no test pins them. DuckDB's Iceberg extension sometimes fails a second write
in a session with an HTTP 409, on a long-running server but not on a fresh
one. That issue is in the record with a workaround, but no assertion guards
it.

## Deployments are tested like clients

Client code isn't the only thing people get wrong about a catalog. "Can I run
it on S3?", "does it vend credentials?", and "can it use PostgreSQL?" are
questions about deployment architecture, and they get the same treatment.

The docs describe a small set of environments: a local Unity Catalog server,
and the same server with simulated S3 and PostgreSQL. We don't hand-write
those environments.
[Trestle](https://github.com/open-lakehouse/trestle/releases/tag/olai-trestle-v0.0.14),
our environment generator, pinned to `olai-trestle` v0.0.14 in
[`envs/trestle.toml`](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/envs/trestle.toml),
produces each one from a declared configuration and writes the compose file,
its plan, and a model of what it runs. All of that is committed and
regenerated as a unit. A registry records, for each environment, what the
reader starts, which ports it binds, and the variables a client needs.

A script names the environment it needs. The harness starts that stack, hands
the script exactly the variables the reader is told to export, runs it, and
tears the stack down. The commands at the top of a tutorial that start the
environment come from the same registry, and the
[environment bundle](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/emit/docs/env-bundle.mjs)
a reader downloads is the one CI used.

Because the environments are generated rather than hand-written, the docs can
do more with them than list a compose file. Each one comes with a model of
what it runs, so a page can draw the stack instead of describing it. This is
the richest one today, the environment behind the MLflow pages:

```trestle uc-mlflow
A gateway routes the Unity Catalog API to the Unity Catalog server and the MLflow API to the MLflow tracking server, which serves its model registry from Unity Catalog. Both keep metadata in one PostgreSQL server (separate `unitycatalog` and `mlflow` databases) and files in RustFS, a simulated S3 (`amzn-s3-demo-bucket` and `mlflow` buckets).
```

One honest caveat about this one: it isn't stock upstream wiring. The tested
configuration registers a
[generated Unity Catalog registry adapter](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/envs/uc-mlflow/modules/mlflow/uc-registry/trestle_mlflow_uc_registry.py)
with the MLflow server. The server sends an empty filter and an empty ordering
where the store expects none, and the store rejects them as unsupported, so
the adapter turns them back into unset values.

The diagram on the docs site is interactive, and it comes from the same
generated files the tests start. Each environment is also a download of its
own, `/env/<name>.tar.gz`, holding the compose file, the configuration, and a
deployment guide. So you can start the stack a page describes, run its
scripts, and see what CI saw.

## Metadata that keeps pages honest

Every page declares what it is in metadata the validator checks, so a page
that misstates its type, its place, or its versions fails the build:

- **Frontmatter.** Every page declares a `title`, a
  [Diátaxis](https://diataxis.fr/) type (tutorial, how-to, reference, or
  explanation), a `project`, and a `status`. The validator rejects values
  outside the controlled vocabulary.
- **Navigation.** A per-project `nav.yml` curates the sidebar. A page that
  isn't listed fails the build, and so does a duplicate. Gaps that reviewers
  have asked for become `planned:` entries, so a missing page is visible as
  missing.
- **One release manifest.**
  [`release.yml`](https://github.com/open-lakehouse/docs-factory/blob/1b1bbbfff415387f8dacddc588aabd0be56d36b9/content/unitycatalog/release.yml)
  names the Unity Catalog release and every declared companion pin: the
  Python client, `pyspark`, `delta-spark`, DuckDB, Iceberg. `docsnip check`
  fails on any pin in the content or environments that disagrees with it, and
  `just bump-uc <version>` rewrites them all. Pages don't repeat the release
  number in prose, so a bump can't leave a stale "as of 0.6" behind. What
  the manifest doesn't declare, it can't pin: the DuckDB script installs the
  `unity_catalog` extension from DuckDB's `core_nightly` channel, so that
  input moves under us, and the nightly run is what catches it.
- **A release review.** A green CI run after a bump isn't the end. The
  claims a release can change, such as support states, known issues, and
  "the server has no X", get re-read on purpose before the bump merges.

## A renderer that only shows what's proven

Only `ready` pages publish. Drafts, and anything marked private, stay in the
review app, and a table embedded on a published page shows only claims from
published scripts. We wrote our own emitter rather than bending a docs
framework to that rule. The source stays plain, builder-agnostic Markdown that
reads fine on GitHub. The emitter resolves every snippet fence, renders the
compatibility tables and environment commands, and writes static docs sites
for Unity Catalog and Delta Lake that share one shell.

Agents read the same proven content. Every page gets a Markdown twin, the site
publishes an `llms.txt`, and the scripts are served whole, written for the
person who downloads them. An assistant answering "does DuckDB work with Unity
Catalog?" from our docs gets the same narrow, tested answer you do.

Because the tables and commands are generated from the scripts, the release
manifest, and the environment registry, keeping them current isn't a separate
chore. Bump a pin and CI reruns every assertion and regenerates the tables, or
tells you which claim stopped being true. What CI can't reread is prose: a
known issue or a "the server has no X" sentence survives a bump untouched,
which is exactly why the release review exists.

## What to do with this

Next time you read that something doesn't work with Unity Catalog, or that it
does, check the compatibility tables on
[docs.unitycatalog.io](https://docs.unitycatalog.io/) and follow the cell to
the code. Then run it. Say the cell is DuckDB appending to a managed table.
The ✓ links to the DuckDB page, whose code comes from `duckdb_tables.py`. Save
that script, then download and start the local environment the page uses, as
the script's docstring says:

```bash
curl -fsSL https://docs.unitycatalog.io/env/unitycatalog.tar.gz | tar -xz
cd uc-docs-env/unitycatalog && docker compose up -d --wait
```

Then run the script from wherever you saved it:

```bash
uv run duckdb_tables.py
```

The first run needs Java 17, because DuckDB can't create the table it reads,
so the script seeds one with Spark first. If it exits cleanly, every assertion
behind that row held on your machine: DuckDB listed, read, and appended to a
catalog-managed table, the server accepted the append as a new version, and
the operations marked ✗ failed with exactly the errors the script asserts.

If our answer is wrong, we'd like to know:
[open an issue](https://github.com/open-lakehouse/docs-factory/issues/new)
with a script that shows it. A failing script is the most useful bug report
we can get, because it becomes a test, and the table changes when it passes.
