# Brief: Delta Lake

## 1. Article status

> **Baseline draft written:** [`drafts/delta-lake.draft.wiki`](./drafts/delta-lake.draft.wiki)
> (wikitext, target title `Delta Lake (software)`). Lead + History, Architecture,
> Governance & ecosystem, Relation to other formats. Deeper sections deferred.

**New article.** No standalone article exists. Current state on en.wikipedia.org:
`Delta Lake` is a **disambiguation page** (software + several geographic lakes);
`Delta Lake (Software)` (capital S) is a **redirect to `Databricks`**;
`Delta Lake (software)` (lowercase) is **404**. The topic is covered only within
`Databricks` and briefly in `Lakehouse`.

**Strategy:** create a new article, most likely at **`Delta Lake (software)`**;
update the disambiguation page to point to it and retarget the
`Delta Lake (Software)` redirect. Submit via AfC (see README COI section).

## 2. Notability assessment

Comfortably met. 8+ independent reliable outlets cover Delta Lake across
2019–2024 (TechCrunch, SiliconANGLE, InfoWorld, Datanami/BigDATAwire, The
Register, CNBC), plus a peer-reviewed VLDB 2020 paper and Linux Foundation
governance. Clean GNG pass.

## 3. Lead (what it must state)

- **Delta Lake** is an open-source storage framework / **open table format** that
  brings **ACID transactions**, scalable metadata, schema enforcement/evolution,
  and **time travel** to data stored as `Apache Parquet` files in cloud object
  storage; it underpins the **data lakehouse** architecture.
- Its core mechanism is a **transaction log** (the `_delta_log`, per the open
  `PROTOCOL.md` spec) recording atomic commits.
- **Developed at Databricks and released as open source in 2019**; contributed to
  the **Linux Foundation** (Oct 2019); remaining proprietary APIs open-sourced in
  **Delta Lake 2.0 (June 2022)**. Works with `Apache Spark`, Trino, Flink, and
  others.

## 4. Core sections (this iteration)

1. **History** — developed at Databricks (say "open-sourced 2019"; treat
   2016/2017 as *attributed* internal-development claims — sources disagree); LF
   donation 2019; 2.0 full open-sourcing 2022. Cite TechCrunch/SiliconANGLE (2019),
   InfoWorld/Datanami (2022), LF press release.
2. **Architecture / how it works** — transaction log (`_delta_log`), ACID commits,
   snapshots & time travel, schema enforcement/evolution. Anchor on the VLDB 2020
   paper (attributed) + PROTOCOL.md; keep protocol-version/deletion-vector detail
   for a later iteration (available in `../table-formats/report.md`).
3. **Governance & ecosystem** — Linux Foundation project; Apache-2.0; delta-io/delta;
   engine ecosystem (Spark, Trino, Flink, delta-rs/Python). Attribute adopter lists.
4. **Relation to other formats** — `Open table format` (parent concept),
   `Apache Iceberg`, `Apache Hudi`; UniForm interop; the Iceberg "format war" and
   convergence (attributed, no "winner").

## 5. Deferred sections (later iterations)

Table-features protocol (reader v3/writer v7), deletion vectors, kernels
(`delta-kernel-rs`, Java kernel), full engine support matrix, liquid clustering,
CDF — all covered with verified detail in `../table-formats/report.md`.

## 6. Cross-links

- **Out →** `Databricks`, `Apache Spark`, `Apache Parquet`, `Linux Foundation`,
  `Open table format` (parent), `Apache Iceberg`, `Apache Hudi` (red), `Lakehouse`/
  `data lakehouse`, `Unity Catalog`, `Matei Zaharia`.
- **In ←** `Databricks` already links here; `Lakehouse` already links here;
  **propose** reciprocal links from `Apache Iceberg` (currently links neither Delta
  nor Hudi) and from `Open table format` (our hub).

## 7. Databricks / founder linkage (evidence-led)

- Created at Databricks; open-sourced 2019; LF donation; 2.0 (2022) — all citeable
  to independent press + LF.
- **Michael Armbrust** — creator/lead of Delta Lake (also Spark SQL, Structured
  Streaming), first author of the **VLDB 2020** paper. *No WP article* → describe
  his role with an inline citation to the paper; do not red-link as notable.
- **Matei Zaharia** — has a WP article; last author on the VLDB paper (his article
  currently omits Delta — a link opportunity, not something to assert on his page
  here). **Ali Ghodsi** — co-author, main quoted figure in 2019 coverage.

## 8. Sources

Primary **(P):** delta.io, delta-io/delta + PROTOCOL.md, LF press release,
Databricks 2.0 blog. Semi-independent **(SP):** VLDB 2020 (DOI
10.14778/3415478.3415560). Independent **(S):** TechCrunch (2019), SiliconANGLE
(2019/2022), InfoWorld (2022), Datanami/BigDATAwire (2022), The Register (2024
"Snowflake claims Iceberg wins"), CNBC/TechCrunch (Tabular 2024). Full list +
URLs in [`sources.md`](./sources.md).

## 9. NPOV / COI cautions

- **Performance/"high-performance" claims** come from interested primaries (VLDB
  paper, delta.io) — attribute ("According to the 2020 VLDB paper…"), never assert
  benchmark superiority in WP voice; note the Delta/Iceberg feature gap narrowed
  since ~2023.
- **"Open" vs Databricks-governance** — the most contested axis. State LF
  governance and the 2022 full open-sourcing as facts; present the "who controls
  it" question as attributed viewpoints (InfoWorld 2022 noted parts were
  proprietary until 2.0; The Register 2024; Vanlightly "open vs closed" as
  attributed opinion).
- **Iceberg format-war framing** — high edit-war risk. Report dynamics with
  multi-side sourcing; declare no winner. Note Databricks acquired Tabular
  (Iceberg's creators, 2024) and frames its goal as convergence/interop.
- **Adopter counts** — attribute; TechCrunch (2019) explicitly noted "no
  independent verification" of adopter claims.
