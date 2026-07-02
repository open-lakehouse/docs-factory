# Brief: Unity Catalog

## 1. Article status

**New standalone article, with a documented fallback.** `Unity Catalog` = 404 on
en.wikipedia.org (no article/redirect). The topic is covered in one sentence in
`Databricks` ("In June 2024, Databricks open sourced Unity Catalog … under the
Apache [2.0] license"). Disambiguation risk (Unity game engine, etc.) is low —
the two-word phrase "Unity Catalog" is fairly unambiguous; a hatnote is likely
unnecessary at launch.

**Strategy:** plan a standalone article (submit via AfC per README COI section),
but **lead the notability case on durable anchors** — the LF AI & Data donation,
the SIGMOD 2025 paper, and multi-outlet independent coverage — not Databricks
blogs. **Fallback (document it):** a well-sourced section in `Databricks` that can
be split out later if a merge/AfD challenge succeeds.

## 2. Notability assessment

**Borderline but defensible.** In favor: sustained independent coverage across two
distinct news pegs (June 2024 open-sourcing; the ongoing "catalog wars"), a Linux
Foundation (LF AI & Data) donation, and a peer-reviewed SIGMOD 2025 paper.
Against: much coverage clusters in one week of June 2024 and is framed as
Databricks-vs-Snowflake, inviting **WP:NOTNEWS** / merge-to-Databricks. Clears
GNG, but **expect a challenge** — hence the fallback.

## 3. Lead (what it must state)

- **Unity Catalog** is a data-and-AI **governance and catalog** system for the
  **data lakehouse** — providing a metastore, a **three-level namespace**
  (catalog → schema → table/volume/model), access control, lineage, and
  credential vending.
- It exists in **two distinct forms**: **managed Unity Catalog**, a proprietary
  feature of the Databricks platform (introduced ~2021), and **Unity Catalog OSS**
  (unitycatalog.io), **open-sourced by Databricks in June 2024** under **Apache
  2.0** and donated to the **LF AI & Data** foundation.
- It implements open interfaces including the **Iceberg REST Catalog API** and
  Hive Metastore, and interoperates across `Delta Lake`/`Apache Iceberg`/
  `Apache Hudi`.

## 4. Core sections (this iteration)

1. **Overview & the two forms** — managed vs OSS, explicitly disambiguated (this is
   the top factual-accuracy trap; capability claims differ between them).
2. **History** — introduced by Databricks (~2021, managed); open-sourced
   **June 12 2024** at Data+AI Summit (v0.1, Apache 2.0, CEO Ali Ghodsi); donated
   to **LF AI & Data** (Jun 20 2024). Cite VentureBeat/InfoWorld/BigDATAwire + LF.
3. **Architecture** — metastore, three-level namespace, credential vending, open
   API surface (Iceberg REST Catalog, HMS). Attribute capability specifics to the
   form (managed vs OSS) they belong to; use `../table-formats/report.md` §6 for
   the managed-vs-OSS surface, re-anchored on independent/primary sources.
4. **Competitive landscape (the "catalog wars")** — Snowflake **Polaris** /
   Apache Polaris as the parallel open-catalog effort; present as a documented
   industry rivalry, neutrally, without picking a "more open" side.

## 5. Deferred sections (later iterations)

Fine-grained governance/RBAC, lineage, attribute-based access, model/volume/
function assets, pluggable policy engine, engine-access matrix, detailed
managed↔OSS parity table.

## 6. Cross-links

- **Out →** `Databricks`, `data lakehouse`/`Lakehouse`, `Delta Lake` (our brief),
  `Apache Iceberg`, `Open table format` (our hub), `Linux Foundation`, `Ali Ghodsi`.
- **In ←** `Databricks` (already mentions it — expand to a link), `data lakehouse`
  (add — `Lakehouse` currently omits catalogs entirely, a gap), `Open table format`
  (our hub's "catalogs" section).

## 7. Databricks / founder linkage (evidence-led)

- **Created by Databricks** (managed ~2021), **open-sourced 2024** — state plainly
  in the lead; unavoidable and honest.
- **Ali Ghodsi** (WP article exists) announced the open-sourcing — citeable link.
- Broad backer list (AWS, Google Cloud, Microsoft, NVIDIA, Salesforce) is a
  **Databricks claim** — attribute to the press release, don't state in WP voice.

## 8. Sources

Primary **(P):** unitycatalog.io, GitHub unitycatalog/unitycatalog, LF AI & Data
post (2024-06-20), Databricks/PR Newswire release (2024-06-12). Semi-independent
**(SP):** SIGMOD 2025 paper. Independent **(S):** VentureBeat, InfoWorld,
BigDATAwire (all June 2024), Materialized View ("catalog wars," independent);
TechCrunch/The Register (Tabular context). Rival primary **(P):** Snowflake Polaris
announcement. Full list + URLs in [`sources.md`](./sources.md).

## 9. NPOV / COI cautions

- **Drop "industry's only universal catalog"** (Databricks marketing) from WP
  voice; if quoted, attribute and note Snowflake makes parallel "open" claims for
  Polaris.
- **Managed vs OSS conflation** is the biggest accuracy trap — don't attribute
  managed-only capabilities (credential vending scope, fine-grained governance,
  lineage) to the OSS version without a source confirming they're in OSS.
- **Polaris rivalry** — document as a competitive dynamic with independent sourcing
  (InfoWorld, VentureBeat, Materialized View); both UC and Polaris are
  commercially backed — take no side on "more open."
- **WP:NOTNEWS** — do not build the article on the June-2024 news week alone;
  anchor durable notability on the LF AI & Data governance status and the SIGMOD
  paper.
