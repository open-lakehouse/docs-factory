# Brief: Data lakehouse (Open Lakehouse)

## 1. Article status

**Expand the existing stub — do not create new.** `Lakehouse` exists on
en.wikipedia.org but is a **stub**: roughly one descriptive paragraph plus a
"medallion architecture" section, with only **2 references** (the CIDR 2021 paper
and a TechTarget definition). Separately, `Data lakehouse` is a **redirect that
points to `Data lake`** (not to `Lakehouse`) — an inconsistency splitting the
concept across two articles. `Open lakehouse` = 404.

**Strategy:** (a) expand the `Lakehouse` article; (b) **fix the `Data lakehouse`
redirect** to target `Lakehouse`; (c) trim/`{{main}}`-link the "Data lakehouses"
subsection inside `Data lake` so the two don't duplicate. Do these via Talk-page
edit requests per the README COI section.

## 2. Notability assessment

Strong. Independent analyst coverage (Forrester Wave: Data Lakehouses Q2 2024;
Gartner), a peer-reviewed survey (*Information Systems* v127, 2024), a comparative
CIDR 2023 study, and sustained trade press (The Register, BigDATAwire, CIO) —
well beyond the originating vendor. Clear GNG pass; the work is depth/neutrality,
not existence.

## 3. Lead (what it must state)

- A **data lakehouse** is a data-management architecture that combines the
  low-cost, open storage of a **`data lake`** with the transactional reliability,
  schema management, and query performance historically associated with a
  **`data warehouse`** — implemented by adding a metadata/transaction layer
  (**open table formats**) over files in object storage.
- The term was **coined by Databricks**, with the concept set out in the **CIDR
  2021** paper (Armbrust, Ghodsi, Xin, Zaharia); attribute the term's origin.
- It is built on **open table formats** (`Delta Lake`, `Apache Iceberg`,
  `Apache Hudi`) layered over **`Apache Parquet`**, and is offered by multiple
  vendors (not only Databricks).

## 4. Core sections (this iteration)

1. **Origin & definition** — Databricks coined the term (attribute); CIDR 2021
   paper; positioned between `data lake` and `data warehouse`. Cite the paper as a
   primary/interested source, and an independent analyst definition for balance.
2. **How it works / architecture** — metadata layer over object storage via open
   table formats; ACID + schema + time travel; the **medallion (bronze/silver/gold)**
   pattern (already in the stub — keep, source better).
3. **Relation to data lake and data warehouse** — the convergence framing
   (attribute to analysts, who describe lakes and warehouses *converging* rather
   than one simply replacing the other). Explicit cross-links both directions.
4. **Implementations & reception** — multiple vendors: Databricks, Snowflake,
   Google BigLake/BigQuery, AWS (S3 + Athena/Iceberg), Microsoft Fabric, Dremio,
   Onehouse. Include a short **reception/criticism** note (skeptics call it a
   rebrand of the warehouse) for NPOV.

## 5. Deferred sections (later iterations)

Detailed history/timeline; governance and open-format comparison; security &
lineage; streaming/CDC; detailed vendor feature comparison; adoption case studies.

## 6. Cross-links

- **Out →** `Data lake`, `Data warehouse`, `Open table format` (our hub),
  `Delta Lake` (our brief), `Apache Iceberg`, `Apache Hudi` (red), `Apache Parquet`,
  `Apache Spark`, `Databricks`, `Unity Catalog` (our brief), `Matei Zaharia`,
  `Ali Ghodsi`, ETL/ELT, object storage.
- **In ←** `Data lake` and `Data warehouse` (ensure they link here), `Databricks`
  (already references data lakehouse), and each of the open-table-format articles.

## 7. Databricks / founder linkage (evidence-led)

- **Term + concept origin:** Databricks coined "data lakehouse"; CIDR 2021 paper
  by **Armbrust, Ghodsi, Xin, Zaharia**. Attribute in-text ("Databricks
  researchers argued…").
- **People:** link `Matei Zaharia` and `Ali Ghodsi` (both have WP articles; note
  Zaharia's article omits lakehouse — a genuine gap, not something to assert
  here). Armbrust and Xin have no articles → inline citation only.
- Keep the linkage honest by **also** documenting non-Databricks implementations
  (§4) so the article is not a Databricks product page.

## 8. Sources

Semi-independent **(SP):** CIDR 2021 paper. Independent **(S):** Forrester Wave
Q2 2024, Gartner note, *Information Systems* survey (2024), CIDR 2023 comparative
study, The Register (Teradata 2024; Delta/Iceberg convergence 2025), BigDATAwire
"warehouse-style lock-in" (2022, for balance), CIO adoption piece. Full list +
URLs in [`sources.md`](./sources.md).

## 9. NPOV / COI cautions

- **"Warehouse withers / lakehouse replaces it"** is the CIDR paper's *thesis*, not
  consensus — attribute to the Databricks authors; balance with the analyst
  "converging" view and skeptics.
- **"Rebrand / markitecture" criticism** must appear (BigDATAwire "lock-in" piece;
  independent skeptics) for a neutral reception section — prefer trade-press/analyst
  weight over blogs.
- **Databricks-centric origin** — balance by documenting competing implementations
  (Snowflake, Google, AWS, Microsoft Fabric, Dremio, Onehouse); anchor on Forrester
  Wave and convergence coverage.
- **WP:PEACOCK** — rewrite vendor phrasing ("revolutionary," "next-generation,"
  "unifies everything") into attributed, factual statements.
