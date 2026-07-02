# Wikipedia article briefs — Open Lakehouse technologies

**Status:** research/planning docs. These briefs fix *what* each article will
cover and collect vetted evidence. **No article prose is written here** — that
comes in a later iteration.

**Date:** 2026-07-02. All Wikipedia state checks are against en.wikipedia.org as
of that date and should be re-confirmed before editing (articles change).

## Goal & guardrails

Produce genuinely well-written, balanced, educational Wikipedia articles about
the core technologies of the open lakehouse. Databricks invented the lakehouse
concept and originated several of these projects, so honest attribution will
naturally surface Databricks, its founders, and its papers. The linkage goal is
served by **evidence-led citation, not promotion**.

Scope this iteration: **lead + a small set of core sections only**. Deeper
coverage (full feature matrices, criticism sections, adoption tables) is deferred
to later iterations and listed per brief under "Deferred sections."

## The four briefs

| Brief | Topic | Wikipedia strategy |
|---|---|---|
| [`data-lakehouse.md`](./data-lakehouse.md) | Data lakehouse / Open Lakehouse | **Expand** the existing `Lakehouse` stub + fix the `Data lakehouse` redirect |
| [`open-table-format.md`](./open-table-format.md) | Open table format (concept hub) | **New** hub article, scoped vs `Lakehouse` |
| [`delta-lake.md`](./delta-lake.md) | Delta Lake | **New** article (target title `Delta Lake (software)`) |
| [`unity-catalog.md`](./unity-catalog.md) | Unity Catalog | **New** standalone + documented Databricks-section fallback |

Consolidated, deduped, source-tagged reference list: [`sources.md`](./sources.md).

## Cross-link map (target end state)

```
        Data warehouse ──┐                    ┌── Apache Spark
        Data lake ───────┤                    │
                         ▼                     ▼
                   [Data lakehouse] ◄────► [Databricks] ◄──── Matei Zaharia, Ali Ghodsi
                         │  ▲                  ▲
                         ▼  │                  │
                 [Open table format] ──────────┤
                    │    │    │    │            │
                    ▼    ▼    ▼    ▼            ▼
             [Delta Lake] Apache  Apache   Apache    [Unity Catalog]
                  │      Iceberg  Hudi(red) Paimon(red)   │
                  └──── Apache Parquet ◄──────────────────┘
```

Bracketed `[...]` = our four briefs. Unbracketed = existing WP articles.
`(red)` = article does not yet exist (red link).

**Existing articles to cross-link (confirmed titles):** `Data lake`,
`Data warehouse`, `Databricks` (mature, ~92 refs), `Apache Iceberg` (full — but
does *not* currently reciprocate links to Delta Lake/Hudi), `Apache Parquet`
(full), `Apache Spark`, `Matei Zaharia`, `Ali Ghodsi`, `Lakehouse` (stub).

**Red links / gaps (do not link as if they exist):** `Apache Hudi`,
`Apache Paimon`, `Michael Armbrust`, `Reynold Xin`.

**Cross-link discipline:** every out-link one brief declares must have a matching
in-link note in the brief it points to. This is a verification criterion (below).

## Databricks / founder linkage — honest, citeable anchors

Used across the briefs; each is a *cited fact*, attributed in-text, never stated
in Wikipedia's own voice as praise.

- **Term origin.** Databricks coined "data lakehouse"; founding paper is
  **CIDR 2021**, *"Lakehouse: A New Generation of Open Platforms that Unify Data
  Warehousing and Advanced Analytics"* (Armbrust, Ghodsi, Xin, Zaharia).
- **People with WP articles → link them:** `Matei Zaharia` (co-founder/CTO, Spark
  creator — his article currently omits lakehouse/Delta, a gap) and `Ali Ghodsi`
  (co-founder/CEO). **Michael Armbrust** (Delta Lake + Spark SQL creator, lead
  author of both papers) and **Reynold Xin** have *no* articles → describe their
  roles with inline citations, do not red-link them as if independently notable.
- **Delta Lake:** created at Databricks, open-sourced 2019, donated to the
  **Linux Foundation** (Oct 2019), fully open-sourced in **2.0 (June 2022)**;
  peer-reviewed **VLDB 2020** paper.
- **Unity Catalog:** created by Databricks (managed, ~2021); **open-sourced
  June 12 2024** (Apache 2.0, Data+AI Summit); donated to **LF AI & Data**
  (Jun 20 2024); peer-reviewed **SIGMOD 2025** paper.
- **The strongest cross-format linkage:** Databricks **acquired Tabular**
  (June 2024, "over $1B"; later reports ~$2B) — Tabular was founded by Ryan Blue,
  Dan Weeks, and Jason Reid, the **Netflix creators of Apache Iceberg**. So
  Databricks is simultaneously the creator of Delta, the acquirer of the leading
  Iceberg company, and the driver of interop (**UniForm**, UC OSS). This is well
  documented in *independent* press (TechCrunch, CNBC, The Register, Blocks & Files)
  and belongs in the articles sourced to that press, not to Databricks blogs.

## COI & editing workflow (read before editing mainspace)

These briefs originate in a Databricks-adjacent context and cover Databricks
technologies. Wikipedia's conflict-of-interest rules apply directly.

- **Disclose.** Editors with a Databricks affiliation must comply with
  **[WP:COI](https://en.wikipedia.org/wiki/Wikipedia:Conflict_of_interest)** and,
  if editing as part of paid employment,
  **[WP:PAID](https://en.wikipedia.org/wiki/Wikipedia:Paid-contribution_disclosure)**
  (a mandatory, non-optional disclosure of employer/client/affiliation on the user
  page and relevant Talk pages).
- **Do not edit mainspace directly on Databricks-related articles.** Instead:
  - For **new** articles (Delta Lake, Open table format, Unity Catalog): submit via
    **[Articles for Creation (AfC)](https://en.wikipedia.org/wiki/Wikipedia:Articles_for_creation)**
    as a Draft for independent reviewer approval.
  - For **existing** articles (expanding `Lakehouse`, fixing the `Data lakehouse`
    redirect, adding reciprocal links from `Databricks`/`Apache Iceberg`): use
    **Talk-page edit requests** (`{{edit COI}}` /
    **[WP:ER](https://en.wikipedia.org/wiki/Wikipedia:Edit_requests)**) rather than
    editing the article yourself.
- **Build from independent sources.** Every article must be constructible from the
  **independent secondary sources** in each brief plus attributed primaries. Vendor
  blogs (delta.io, databricks.com, unitycatalog.io, snowflake.com) are usable only
  for uncontroversial technical description, always attributed, and never as the
  basis for notability or evaluative claims.
- **Neutral tone.** Avoid **[WP:PEACOCK](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch)**
  language ("revolutionary," "next-generation," "industry's only"). Attribute
  contested claims ("According to the 2020 VLDB paper…"; "Databricks states…").

## Shared methodology

- Reuse the internal deep-research in
  [`../table-formats/report.md`](../table-formats/report.md) for Delta/Iceberg
  protocol facts, kernels, UC managed-vs-OSS surface, and interop — but its
  single-source `[S]` claims (mostly from vendor docs) must be **re-anchored on
  independent secondary sources** or dropped before appearing in a Wikipedia article.
- Source tiers: **(P)** primary/interested (project sites, vendor blogs, first-party
  papers) — citeable but not notability-bearing; **(S)** independent secondary
  (tech press, analysts, peer-reviewed third-party) — carry notability and neutral
  framing; **(SP)** semi-independent (peer-reviewed but authored by an interested
  party, e.g. the VLDB/SIGMOD papers) — good for technical facts, weak for neutrality.

## Verification criteria for these briefs

1. Every cited URL resolves and supports the claim attached to it (spot-check).
2. Each brief's notability section lists ≥3 independent secondary **(S)** sources.
3. The cross-link map is internally consistent — every declared out-link has a
   matching in-link note in the target brief.
4. Every brief has a non-empty NPOV/COI section.
5. The three known caveats are resolved before the affected facts are cited:
   - CIDR 2021 author order & page numbers (source PDF not directly parseable).
   - Tabular price: state "over $1 billion" (June 2024); attribute the ~$2B figure.
   - A couple of comparison/academic-preprint sources need venue/peer-review
     confirmation before use.
