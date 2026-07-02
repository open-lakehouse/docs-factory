# Brief: Open table format (concept hub)

## 1. Article status

**New hub article.** `Open table format` and `Table format` do not exist on
en.wikipedia.org (404, no redirect). The concept is currently described only
*inside* `Lakehouse` ("built on open table formats such as Delta Lake, Apache
Iceberg, or Apache Hudi, … layered over open file formats such as Apache
Parquet"). This is a genuine content gap.

**Biggest structural risk: WP:CONTENTFORK vs `Lakehouse` and `Data lake`.** Scope
this article tightly as the **storage-layer table abstraction** (the metadata
layer over open file formats), and let `Lakehouse` own the *architecture* and
`Apache Parquet` own the *file format*. Cross-link rather than duplicate.

## 2. Notability assessment

Defensible. The concept has a recognized name used across independent trade press
and at least one peer-reviewed comparative study; the "table format" competition
between Delta/Iceberg/Hudi is itself the subject of sustained independent coverage
(TechCrunch, CNBC, The Register, Blocks & Files, SiliconANGLE). Meets WP:GNG as a
concept distinct from any one format.

## 3. Lead (what it must state)

- An **open table format** is an open specification for a metadata layer that
  organizes a collection of files in object/cloud storage into a single table with
  database-like guarantees: **ACID transactions, schema evolution, time travel
  (snapshots), and partition management** — without a proprietary storage engine.
- It sits **above open columnar file formats** (chiefly `Apache Parquet`; also ORC,
  Avro) and **below** query/compute engines and catalogs.
- The major open table formats are **`Delta Lake`, `Apache Iceberg`, `Apache Hudi`**
  (and the newer `Apache Paimon`); they emerged ~2016–2020 to bring warehouse-like
  reliability to `data lake` storage, and are a foundational layer of the
  `data lakehouse` architecture.

## 4. Core sections (this iteration)

1. **Definition & motivation** — what problem they solve vs. plain files / Hive
   tables (atomic commits, consistent reads, evolving schemas); the file-format vs
   table-format distinction (explicitly bridge to `Apache Parquet`).
2. **The major formats** — one short, *even-handed*, proportionate paragraph each:
   Delta Lake (Databricks, 2019), Apache Iceberg (Netflix, 2017), Apache Hudi
   (Uber), Apache Paimon (from Flink Table Store, 2022→ASF 2023). Link out; do not
   duplicate their articles. Weight by coverage (Paimon lightest, per WP:DUE).
3. **How they work (shared model)** — a metadata/manifest layer tracks which files
   constitute a table version; snapshots enable time travel; writers commit
   atomically. Keep vendor-neutral; defer per-format protocol detail.
4. **Interoperability** — `Apache XTable` (formerly OneTable; omni-directional
   metadata translation) and Delta **UniForm** (Delta emits Iceberg/Hudi-readable
   metadata). Note the industry shift from "format war" toward interop.
5. **Relation to catalogs and the lakehouse** — brief link to `Unity Catalog`,
   Iceberg REST Catalog, and `data lakehouse`.

## 5. Deferred sections (later iterations)

Per-feature comparison matrix; deletion vectors / merge-on-read internals (see
`../table-formats/report.md`); engine support matrix; governance models;
performance studies; detailed history of each format.

## 6. Cross-links

- **Out →** `Delta Lake` (our brief), `Apache Iceberg` (exists), `Apache Hudi`
  (red link — link but expect red), `Apache Paimon` (red link), `Apache Parquet`
  (exists), `data lakehouse` (our brief / `Lakehouse`), `Unity Catalog` (our
  brief), `Data lake` (exists), `Databricks` (exists).
- **In ←** should be linked from `data lakehouse`/`Lakehouse` (add reciprocal
  link), `Delta Lake` (our brief links back here as the parent concept),
  `Apache Iceberg` (propose adding a "See also" — it currently links neither Delta
  nor this concept), `Apache Parquet` (propose "table formats build on Parquet").

## 7. Databricks / founder linkage (evidence-led)

- **Delta Lake** is Databricks-created — state plainly, cite `Delta Lake` brief's
  sources.
- **The honest cross-format anchor:** Databricks **acquired Tabular** (June 2024,
  "over $1B"; ~$2B per later reports), founded by the **Netflix creators of Apache
  Iceberg** (Ryan Blue, Dan Weeks, Jason Reid) — so a company central to *one*
  format now owns the leading company behind *another*. Source to **independent**
  press: TechCrunch, CNBC, The Register, Blocks & Files (see `sources.md`).
- **UniForm** (Delta 3.0, 2023) and **Unity Catalog OSS** position Databricks as a
  driver of interop across formats — cite SiliconANGLE 2023 for UniForm.
- This linkage is factual and notable; keep it in the "interoperability" and
  "major formats" sections, attributed, never as praise.

## 8. Sources

Primary **(P):** project sites (Iceberg/Hudi/Paimon/XTable), Iceberg REST Catalog
spec, VLDB 2020 (Delta), Databricks UniForm/Tabular releases. Independent **(S):**
SiliconANGLE (UniForm 2023); TechCrunch/CNBC/Register/Blocks & Files (Tabular
2024); CIDR 2023 comparative storage study; *Information Systems* survey (2024).
Semi-independent **(SP):** VLDB 2020, CIDR 2021. **Use-with-care:** Dremio/lakeFS/
Onehouse "X vs Y vs Z" comparisons (attributed technical description only). Full
list + URLs in [`sources.md`](./sources.md).

## 9. NPOV / COI cautions

- **Scope tightly** vs `Lakehouse`/`Data lake` — the single biggest fork/merge risk.
- **Never state "X is faster/better than Y" in Wikipedia's voice.** Comparison blogs
  are vendor-published; the CIDR 2023 benchmark (favoring Delta) is Databricks
  co-authored — attribute everything.
- **Disclose provenance both ways** so the hub doesn't read Delta-first: Delta =
  Databricks; Iceberg's leading company (Tabular) is now Databricks-owned; Hudi's
  commercial vendor is Onehouse.
- **Proportionate weight (WP:DUE):** Paimon is newest/smallest with no WP article
  and mostly vendor coverage — keep it light.
- **"Format wars" framing** is vendor/blog language — describe the competition
  neutrally and attribute the "wars" characterization.
