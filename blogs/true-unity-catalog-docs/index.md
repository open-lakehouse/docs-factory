---
title: The `true` Unity Catalog docs
slug: true-unity-catalog-docs
status: draft
tags: [unity-catalog, delta-lake, lakehouse]
author: Robert Pack
target: [unitycatalog, openlakehouse]
post_type: deep-dive
audience: Data and platform engineers evaluating Unity Catalog OSS who have read conflicting claims about what works with it
summary: Every claim in the Unity Catalog docs is a script CI runs against the pinned release, so what works, and what doesn't, is proven rather than asserted.
---

:::tldr
- Every code block is a marked region of a runnable script that sits next to
  the page and runs in CI.
- Compatibility tables are rendered from claims the scripts make. A claim
  that something *fails* is tested too, so CI notices when an engine adds
  support.
- The deployments the docs describe (a local server, simulated S3 with
  PostgreSQL) are generated environments, and the scripts run against them.
- One release manifest pins every version. A bump means a full CI run plus a
  review of every claim the new release can change.
:::

There is much discussion and even contention in the larger Lakehouse community
around what works and what doesn't with which services, especially around catalog
implementations. At the same time the open source implementation of Unity Catalog
is evolving very quickly and so are client implementations. So the answers to these
questions in continuously evolving.

The Unity Catalog docs state only what a script has proven. Every code block
on a page is a region of a script that CI runs against the pinned release,
Unity Catalog 0.7.0 today.

## Prove it or don't write it

Ask in any lakehouse community channel whether engine X works with catalog Y
and you'll get three answers. One comes from a slide deck from two releases
ago. One comes from someone who tried it once on their laptop. One says "it's
on the roadmap". All three are delivered with the same confidence. Then the
question gets asked again a month later, because nobody can tell which answer
was right.

At Databricks we're taught to be truth-seeking: find out what's actually true,
and say that, even when it's less flattering than the pitch. For docs, I think
that comes down to one rule. **A page may only state what something in the
repository has proven.** If we can't prove it, we don't write it. If we prove
it fails, we write that down too, with the error message.

The rest of this post is the machinery that enforces the rule. We built it for
the restructured Unity Catalog and Delta Lake docs.

## Every code block is a test

A docs page never contains code that only exists on the page. Each page that
shows code is a folder: the page's `index.md` sits next to a directory of
runnable scripts. The page holds an empty code fence whose info string points
at a region of a script, and the renderer pulls that region in at build time:

```text
python file=./snippets/duckdb_tables.py start=start:append end=end:append
```

None of this is new. mdBook's `include` anchors and MkDocs' snippets have
pulled regions of real files into pages for years, and Python's doctest and
Rust's doc tests run the examples a page shows. We borrowed the idea. What we
add is the rule that a page may hold no other kind of code.

Inside the script, region markers wrap exactly what the reader should see.
Setup, teardown, and the assertions that make the script a test stay outside
the markers. Each Python script declares its own dependencies with
[PEP 723](https://peps.python.org/pep-0723/) inline metadata, so `uv run`
installs what the file you download from the docs needs. A script that talks
to a server also needs a Docker Compose environment, and the docs offer that
for download too (more on those environments below):

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb==1.5.4", "pyspark==4.1.0", "unitycatalog-client==0.7.0"]
# ///
```

Our validator, `docsnip check`, fails the build when a fence points at a
region that doesn't exist. There's nothing to copy, so code can't drift away
from the test. If the page shows it, CI ran it.

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

A small pytest plugin of our own, `content/conftest.py`, collects every
script and sorts it into a CI lane by what it needs. It's plain pytest,
nothing you couldn't write yourself. A default lane runs scripts that need
nothing beyond their own dependencies, and separate lanes cover Spark, the
JVM, Rust, and Docker-backed services.

Pages under review run as expected failures. A draft can be broken while
someone works on it, but it can't break main. Once a page is approved and
marked ready, its scripts gate every merge.

## Claims, not adjectives

"DuckDB supports Unity Catalog" is an adjective. It doesn't say which
operations, against which kind of table, at which version. So the docs don't
say it. A script states what it proves instead, in its metadata:

```python
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# claims.duckdb = [
#   { journey = "table.list", region = "list" },
#   { journey = "managed.read", region = "query" },
#   { journey = "managed.append", region = "append" },
#   { journey = "managed.create", fails = true, anchor = "create-change-and-drop-tables" },
#   { journey = "managed.update", fails = true, anchor = "create-change-and-drop-tables" },
# ]
```

A *journey* is something a reader sets out to do, like reading a managed
table or appending to one, however many calls it takes. The Unity Catalog and
Delta Lake matrices already track more than 200 journeys, across engines and
clients like Spark, DuckDB, Polars, Daft, pandas, PyIceberg, `delta-rs`,
MLflow, and the Unity Catalog CLI and SDKs, and the list keeps growing.
`docsnip compat --fix` renders the compatibility tables on the docs pages
from these claims, and `docsnip check` fails when a table on a page is stale. Nobody edits a ✓ by hand.

Each ✓ links to the section of the page whose code proves it. If you doubt a
cell, you can read the code and run it.

## A failure is a fact too

The `fails = true` lines above matter as much as the others. When the harness
records that DuckDB 1.5.4 can't create a Unity Catalog table, the script
asserts the failure, and when the claim names an error string, that string
has to appear in the script. The day a DuckDB release adds `CREATE TABLE`
support, the assertion breaks and CI flags the cell. A ✗ in our tables isn't
"we didn't try". It's "we tried, here's what happened, and we'll know when
that changes."

Some cells nothing in the repo can prove, like a feature the server doesn't
have at all. Those carry explicit evidence: an outcome, a reason, a source
link, and the release it was verified against.

Every limitation a reader might hit lives on one page,
[Features and limitations](https://docs.unitycatalog.io/reference/features-and-limitations/),
not scattered as footnotes across tutorials. Each known issue says which
release it affects, what you see, and how to get around it:

| Client | Issue | What you see |
| --- | --- | --- |
| DuckDB 1.5.4 | `CREATE TABLE`, `CREATE TABLE … AS SELECT`, `DROP TABLE` | `Not implemented Error` |
| Polars, Daft, pandas (`deltalake`) | Catalog-managed tables | `Max catalog version is required when loading a catalog-managed table` |

Pages lead with what works, and link to that page when a limitation blocks
their task. This is the part I care about most for the community discussion.
"Unity Catalog OSS doesn't support X" usually has a much narrower true
version: one engine, one table type, one release. We publish the narrow
version, and we let the broad myth die.

## Deployments are tested like clients

Client code isn't the only thing people get wrong about a catalog. "Can I run
it on S3?", "does it vend credentials?", and "can it use PostgreSQL?" are
questions about deployment architecture, and they get the same treatment.

The docs describe a small set of environments: a local Unity Catalog server,
and the same server with simulated S3 and PostgreSQL. We don't hand-write
those environments. A pinned version of [Trestle](https://github.com/open-lakehouse/trestle),
our environment generator, produces each one from a declared configuration and
writes the compose file, its plan, and a model of what it runs. All of that is
committed and regenerated as a unit. A registry records, for each environment,
what the reader starts, which ports it binds, and the variables a client needs.

A script names the environment it needs. The harness starts that stack, hands
the script exactly the variables the reader is told to export, runs it, and
tears the stack down. The commands at the top of a tutorial that start the
environment come from the same registry, and the environment bundle a reader
downloads is the one CI used.

Because the environments are generated rather than hand-written, the docs can
do more with them than list a compose file. Each one comes with a model of
what it runs, so a page can draw the stack instead of describing it. This is
the richest one today, the environment behind the MLflow pages:

```trestle uc-mlflow
A gateway routes the Unity Catalog API to the Unity Catalog server and the MLflow API to the MLflow tracking server, which serves its model registry from Unity Catalog. Both keep metadata in one PostgreSQL server (separate `unitycatalog` and `mlflow` databases) and files in RustFS, a simulated S3 (`amzn-s3-demo-bucket` and `mlflow` buckets).
```

The diagram on the docs site is interactive, and it comes from the same
generated files the tests start. Each environment is also a download of its
own, `/env/<name>.tar.gz`, holding the compose file, the configuration, and a
deployment guide. So you can start the stack a page describes, run its
scripts, and see what CI saw.

## Metadata that keeps pages honest

The pipeline only works if every page is honest about what it is, and
metadata is how we keep that machine-checkable:

- **Frontmatter.** Every page declares a `title`, a
  [Diátaxis](https://diataxis.fr/) type (tutorial, how-to, reference, or
  explanation), a `project`, and a `status`. The validator rejects values
  outside the controlled vocabulary.
- **Navigation.** A per-project `nav.yml` curates the sidebar. A page that
  isn't listed fails the build, and so does a duplicate. Gaps that reviewers
  have asked for become `planned:` entries, so a missing page is visible as
  missing.
- **One release manifest.** `release.yml` names the Unity Catalog release and
  every companion pin: the Python client, `pyspark`, `delta-spark`, Iceberg.
  `docsnip check` fails on any pin in the content or environments that
  disagrees with it, and `just bump-uc <version>` rewrites them all. Pages
  don't repeat the release number in prose, so a bump can't leave a stale
  "as of 0.6" behind.
- **A release review.** A green CI run after a bump isn't the end. The
  claims a release can change, such as support states, known issues, and
  "the server has no X", get re-read on purpose before the bump merges.

## A renderer that only shows what's proven

The source is plain, builder-agnostic Markdown. It reads fine on GitHub, and
all the richness comes from the renderer. We wrote our own emitter rather
than bending a docs framework to the rules above. It resolves every snippet
fence, renders the compatibility tables and environment commands, and writes
static docs sites for Unity Catalog and Delta Lake that share one shell.

Two choices follow from the thesis:

- **Only `ready` pages publish.** Drafts, and anything marked private, stay in
  the review app. A table embedded on a published page shows only claims from
  published scripts.
- **Agents read the same proven content.** Every page gets a Markdown twin,
  and the site publishes an `llms.txt`. The scripts are served whole and
  written for the person who downloads them. An assistant answering "does
  DuckDB work with Unity Catalog?" from our docs gets the same narrow, tested
  answer you do.

Because everything is generated from the scripts, the release manifest, and
the environment registry, keeping the docs current isn't a separate chore.
Change the engine version and the tables, known issues, and commands follow,
or CI tells you which claim stopped being true.

## Up to the agentic lakehouse

:::note[Before publishing]
This section is a placeholder. Coverage up to the agentic lakehouse (agents,
MCP tools, and AI functions governed by Unity Catalog) is still being built.
Replace this with what it proves, tested the same way, before this post ships.
:::

Today the docs cover the core: catalogs, schemas, tables, volumes, functions,
credentials and storage, the Delta and Iceberg REST APIs, and the engines that
use them. Our plan is to extend the same contract all the way to the agentic
lakehouse: agents and their tools, governed by the catalog, in deployments we
generate and test. Every journey along the way gets a script, a claim, and a
cell, and nothing ships without them.

## What to do with this

Next time you read that something doesn't work with Unity Catalog, or that it
does, check the compatibility tables on
[docs.unitycatalog.io](https://docs.unitycatalog.io/) and follow the cell to
the code. Run it. If our answer is wrong, we'd like to know:
[open an issue](https://github.com/open-lakehouse/docs-factory/issues/new)
with a script that shows it. A failing script is the most useful bug report
we can get, because it becomes a test and the table changes the day it passes.
