---
title: "Coverage data: what we collect and how we show it"
summary: Internal record of the compatibility and spec-coverage data the factory collects for Delta Lake and Unity Catalog, how each state is earned, and where each surface shows it.
diataxis: reference
project: open-lakehouse
references:
  - deltaSpec
  - icebergSpec
  - icebergRestSpec
status: private
---

This page describes the coverage data behind every compatibility table: what
we record, who authors each part, what a cell's state means, and which surface
shows which part to whom. It's private. It is the shared record to settle on
before the data goes on public pages, and the starting list for the proof
points still missing. The support itself lives in the generated tables of the
Delta [coverage record](../../delta/reference/090-coverage/index.md) and the
Unity Catalog
[clients and engines](../../unitycatalog/reference/002-clients-and-engines/index.md)
page, never here. The design and its history are in the
[journey graph design][graph].

## The two questions

The data answers two questions, from the same catalog:

| Question | Grid | A cell says |
| --- | --- | --- |
| **Client support:** can this engine or client do this task? | journey × interface | whether a tested script shows it works, fails, or only upstream docs say so |
| **Spec progress:** how much of a spec does this engine implement? | obligation × interface | the best answer among the journeys that cover the obligation, or that no journey tracks it yet |

The first is the one readers ask ("can I append to a managed table from
DuckDB?"). The second gives the first a denominator: the spec names what an
implementation owes, so a column's coverage isn't just the rows someone chose
to write.

## What we collect

Everything is authored once, estate-wide, under
[`architecture/journeys/`](../../../architecture/journeys/README.md), except
the claims (in the scripts) and the projections (per project).

| Unit | What it records | Where it lives | Authored or derived |
| --- | --- | --- | --- |
| Journey | A task a reader sets out to do: `title`, one-sentence `summary`, the `asset` it acts on, the `path` it takes, optional `roles`, and the obligations it `covers` | `journeys/<area>.yml` | authored |
| Feature | The first obligation a journey covers, with the protocol version it arrived in (`since`) | derived from `covers` | derived |
| Path | What each participant role (client, catalog, storage) must implement or consume to take part | `paths.yml` | authored |
| Interface | A column: the engine or client a reader picks, in the language they write (`spark-sql`, `duckdb-sql`), its model element, integrations, release pin, and an optional `via` | `interfaces.yml` | authored |
| Obligation | One thing a spec binds a role to (a Delta reader feature, an Iceberg REST endpoint) | `obligations/<spec>.yml` | authored |
| Equivalence | A Delta obligation paired with its Iceberg counterpart | `equivalences.yml` | authored |
| Claim | What a tested script proves for one interface and journey: works (with the `region` that shows it, `api`, `anchor`) or `fails` (with the asserted error) | `[tool.docs-factory] claims.<interface>` in each script | authored |
| Evidence | An answer no script here gives: upstream docs or source (`works`), or a known `fails` / `missing`, with `why` and `source` | `evidence.yml` | authored |
| Server fact | An obligation a provider (the Unity Catalog server) doesn't serve; it answers every journey that needs it | `evidence.yml`, with `implementation` and `obligations` | authored |
| Projection | Which interfaces a project shows (in tab order), its tables of journeys, and which implementation plays each provider role | `content/<project>/compatibility.yml` | authored |
| Matrix | Every resolved cell, engine report, and coverage report for a project | `content/<project>/compatibility.json` | derived |
| Catalog | Paths, journeys, specs, facts, and equivalences for the model explorer | `architecture/dist/journeys.json` | derived |

`uv run docsnip compat --fix` resolves the claims and evidence into the
derived files and re-renders every Markdown table; `uv run docsnip compat
--coverage` prints the current spec-coverage counts. Counts aren't copied
onto this page because they move with every claim.

## States and how a cell earns one

A cell's state comes from the strongest answer it has, in this order:

1. A claim from a script on a `ready` page. Its script gates CI, so the cell
   breaks when the engine changes. Two ready claims that disagree on a cell
   are an error.
2. A claim from a draft page. It counts only where drafts are shown (private
   pages and the review app), flagged as draft; its script runs as a
   non-strict xfail.
3. Evidence from `evidence.yml`, or a server fact.
4. Nothing: unknown.

| docsnip cell state | Meaning | Markdown | Docs sites bucket | Review app bucket |
| --- | --- | --- | --- | --- |
| `tested` | a script shows it works | ✓ | `proven` (`draft` if only a draft page shows it) | `tested` (`draft`) |
| `fails` | a script asserts the error, or evidence says it fails | ✗ | `no` | `fails` (`draft`, or `blocked` when a server fact causes it) |
| `missing` | evidence says the API doesn't exist | ✗ | `no` | `missing` (`blocked` when a server fact causes it) |
| `documented` | upstream docs or source say it works; not verified here | `docs` (only on tables that set `documented: true`, and on private pages) | `documented` | `documented` |
| `unknown` | nothing answers it | — | `unknown` | `unknown` |

Spec coverage adds two states per obligation: `blocked` (a provider doesn't
serve it, so no client can do it) and `untracked` (no journey in this column
covers the obligation, so nothing could answer it yet).

The three vocabularies line up but aren't defined in one place:
`docsnip.compat` owns the cell states, `site/src/content-core/coverage.mjs`
the docs-site buckets, and `site/src/lib/estate-graph.ts` the review-app ones.
One difference shows: a draft claim that a journey *fails* is `draft` in the
review app but `no` on the docs sites. Settle on one vocabulary before the data
goes public.

## Where each surface shows it

| Surface | What it shows | Audience | Hidden there |
| --- | --- | --- | --- |
| `compat:<table>` in a page | journeys × that project's interfaces | private pages; public once the page is `ready` | journey ids, draft claims, `api`, evidence links (shown on private pages only) |
| `compat:asset:<id>` | one asset's journeys across interfaces | public explanation pages | as above |
| `compat:interfaces` | each interface's implementation, contracts, and verified breadth | private | — |
| `compat:engines`, `compat:engine:<id>` | one row per engine, then each engine's journeys by group: verified, doesn't work, docs only, not verified | engine support pages | draft claims unless the site emits drafts |
| `compat:crosswalk` | Delta and Iceberg equivalences | private ([crosswalk](001-format-crosswalk/index.md)) | — |
| Docs sites | the engine embeds become an interactive matrix whose rows expand to their proof; the other embeds stay Markdown tables | readers | drafts, unpublished pages' links |
| Review app, Plan → Compatibility | every matrix, grouped, filtered, and expandable per cell | reviewers | — |
| Review app, Model | per implementation, path, journey, and spec, plus the crosswalk | reviewers | — |

What a public cell needs at a glance is its state and one link to the proof.
The API, notes, version, journey id, and evidence are details: expanded on
interactive surfaces, and footnotes on Markdown ones.

## What matters for Delta Lake

- **The spec is the Delta protocol** (`deltaSpec`): reader and writer table
  features, each with the protocol version it arrived in. "Which engine reads
  and writes which table feature" is the headline public question, and the
  obligations give it a denominator.
- **Journeys go by path** (`by-path`): an engine opens the table by its
  storage location, with no catalog in between.
- **Interfaces are engines in each language a reader writes:** Spark SQL,
  PySpark, Scala, and Java; delta-rs from Python and Rust; DuckDB SQL and
  Python.
- **Evidence carries most cells.** Most answers come from Spark's and the
  delta-rs crate's own docs and source (`documented`) rather than from scripts
  here, so the proof points still to write are mostly tested scripts that turn
  `docs` into ✓.
- The Delta coverage record also keeps a hand-written round-trip grid in its
  own vocabulary; it isn't generated yet.

## What matters for Unity Catalog

- **Journeys go through the catalog:** the Unity Catalog REST API (`uc-api`),
  managed and external tables (`uc-managed`, `uc-external`), and the Iceberg
  REST API (`iceberg-rest`, `iceberg-rest-api`).
- **Interfaces include catalog clients as well as engines:** the `uc` CLI, the
  Python and Java SDKs, unitycatalog-ai, and MLflow beside Spark, DuckDB,
  Polars, Daft, pandas, PyIceberg, and DataFusion.
- **Claims carry most cells**, including asserted failures: a script that
  shows an engine can't yet do something keeps that cell honest across
  releases.
- **Server facts block cells.** The server's missing Iceberg REST endpoints are
  recorded once and render as blocked for every client; a release that adds an
  endpoint flips them by deleting one entry.
- **Spec progress exists only for Iceberg REST** (`icebergRestSpec`). The Unity
  Catalog REST API and its Delta API have no obligations file, so their
  coverage has no denominator and lives only in the hand-written
  [features and limitations](../../unitycatalog/reference/001-features-and-limitations/index.md)
  page.

## Where they overlap

- **Shared journeys:** the managed and external table journeys
  (`managed.*`, `external.*`) appear in both projects. A Delta page that
  writes through Unity Catalog claims `managed.append`, the same cell the
  Unity Catalog docs show.
- **Shared interfaces:** Spark SQL, PySpark, and delta-rs Python are columns in
  both. A claim counts in every project that lists the interface and shows the
  journey, and each project's header shows its own pinned version.
- **Table-feature journeys** are a format obligation on any path, so they count
  wherever a project shows them.
- **The crosswalk** pairs Delta features with Iceberg ones; Iceberg support is
  read through Unity Catalog's Iceberg REST API.
- The tooling, catalog, and state vocabulary are one for both projects.

## Gaps and drift

The inputs for deciding which proof points to write next:

- The Unity Catalog REST API has no obligations, so its spec progress can't be
  counted.
- Obligations don't record whether a spec requires them or leaves them
  optional, so every obligation weighs the same in a denominator.
- The three state vocabularies above aren't defined in one place.
- [ADR-0009](../../../architecture/adr/ADR-0009-journeys-as-path-patterns.md)
  still reads Proposed although its phases are built, and section 2 of the
  [format compatibility plan][fcp] still uses `feature:` and `family`, which
  `covers` and `path` replaced.
- The review app's Model → Coverage page counts concepts without an
  explanation page, not compatibility coverage.

[graph]: https://github.com/open-lakehouse/docs-factory/blob/main/docs/design/journey-graph.md
[fcp]: https://github.com/open-lakehouse/docs-factory/blob/main/docs/design/format-compatibility-plan.md
