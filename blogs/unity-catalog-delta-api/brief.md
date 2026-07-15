---
title: The UC Delta API — a Delta-native REST catalog, and why it isn't Iceberg REST
slug: unity-catalog-delta-api
status: drafting
date: 2026-07-03
tags: [unity-catalog, delta-lake, iceberg, lakehouse]
series:
series_order:
author: Robert Pack
target: company blog
---

<!--
Derived from an AI-proposed outline (Google Doc "Blog: UC Delta API",
t.yfongdpephuu, "Co-authored with Glean") plus its cited source pack, imported
2026-07-03. The outline is treated as NON-VALIDATED — its structure informs §5
but nothing in it is load-bearing until re-anchored on public code.

SOURCING CONSTRAINT (the central one for this post). Every primary design doc
in the outline's source pack is labeled INTERNAL / DRAFT:
  - "UC Delta API: New Catalog APIs for external data access…" (1CkaZqSKlf4…)
  - "Unity Catalog Managed Tables Spec" (1jShJTfGS53F…)
  - "Delta Rest Catalog — New Catalog API in Delta-Spark" (1x4wJH3nAdjX…)
  - "[PRD] UC — Iceberg REST Catalog APIs Support", "External Access PuPr…"
Per CLAUDE.md §10 these are LEADS, not sources. The good news (confirmed with
the author on import): the work is RELEASED in unitycatalog/unitycatalog. So the
whole post — and every example — anchors on the PUBLIC repo:
  - api/delta.yaml — the published OpenAPI spec (info.title "UC Delta API",
    version 1.0, 12 operations), verified live on main 2026-07-03.
  - api/delta-docs/Apis/{DeltaConfigurationApi,DeltaTablesApi,
    DeltaTemporaryCredentialsApi}.md + api/delta-docs/Models/ (56+ models).
  - UC OSS 0.5 release (Delta-native REST API for UC-managed Delta tables;
    unitycatalog-hadoop credential providers for S3/ABFS/GCS).
Internal-only artifacts (build.sbt SHA pins, compile-time shims, kill-switch
class names, project plans, reviewer names/dates) MUST NOT appear in the post.
See §9.
-->

## 1. Hook / thesis

Unity Catalog 0.5 ships a **Delta-native REST catalog API** — a versioned,
discoverable HTTP surface that lets any Delta engine (Spark, and increasingly
Flink, Trino, DuckDB) treat UC as a first-class Delta catalog. It borrows the
*shape* of the Iceberg REST Catalog (IRC) — `/config` discovery, versioned
endpoints, a uniform resource hierarchy — but it deliberately is **not** Iceberg
REST for Delta: it speaks native Delta schema, protocol, and domain metadata
over the wire, with no Iceberg translation layer. The one-line claim: *we took
the best ergonomics of IRC and built a Delta-native protocol underneath, because
forcing Delta through an Iceberg abstraction would cost Delta its own features.*

## 2. Audience

Engineers who build or integrate **Delta clients / query engines**, and platform
teams evaluating open-source Unity Catalog as an external catalog. Assumed
knowledge: the Delta transaction log basics (commits, `_delta_log`, protocol /
table features), REST APIs, and roughly what a catalog does (namespaces →
tables). Assumed familiarity with IRC is a *plus but not required* — the post
explains the IRC comparison rather than presuming it. NOT assumed: any Databricks
internal context. A secondary reader is the "why did they build another
protocol?" skeptic who already knows Iceberg REST.

## 3. Tone / voice

First person, opinionated, engineer-to-engineer. The stance is a genuine design
argument, not a launch announcement: **a Delta-native protocol was the right call
over reusing IRC**, and the post should be willing to say *where* IRC would have
been simpler and why we paid the cost anyway (credibility comes from naming the
tradeoff, not hiding it). Keep it concrete and protocol-level — show real request
bodies, not adjectives. Avoid the internal framing "Delta must not feel
second-class" as a *primary* argument; it's a strategic motivation, fine to
mention lightly, but the load-bearing case is technical (feature fidelity,
intent-based updates, server-side validation).

## 4. Key takeaways

- UC 0.5 exposes a **versioned, Delta-native REST catalog** (`/delta/v1/…`) whose
  first request is `GET /delta/v1/config` — server capability + endpoint
  discovery, IRC-style.
- **IRC ergonomics, Delta semantics.** Same REST *shape*; the payloads carry
  Delta's own schema JSON (the `schemaString` form), a structured `protocol`
  object, and typed per-domain **domain metadata** — not an Iceberg schema.
- Why not just use IRC for Delta? Because Iceberg's schema/RPC model doesn't
  carry Delta features cleanly (generated/identity columns, default values,
  column-mapping metadata, clustering as domain metadata) and Delta's
  client-writes-commit-then-catalog-ratifies flow differs from IRC's create/commit
  assumptions. The translation layer would be lossy.
- **Intent-based updates + server-side validation** are the substance: an
  overloaded `POST …/tables/{table}` bundles metadata changes (`set-properties` /
  `remove-properties` — *only the changed keys*, not a full-map replace),
  `set-protocol`, `set-columns`, `set-domain-metadata`, and `add-commit` into
  one atomic RPC, guarded by `assert-table-uuid` / `assert-etag`.
- It **co-exists** with IRC, doesn't replace it: Delta clients use the Delta API,
  Iceberg clients use IRC (incl. reading UniForm tables); the Delta log stays the
  source of truth for UniForm.
- You can run all of this locally today against OSS UC 0.5 — the payoff section.

## 5. Outline

Working H2s (sentence-case; each leads with the answer — QUALITY.md facet f).
`[code]` marks a section carrying a request/response or a runnable command.
Baseline-first: the spine is §1→§3→§5; §6/§7 are depth to defer if the post runs long.

1. **The elephant in the room** — open on the outline's hook ("why does Delta need
   its own catalog spec instead of just adopting Iceberg REST?") and answer it in
   the first few sentences, not at the end.
2. **What the old UC table API couldn't do** — the gap: unversioned/versionless,
   inconsistent identifier placement, no server-side commit validation, no feature
   advertisement on create, no intent-based property updates. Keep to the concrete
   limitations, sourced from the public spec's own framing.
3. **IRC ergonomics, Delta semantics** `[code]` — the centerpiece. `/config`
   discovery + versioned `/delta/v1/…` endpoints (the IRC-style shape), then the
   hard turn: the wire payload is native Delta. Show the v0 `ColumnInfo`
   (`type_text`/`type_json`/`type_name`) vs. v1 native `columns` (Delta
   `schemaString` shape) side by side.
4. **Why an Iceberg schema would be lossy for Delta** — concrete feature gaps:
   generated columns, identity columns, default values, column-mapping ids in
   field metadata, clustering carried as domain metadata. This is the "not just a
   wrapper" argument. Sourced from the delta.yaml models + public Delta protocol.
5. **One endpoint, atomic updates** `[code]` — the overloaded `POST …/tables/{table}`:
   intent-based `set-properties`/`remove-properties`, first-class `set-protocol`,
   `set-columns`, `set-domain-metadata`, `add-commit`, guarded by
   `assert-etag`/`assert-table-uuid`. Show one real request body. Contrast the
   "1 RPC for existing table / 2 RPCs (staging→promote) for create" rule.
6. **Where it fits: managed tables, UniForm, and IRC** — the co-existence story.
   Delta API for Delta clients; IRC for Iceberg clients; UniForm = Delta log is
   truth, Iceberg metadata is a projection. Dispel "Delta API vs IRC are
   competing." Ties back to the managed-tables spec (public GitHub version).
7. **Try it against OSS UC 0.5** `[code]` — the payoff. **Spark-first**: run a
   local UC 0.5 server (`docker compose up -d`), point Delta-Spark at it, and
   create→write→read a managed table — the realistic end-user path
   (`snippets/read_write_delta_spark.py`). Then show the raw protocol underneath
   with captured curl (`GET /delta/v1/config`, `snippets/config.sh`) so the reader
   sees the Delta-native payloads Spark is exchanging. THIS IS THE MAIN NEXT STEP
   — see §9 examples plan.
8. **Wrap-up** — restate: borrowed IRC's ergonomics, built Delta-native underneath;
   stable/versioned external surface without flattening Delta. CTA (§7 below).

## 6. Source material

*Code — pin to the UC **0.5** release tag (confirm exact tag string, e.g.
`v0.5.0`, against the repo at draft time; the outline's design docs are internal
and NOT citable):*

- `unitycatalog · api/delta.yaml · v0.5` — the published OpenAPI spec. `info.title`
  "UC Delta API", version 1.0; base path `/api/2.1/unity-catalog`; 12 operations:
  `getConfig`, `createStagingTable`, `createTable`, `loadTable`, `updateTable`,
  `deleteTable`, `tableExists`, `renameTable`, `reportMetrics`,
  `getTableCredentials`, `getStagingTableCredentials`, `getTemporaryPathCredentials`.
  THE primary citable source for every endpoint/field claim.
- `unitycatalog · api/delta-docs/Apis/{DeltaConfigurationApi,DeltaTablesApi,DeltaTemporaryCredentialsApi}.md · v0.5`
  — human-readable operation docs generated from the spec (link targets for readers).
- `unitycatalog · api/delta-docs/Models/ · v0.5` — the 56+ request/response models
  (e.g. the schema `columns` object, `protocol`, domain-metadata, the update
  actions, `assert-etag`/`assert-table-uuid` requirements). Cite specific model
  files for the §3–§5 payload claims.
- `unitycatalog · spec/protocols/ManagedTablesSpec.md · main` — the PUBLIC managed
  tables spec (CCv2 commit protocol). This is the "v0" the Delta API builds on;
  the public anchor for §6's co-existence + commit-flow claims.
- `unitycatalog · connectors/spark/…/UCSingleCatalog.scala · v0.5` — the Spark
  catalog entry point, for the "drive it through Delta-Spark" example in §7.
- `unitycatalog · (build.sbt / version.sbt / compose.yaml) · v0.5` — artifact
  coordinates + local-run path for §7 (reuse the verified facts from the sibling
  `unity-catalog-storage` brief §6 rather than re-deriving: `docker compose up -d`,
  server `:8080`, Spark-version-qualified artifact name).
- `delta-io/delta · PR #6575` — the OSS Delta-Spark change that routes UC-managed
  Delta ops through the new API. Public, citable as the client-side landing.

*Prior art / related (ours):*

- `blogs/unity-catalog-storage/` — companion post on UC credentials / external
  locations / managed storage. Credential vending shows up in both; link it,
  don't re-derive vending. The §7 local-run setup overlaps heavily — reuse.
- `blogs/trust-in-your-open-lakehouse/` — server-side planning + credential
  vending as governance patterns; the Delta API's server-side commit validation
  is an instance of that thesis. Link, don't restate.
- IDEAS.md "Delta catalog-managed tables" (published on openlakehouse-io) and
  "Delta vs Iceberg: ecosystem fragmentation" — this post is the API-level cut of
  the same territory; cross-reference, keep scopes distinct.

*External refs:*

- Apache Iceberg REST Catalog OpenAPI spec (the IRC we compare to) — link the
  public `rest-catalog-open-api.yaml` in apache/iceberg for the `/config` +
  versioning shape the post says UC "borrowed."
- UC OSS 0.5 release notes (github.com/unitycatalog/unitycatalog/releases) — the
  "what shipped" anchor. Confirm the exact tag + date at draft time.
- Delta protocol spec (delta-io/delta PROTOCOL.md) — for the feature claims in §4
  (generated/identity columns, defaults, column mapping, clustering, domain
  metadata) — anchor each named feature here, not on the internal doc.

## 7. Call to action

Primary: **stand up OSS Unity Catalog 0.5 locally and talk to the Delta API** —
run `GET /delta/v1/config`, then the create→commit→load lifecycle (§7 examples).
Secondary: point your Delta engine at it (Delta-Spark config), and read the
`api/delta.yaml` spec + managed-tables spec if you're building a client. Tertiary:
the sibling `unity-catalog-storage` / trust posts for the governance context.

## 8. Publishing target / format

Company blog. It's a design-argument + how-to hybrid, so it's dense with request
bodies and commands → §9 verification is the gating work. Front matter portable
per §3. Runnable examples follow the repo's **Runnable examples** convention
(CONVENTIONS §5): Python via `uv` + PEP 723 inline deps (`uv run <file>.py`),
the local server via `docker compose up -d` (pinned image tag), REST as captured
`curl -sS --fail-with-body` transcripts — each `snippets/` file self-documenting
with a `Run:`/`Needs:`/`Verified:` header. Original asset (QUALITY.md facet f): a
diagram of the
create/commit lifecycle (`/config` → `staging-tables` → write `0.json` →
`POST /tables` → `POST /tables/{table}` commit) — author in D2 under `assets/`
per CONVENTIONS §5. Disclose Databricks affiliation (§10). SEO: keep "Unity
Catalog", "Delta", "REST API / catalog", "Iceberg REST" in title/subtitle.

## 9. Verification / accuracy notes — INCLUDING the examples plan (the main next step)

**The examples are the main deliverable before drafting.** Build and verify them
first; the prose in §5 is scaffolding around what actually runs. They follow the
repo's **Runnable examples** convention (CONVENTIONS §5). Stub files are already
scaffolded in `snippets/` with `Verified: (pending)` headers — the work is to run
them against UC 0.5 and flip those to a real `Verified:` line. Driver is
**Spark-first** (the realistic path), with curl as the protocol view underneath.

*Build/verify these `snippets/`:*

1. **`compose.yaml`** ✅ — local UC 0.5 (`docker compose up -d`), image pinned to
   `unitycatalog/unitycatalog:v0.5.0`, default port **`:8080`** (REST API + UI).
   Setup that must be right: mount `server.properties` to
   `/home/unitycatalog/etc/conf/` (the real WORKDIR — NOT `/opt/...`), set
   `storage-root.tables=file:///tmp/uc-data`, and bind-mount `/tmp/uc-data` 1:1 so
   the `file://` locations UC vends resolve on the host. (History note: a bout of
   `no such table: objects` / port confusion on 2026-07-10 turned out to be a
   SECOND stray UC instance squatting on `:8080` — not the image. With it shut
   down, `:8080` is correct and clean; ignore any lingering `:8081` mention.)
2. **`read_write_delta_spark.py`** (LEAD) ✅ — `uv run` PySpark against local UC on
   `:8080`: create→write→read a managed Delta table, drives
   staging→promote→commit→load. Verified 2026-07-10; stack **PySpark 4.1.0 +
   `unitycatalog-spark_4.1_2.13:0.5.0` + `delta-spark_4.1_2.13:4.3.0`** (the v0.5.0
   release-notes matrix: Spark 4.0.x or 4.1.x, both Delta 4.3.0). A benign
   `reportMetrics` 404 is logged after the commit — UC 0.5 advertises the
   `/metrics` endpoint but returns 404; optional telemetry, does not affect
   create/write/read. Worth one "don't panic" sentence in the post.
3. **`config_check.py`** / **`config.sh`** ✅ — the `GET /delta/v1/config` money
   shot (endpoints list + `?protocol-versions=…` negotiation). Verified 2026-07-10
   against `:8080`: HTTP 200, 12-endpoint list, `protocol-version 1.0`.
4. **One real update-request body** for §5 ✅ — captured from Spark's traffic (via
   a logging proxy), not hand-written, in `snippets/commit-request.out.txt`: the
   `POST …/tables/{table}` commit carries `requirements:[{assert-table-uuid}]` +
   `updates:[{add-commit},…]` — the intent-based, guarded, atomic update. Paired
   with the create body (native Delta schema + structured `protocol` features).
5. **`read_delta_duckdb.py`** (NEW — the "any Delta engine" payoff) ✅ GREEN —
   `uv run` DuckDB 1.5.4 reading the Spark-written table via UC on `:8080`.
   Re-verified 2026-07-13 end-to-end: `SELECT` returns `[(1, 'alpha'), (2, 'beta')]`
   — the Spark-written table read from a *different* engine over one catalog, no
   cloud creds. The extension installs (`delta` from **core** + `unity_catalog`
   from **core_nightly**, build fd85147), `CREATE SECRET` / `ATTACH` are accepted,
   it calls the classic catalog API (GET /schemas 200, GET /tables 200) AND now
   parses the /tables response cleanly. HISTORY: an earlier nightly (build e37b1b4,
   2026-07-10) failed the read with `Invalid field … field: type_precision` — UC
   0.5 emits a `type_precision` field per column (NULL for Spark-created ones) the
   extension's model didn't know. That upstream skew is now fixed (the field is
   still emitted; the extension tolerates it). Two things the snippet still bakes
   in: install `delta` from **core** (core_nightly 404s), and use an **UNNAMED**
   secret (a *named* secret was not wired into the request base URL → host-less
   URL, "could not resolve hostname"). The cross-engine READ now demonstrates the
   full "any Delta engine" payoff. See `duckdb-uc-bug-repro.py` (now a regression
   check) for the field-level detail.

*Verified against a live UC 0.5 server (docker image `:v0.5.0`, 2026-07-03):*

- ✅ **UC 0.5 serves `/delta/v1` by default — no flag needed.**
  `GET /api/2.1/unity-catalog/delta/v1/config?catalog=unity&protocol-versions=1.0`
  returns **HTTP 200** with exactly the 12-endpoint list and `"protocol-version":
  "1.0"` (captured in `snippets/config.out.txt`). The runtime enable flag in the
  internal doc is a *Delta-Spark client-side* concern, not a server gate.
- ✅ **`catalog` is a mandatory query param** on `/config` (omitting it → HTTP 400
  `InvalidParameterValueException`) — and this is **correctly documented** in the
  published spec (`api/delta.yaml`, `getConfig`: `catalog` and `protocol-versions`
  are both `in: query, required: true`). Not a spec gap; the AI outline and the
  first draft of the snippets simply missed it. `config_check.py` / `config.sh`
  now pass it. (No engineering follow-up needed.)
- ✅ **Default seed catalog is `unity`** (the only catalog in a fresh OSS UC).
- ✅ **`config_check.py` runs via `uv run` with no venv** — `uv` resolves the PEP
  723 inline `requests==2.32.3` into an ephemeral env; proves the copy-and-run
  pattern. `config.sh` (curl) verified the same, exit 0.
- ✅ **The whole read path works LOCALLY with no cloud creds.** `GET` loadTable on
  the seed managed table `unity.default.marksheet` returns the native Delta schema
  (Delta `struct`/`fields` shape — the "not Iceberg" point made concrete), `etag`,
  `table-uuid`, `latest-table-version`. Credential vend
  (`?operation=READ`) returns a `file://` credential with an **empty `config: {}`**
  — no secret. (Transcripts in `snippets/api-transcripts.out.txt`.)
- ✅ **Managed-table creation works locally too**, once the server has a managed
  root. Set `storage-root.tables=file:///tmp/uc-data` in `server.properties` and
  bind-mount `/tmp/uc-data` 1:1 (host↔container) so the `file://` locations UC
  vends resolve for host Spark — that's `snippets/compose.local-managed.yaml` +
  `server.properties.override`. Then `POST …/staging-tables` returns a
  `file:///tmp/uc-data/__unitystorage/tables/<uuid>` location, an empty-`config`
  `READ_WRITE` credential, and — notably — the **feature-advertisement** payload
  (`required-protocol` / `suggested-protocol` with `catalogManaged`,
  `deletionVectors`, `inCommitTimestamp`, `rowTracking`, …) that the post cites as
  a key improvement over v0. Great §4/§5 artifact.
- ✅ **Spark lead example (`read_write_delta_spark.py`) VERIFIED end-to-end** —
  create→insert→select of a MANAGED Delta table, entirely local, no cloud. SELECT
  returned `(1,'alpha'),(2,'beta')` through the UC Delta API; data files landed
  under `/tmp/uc-data/__unitystorage/tables/<uuid>/` (transcript
  `snippets/spark-read.out.txt`). Verified stack (from the **v0.5.0 release
  notes** — the authoritative source for the matrix):
    - **PySpark 4.0.0** (pip) — Scala 2.13
    - **`io.unitycatalog:unitycatalog-spark_4.0_2.13:0.5.0`** — note the
      *Spark-version qualifier* `_4.0_` AND the Scala qualifier `_2.13`; plain
      `unitycatalog-spark_2.13:0.5.0` is a 404 (that tripped the first drafts).
    - **`io.delta:delta-spark_4.0_2.13:4.3.0`** — connector 0.5.0 requires Delta
      **4.3.0** (earlier Delta 4.0.0 rejected `delta.feature.catalogManaged` as
      unrecognized). For Spark 4.1.x, swap to the `_4.1_` artifacts + same 4.3.0.
  Findings along the way (worth a sentence in the post): managed CREATE must set
  `TBLPROPERTIES ('delta.feature.catalogManaged'='supported')` — the exact
  feature the staging-tables `required-protocol` advertises; UC rejects the
  create otherwise. **Proxy note:** resolved jars via `MAVEN_REPO`
  (Databricks Maven mirror) + `UV_INDEX_URL` (PyPI mirror) since Maven Central /
  PyPI are blocked here; the post should give an offline/mirror tip.

*Open questions the examples must still resolve (log answers here as you build):*
- ✅ Release tag confirmed `v0.5.0` (Docker image `unitycatalog/unitycatalog:v0.5.0`
  exists on Docker Hub; `:latest` points at it). Still confirm the exact release
  *date* on the GitHub releases page at draft time.
- ✅ Local (no-cloud, file-based) UC serves the full read path AND managed-table
  creation/commit — no S3/ABFS/GCS needed (see above). A cloud variant can be a
  later addendum, not a prerequisite.
- ✅ **API port is the default `:8080`.** An earlier `:8081` detour was a
  misdiagnosis: a SECOND stray UC instance was bound to `:8080` and produced the
  `no such table: objects` / 500s. With it shut down, `:8080` is correct and all
  examples use it. No image regression, no transcoder issue.
- ✅ **Spark version:** the v0.5.0 release notes give the matrix — Apache Spark
  4.0.x (`unitycatalog-spark_4.0_2.13:0.5.0`) or 4.1.x
  (`unitycatalog-spark_4.1_2.13:0.5.0`), both Delta 4.3.0. Examples use **4.1.0**.
- ✅ **DuckDB read path (second engine):** DuckDB 1.5.4 + `unity_catalog`
  (core_nightly, build fd85147) attaches to local UC `:8080`, calls the catalog
  API, AND reads the Spark-written table: `SELECT` → `[(1,'alpha'),(2,'beta')]`
  (re-verified 2026-07-13). The earlier `type_precision` response-parse skew (build
  e37b1b4, 2026-07-10) is FIXED upstream. Item 5 is now ✅ GREEN — the post can show
  DuckDB as a real copy-and-run second engine (note it still needs a nightly
  `unity_catalog`, which moves fast; the snippet FORCE INSTALLs the latest).
- ⏳ Exact runnable Spark connector coordinate for a UC 0.5 server + PySpark 3.5.3
  (Scala 2.13): `unitycatalog-spark_2.13:0.3.0` + `delta-spark_2.13:4.0.0` per the
  docs — **verify on a networked machine**; a proxied reader will hit the same
  wall, so the post should give an offline/mirror note.
- Delta-Spark artifact coordinates for 0.5 that actually pull the Delta-API client
  path (cross-check delta-io/delta PR #6575 for the client version that shipped it).

*Anti-leak checklist (verify NONE of these appear in the draft):*

- No internal design-doc content: SHA pins in `build.sbt`, compile-time shim
  design (`java-shims/drc`, `DRCMetadataAdapter`, `UCDeltaClient`), the three
  "kill switches", the `spark.databricks.delta.unityCatalog.deltaRestCatalog.enabled`
  runtime flag naming, project plans, PDs, reviewer names, target dates.
- Every endpoint/field/action name traces to `api/delta.yaml` or `delta-docs`.
- Every named Delta feature (§4) traces to the public Delta PROTOCOL.md, not the doc.
- Re-verify all pins at publish time (CONVENTIONS §6).

## 10. Open questions / risks

- **Non-validated outline.** The Google-Doc outline is AI-generated ("Co-authored
  with Glean") and unvalidated; §5 reorders it (thesis-first, technical case over
  the "second-class" framing) and drops its internal-source pack. Don't treat the
  outline as authoritative.
- **Internal-source risk is the #1 risk.** The richest material lives in internal
  DRAFT docs. The mitigation is the §9 anti-leak checklist + the fact that the
  feature shipped publicly — but a careless copy-paste from the design doc is the
  most likely way this post goes wrong. Guard it in review (facet a).
- **Freshness.** UC and Delta-Spark are moving fast (0.5 is recent). The exact
  endpoint set, default-on behavior, and artifact coordinates may shift — pin hard
  and re-verify at publish.
- **Series?** Standalone for now, but this sits squarely in the same arc as
  `unity-catalog-storage` and the Trust post (open-lakehouse / UC concepts). If a
  "Unity Catalog concepts" series is promoted (see storage brief §10), this is a
  member. Leave `series` blank until that arc earns a SERIES.md entry.
- **Disclosure / COI.** Databricks-authored post about Databricks-originated OSS.
  Disclose per the target's requirement (CONVENTIONS §10).
- **Audience calibration.** The IRC comparison is load-bearing but not every reader
  knows IRC — §3 must explain it enough to follow without turning into an IRC tutorial.
