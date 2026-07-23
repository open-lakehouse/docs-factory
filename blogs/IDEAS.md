# Blog ideas

Raw, un-fleshed ideas. Park anything here; no commitment. This file stays the home
for raw parking. An idea graduates to its own `blogs/<slug>/` folder once you can
write its one-line thesis and name its audience — either as an early `status: idea`
folder (worth ranking/reviewing before it's fully fleshed) or straight to a brief at
`status: draft` — see [`CONVENTIONS.md`](./CONVENTIONS.md) §1–2. When it graduates,
check it off and note the slug.

Entry format: a **title**, a one-line thesis, and optional inline tags —
`repos:` (local code the post draws on), `audience:`, `src:` (existing draft or
source material). **Homing rule:** this repo is the canonical home for blog
material, so DevRel *prose* — narratives, sketches, build logs written to become a
post — may be **moved here** (into the post's `<slug>/source/`) rather than kept as
a remote pointer; live, verifiable **code** stays in its home repo and is `src:`-
referenced by a pinned ref (never copied). See [`CONVENTIONS.md`](./CONVENTIONS.md)
§6.

## Backlog

- [x] **Unity Catalog storage concepts** — how UC's credentials, external
  locations, and managed storage turn storage sprawl into a safe-by-default
  path. → graduated to a brief: `blogs/unity-catalog-storage/`.
  `src:` Google Doc "Unity Catalog Concepts" (tab "Storage") · `repos:` unitycatalog

- [ ] **Delta Kernel, explained by reading the Rust** — walk the scan API to
  show how an engine reads a Delta table without reimplementing the protocol.
  `repos:` delta-kernel-rs, delta-rs · `audience:` Rust engineers who use
  delta-rs but haven't looked inside the kernel

- [ ] **Delta vs Iceberg: ecosystem fragmentation** — where the two table-format
  ecosystems actually diverge, and where they're converging.
  `src:` docs-factory/research/table-formats/report.md (+ companion JSON
  matrices) · note: re-anchor load-bearing claims on public sources before
  publishing (the report's single-source claims are mostly vendor docs)

- [x] **Trestle golden path: proto → dual-protocol server** — annotate a few proto
  messages, run one tool, get a Databricks-deployable Rust app whose REST + Connect
  APIs run on one port over one business core, with typed clients and a React app
  generated for free. Told as the Casper's Ghost Kitchen driver check-in story.
  (Merges the former separate "Casper's Ghost Kitchen" idea — same golden path,
  same running example.) → graduated to a brief: `blogs/trestle-golden-path/`
  (series: Chef Casper's Ghost Kitchen, order 1).
  `src:` blogs/trestle-golden-path/source/ (narratives moved here — canonical),
  reference-architecture/Caspers.md · `repos:` trestle (public, Apache-2.0;
  `olai-trestle` on crates.io; code verified against `examples/golden-path-app`)

- [ ] **Tracing OpenClaw with MLflow** — from black box to observability.
  `src:` openlakehouse-io src/content/posts/agentic/openclaw-tracing/index.mdx
  (already published — candidate to expand and/or cross-post here)

- [ ] **A blog quality judge** — automating high-quality-blog review (relates to
  our own §10 review pass).
  `src:` workflows/.dda/ideas/blog-quality-judge/idea.md

- [ ] **Open-lineage learnings** — what we learned wiring up OpenLineage.
  `src:` docs-factory/TODO.md ("BLog posts" section)

- [ ] **DataFusion integration writeup** — integrating DataFusion as a query
  engine; lessons and rough edges.
  `src:` docs-factory/TODO.md ("BLog posts" section) · `repos:` arrow-datafusion,
  datafusion-table-providers, deltalake-datafusion

- [ ] **File-format opinions** — "inventing a new file format is not a good
  idea"; predicate-pushdown can be slower than you think.
  `src:` liquid-cache/dev/thoughts/thoughts.md · `repos:` liquid-cache

- [x] **Delta catalog-managed tables** — the next evolution of Delta.
  `src:` openlakehouse-io
  src/content/posts/delta-lake/delta-catalog-managed-tables/index.mdx (already
  published — candidate to expand here). → graduated to a brief:
  `blogs/unity-catalog-delta-api/` — the API-level cut (UC 0.5's Delta-native REST
  catalog and why it isn't Iceberg REST). The published mdx stays home as prior art.

- [x] **In-browser lakehouse: a WASM query engine** — run a real query engine,
  DataFusion + Delta on `wasm32`, in the browser tab; read cloud storage directly
  with vended Unity Catalog credentials; keep a server path as the correctness
  fallback. → graduated to a brief: `blogs/wasm-lakehouse-preview/`.
  `src:` mangrove/WASM_QUERY_PREVIEW.md + mangrove/crates/query-wasm/ (lead) ·
  `repos:` mangrove, delta-rs (`deltalake-wasm`), arrow-datafusion · note:
  depends on personal `roeap/*` forks — anchor on public DataFusion/delta-rs and
  disclose the fork usage; don't present forks as shipping product.

- [x] **Cross-repo ABAC in the open lakehouse** — fine-grained access control is a
  cross-service contract: UC serves policies, the query service resolves them per
  table, a neutral engine enforces row filters and column masks on DataFusion
  *without forking it*. Design/thought-leadership cut → follow-on to the Trust
  post. → graduated to a brief: `blogs/cross-repo-abac/` (series: Trust in the
  Open Lakehouse, order 2).
  `src:` hydrofoil/docs/policy-enforcement-design.md,
  hydrofoil/crates/hydrofoil/src/catalog/policies.rs, mangrove /policies (leads) ·
  `repos:` hydrofoil, mangrove · anchors: Databricks Policies API, UC
  ManagedTablesSpec, Cedar, NIST SP 800-207

- [ ] **What makes compute *trusted*? Identity attestation over artifact facts**
  (raw) — the deep cut of the Trust post's "Trusted Compute" section: rather than
  handing a binary a secret it can present, we *observe facts about the deployed
  artifact* and make the identity-attestation decision on those. An advanced setup:
  deploy **SPIFFE/SPIRE** for workload identity attestation, and feed our **release
  checksums** into it — validating the Docker container / binary signatures against
  the hashes we publish at release, so a workload's identity is earned by *being the
  verified artifact in the expected place*, not by possessing a credential. Design /
  thought-leadership; a follow-on to `trust-in-your-open-lakehouse` (whose draft
  already ends its attestation passage on "assert the executable hash matches the
  trusted binary verified elsewhere" — this post *builds* that). Likely a later entry
  in the Building the Open Lakehouse arc. `audience:` platform / security engineers
  running enforcement services who want guarantees without distributing secrets ·
  `repos:` the release pipelines that emit checksums (trestle, mangrove, headwaters,
  hydrofoil images) · `src:` blogs/trust-in-your-open-lakehouse/draft.md §Trusted
  Compute (the anchor to extend) · anchors: SPIFFE/SPIRE (workload attestation),
  Sigstore/cosign + SLSA provenance (artifact signing), the repos' release-plz /
  Docker-release checksum outputs · note: raw — verify what attestation/signing we
  actually run today vs. what's aspirational, and disclose the gap (CONVENTIONS §6);
  the SPIRE-plus-checksums setup may be a *proposed* advanced example, not shipped.
  Estate: extends the governance storyline's "trusted compute" thread. **Producer/
  consumer pair** with the "Credential-less releases" entry below — that post *produces*
  the signed artifacts + checksums this one *consumes* for runtime attestation
  (two halves of one trust chain; cross-link).

- [ ] **Credential-less releases: a keyless, verifiable distribution pipeline** — the
  CI/CD we built across the five estate repos to publish four artifact types — **crates
  to crates.io, Docker images to GHCR, standalone binaries, and a Homebrew tap** — with
  security best practices threaded through the whole thing. The spine: **no long-lived
  registry tokens or signing keys anywhere in CI.** crates.io uses **OIDC trusted
  publishing** (keyless; a documented one-time `bootstrap-publish` covers the single
  case OIDC can't — the first publish of a brand-new crate name); Docker images are
  **cosign keyless-signed** (Fulcio/Rekor via OIDC) with **SBOMs** and
  `provenance: mode=max`, signed by digest; binaries ship **SHA-256 checksums + SLSA
  build-provenance attestations** (`actions/attest-build-provenance`, verifiable with
  `gh attestation verify`); the Homebrew formula is committed via the Contents API so
  GitHub signs it, satisfying the tap's required-signed-commits. Workflows run
  **default-deny** (`permissions: {}`) with narrowly-scoped `id-token`/`attestations`
  grants per job. The through-line: **verification rides along end-to-end** — from
  commit to install, every artifact carries provenance/signatures a downstream can
  check. Then note how these **learnings feed the estate** — the release checksums are
  exactly what the trusted-compute attestation idea above consumes, and the same secure
  recipe is being applied as Unity Catalog and the other services adopt it.
  **Honesty caveat (load-bearing):** this has **not been security-reviewed** — frame it
  as "follows security best practices to the best of our knowledge," not a certified
  guarantee (CONVENTIONS §6). Design / engineering register — a Building-the-Open-
  Lakehouse arc entry (a real cross-repo component of *how we build the stack*, security
  as a first-class thread). `audience:` platform / release / security engineers building
  supply-chain-secure CI/CD for a multi-repo Rust + container + CLI estate ·
  `repos:` trestle, mangrove, headwaters, breakwater, hydrofoil (the release pipelines) ·
  `src:` trestle · .github/workflows/{release-plz,release-binaries,bootstrap-publish}.yml
  (crates.io OIDC trusted publishing; SLSA binary attestations; Homebrew tap) · mangrove ·
  .github/workflows/docker-release.yml (cosign keyless signing + SBOM + provenance) ·
  the analogous docker-release/release-plz workflows in headwaters/breakwater/hydrofoil ·
  anchors: crates.io Trusted Publishing (OIDC), Sigstore (cosign/Fulcio/Rekor), SLSA
  build provenance + `actions/attest-build-provenance`, GitHub Actions OIDC / least-
  privilege `permissions`, Homebrew tap conventions · note: pin each workflow at its
  merged ref and re-verify at draft time (§6); do **not** claim a completed security
  review. **Producer/consumer pair** with the trusted-compute entry above (this
  produces the signed artifacts + checksums it consumes). Estate: the estate-wide
  release discipline underpinning the pre-release-honesty (§6) posture.

- [x] **Composable UI: copy visuals, package logic** — make the lakehouse UI itself
  composable. Distribute presentational components by copy (shadcn-style) and
  data-fetching logic by versioned package, behind a `design.md` token contract, so
  one headless component set serves three apps unchanged. → graduated to a brief:
  `blogs/headless-lakehouse-ui/`.
  `src:` hydrofoil/docs/portable-uc-components.md, mangrove/node/ui-kit/DESIGN.md,
  headwaters/node/lineage-ui/README.md (leads) · `repos:` mangrove, hydrofoil,
  headwaters · anchors: the public `design.md` convention, shadcn/Radix

- [ ] **stack-topology: model the arrows, not the boxes** — service-to-service
  addressing in a multi-service lakehouse env, as a pure, testable, WASM-clean Rust
  library where "the link-breaking case is unrepresentable." "Boxes are easy,
  arrows are hard" applied to the compose generator.
  `src:` trestle/crates/stack-topology/ (README + src/lib.rs) · `repos:` trestle

- [ ] **Keeping a multi-language code generator DRY** — how one proto-derived IR
  (`MethodShape`/`EmitShape`) feeds REST, Connect, Python, and Node emitters
  without drift; golden-snapshot regression as the oracle.
  `src:` trestle/crates/olai-codegen/docs/codegen-design.md · `repos:` trestle

- [ ] **`olai-store`: a TAO-inspired resource store, adjusted for the lakehouse** —
  the architectural *why* behind the store the golden-path post uses: we wanted a
  resource store aligned with lakehouse needs, so we built one on Facebook TAO's
  object/association data model and adjusted it — **names and namespaces are
  first-class** (catalog/schema/table is the native shape, `ResourceName` + namespace-
  prefix listing + cross-subtree rename), **ids are time-ordered UUIDv7** — which
  buys two things from one choice: "connections since T" becomes an index-friendly
  range (`ORDER BY id DESC` = most-recent-first, no separate timestamp column), *and*
  the ids are monotonic/sortable, so a client can order and merge them locally and
  frontend caches behave (append-friendly, stable ordering). Edges are v7 today;
  **nodes/objects are moving from v4 to v7 as well** (in progress, expected to land
  before this post publishes) — verify at draft time and frame v7-for-both as the
  design, with objects also carrying a monotonic `version` field bumped per mutation.
  And **sensitive-data handling is
  built in**, not bolted on: `ManagedObjectStore` + `ResourceRegistry` enforce field
  roles (data / identifier / managed / sensitive) derived from codegen annotations,
  and envelope encryption seals sensitive fields (writing a sensitive field through an
  unencrypted store is a *hard error, never a silent drop*). The thesis: because we
  take security seriously by default, this deploys deep into production systems from
  the get-go — we *do* trade performance for simplicity, but there's a deliberate
  **off-ramp** (swap the backend for a production engine behind the same traits), and
  the **same encryptor is reusable by integrations** to seal their own data.
  Design/thought-leadership register — the Trust-arc counterpart to the Casper
  golden-path *how-to* (cross-link, don't duplicate; that post *shows* the store, this
  one *argues* its design). `audience:` platform / backend engineers designing a
  metadata/resource store for a data platform · `repos:` trestle
  (`crates/olai-store`, `crates/olai-codegen` for the annotation→field-role tie-in) ·
  `src:` trestle · crates/olai-store/src/{lib,store,object,managed,encryption}.rs ·
  olai-store-v0.0.4 (TAO-inspired module doc; UUIDv7 "connections since T"; namespaced
  ResourceName; ManagedObjectStore field roles; the crate's own "favours simplicity
  over performance … back with your own production engine" off-ramp) · anchors:
  Facebook TAO paper (Bronson et al., USENIX ATC 2013), Google AIP resource design ·
  note: envelope encryption is landing on feat/olai-store-envelope-encryption
  (in progress) — verify at the merged ref; the debug/sensitive-annotation and
  shared-encryptor-for-integrations angles are leads to confirm in the brief (§6).

- [ ] **Agent-facing question-verbs for a lineage CLI** — the altitude between one
  command per endpoint and one per scenario: task-shaped verbs that return the
  *answer*, proven on the PII/GDPR data-map / right-to-erasure question.
  `src:` headwaters/docs/adr/0014-agent-facing-cli-question-verbs.md,
  headwaters/docs/agent-cli-design.md · `repos:` headwaters

- [ ] **Driving the lakehouse from an agent harness** — point Databricks **Omnigent**
  (a new agentic meta-harness) at our agent-optimized lakehouse CLIs (`hw` and the
  others as they adopt the register) and show the lakehouse being *operated by* an
  agent — "open lakehouse **and AI**" made concrete; maybe weave governance in (an
  agent acting under policy). The upstream companion to the question-verbs idea above:
  that post *builds* the agent-optimized CLI; this one *drives* it from a harness.
  `repos:` headwaters (+ mangrove/hydrofoil CLIs as they adopt the register) ·
  `audience:` platform / AI engineers wiring agents to real data-platform tooling ·
  note: confirm Omnigent's **public/announced status first** and re-anchor on a public
  source before drafting — it may be internal/pre-release (see CONVENTIONS §6 and the
  "find the public anchor first" rule); the governance-in-the-harness angle is a
  speculative lead to confirm. Estate pattern: `agentic-cli` (see
  [`../architecture/estate.yml`](../architecture/estate.yml)).

- [ ] **Capturing lineage at planning time** — column-level OpenLineage from
  DataFusion at planning time, and the DDL edge cases the planner hides (CTAS /
  CREATE VIEW run before the instrumented planner sees the plan); `begin_lineage`
  as a composable step you can sequence after a policy gate.
  `src:` headwaters/crates/open-lineage/src/rule.rs · `repos:` headwaters

- [ ] **Composable Rust services** — `Arc<dyn Trait>` + a `Provides*` compile-time
  DI pattern; extracting portable business logic behind a narrow port trait
  (`DeltaBackend`) so two servers share one implementation.
  `src:` mangrove/docs/.../explanation/service-composition.mdx,
  mangrove/lakekeeper-delta-api-feasibility.md · `repos:` mangrove, lakekeeper

- [ ] **Speak `object_store`, get the ecosystem** — the mangrove `object_store` crate
  fuses **UC credential vending + object storage** behind the standard
  [`object_store`](https://docs.rs/object_store) trait, so *any* consumer that takes
  an `Arc<dyn ObjectStore>` (DataFusion, `delta_kernel`, `parquet`, …) reads and
  writes UC-governed volumes/tables/external-locations **with no extra glue** — and a
  `uc://` URL scheme addresses securables directly (`uc:///Volumes/<cat>/<schema>/…`,
  vended via `temporary-path-credentials`). The thesis: **implement one known
  protocol and inherit its whole ecosystem** — this baseline crate is what gives
  UC-governed storage *reach*, feeding the Python `obstore`/`fsspec` world and serving
  as the foundation Hydrofoil's portal **Files API** is built on (so the volume
  abstraction becomes something the existing ecosystem already knows how to use). It's
  the *infra/reach* counterpart to the platform/application "Volumes: the file
  abstraction" entry below — **that** post builds product surfaces *on top of* volumes;
  **this** post is the crate *beneath* that gives volumes their reach. Design /
  thought-leadership register — a natural Building-the-Open-Lakehouse arc entry
  (bringing the table-governance patterns — vending, safe-by-default — to unstructured
  / volume data). `audience:` Rust + Python data engineers who want UC-governed storage
  inside the tools they already use · `repos:` mangrove (the object-store crate),
  hydrofoil (portal Files API as a downstream consumer) · `src:` mangrove ·
  crates/object-store/src/{lib,credential}.rs (the `object_store`-trait adapter,
  `UnityObjectStoreFactory`, the `uc://` URL grammar; published as
  `olai-uc-object-store`, code reads as `unitycatalog_object_store` — the alias
  direction is itself illustrative) · hydrofoil · crates/portal/src/store/ (Files API
  built on it) · anchors: the public `object_store` crate + its trait, the
  Databricks/UC temporary-path-credentials (credential-vending) API, the Python
  `obstore`/`fsspec` ecosystems · note: verify the Python-`obstore` reach is wired vs.
  aspirational at brief time and disclose (§6); depends on mangrove's move-fast /
  fewer-guarantees posture. Estate: mangrove catalog plane + the `composition` pattern;
  cross-links the "Volumes" application entry.

### Feature walkthroughs

A register of their own: teach one Delta / Unity Catalog feature by *showing it
work*, engine by engine, from a runnable example up to the harder cases the simple
demo hides. The `unity-catalog-storage` post is the exemplar. Prefer real,
verified `snippets/` (§5) over sketches; be honest about pre-release status (§6).

- [ ] **Metric views: one YAML, many engines** — translate a metric view's YAML
  definition into a portable AST (via [SQLGlot](https://github.com/tobymao/sqlglot))
  and emit dialect-correct SQL for several engines, plus a DataFusion integration —
  so a semantic layer defined once runs everywhere. `audience:` data engineers /
  platform builders who know SQL and semantic layers but not metric-view internals ·
  `repos:` (MVP library — TBD; SQLGlot for YAML→AST→SQL, DataFusion integration) ·
  note: MVP / pre-release — anchor on the public metric-views spec and SQLGlot;
  disclose library status, don't present it as shipping (§6).

- [ ] **The variant type across engines** — Delta's `variant` semi-structured
  type, shown reading/writing the same data across Delta Lake (Spark), delta-rs,
  and DuckDB; where support is solid, where it's rough, and what we had to upstream
  to make the cross-engine story hold. `audience:` engineers with semi-structured
  (JSON) data who want open-format, engine-portable storage · `repos:` delta-lake
  (Spark), delta-rs, duckdb · anchors: the Delta variant spec + Spark variant
  encoding · note: may surface/upstream gaps — write against what's real today and
  disclose any pending PRs (§6).

- [ ] **Transaction IDs: exactly-once ingestion in Delta** — Delta's transaction-id
  (app-id + version) feature is deceptively simple to store but needs real
  application-side logic to use; build the canonical example — ingest a stream
  (Kafka-style offsets) into a Delta table with DuckDB, buffering + idempotent
  commits keyed on transaction id — then map out the harder state-tracking
  scenarios the toy example doesn't cover. `audience:` engineers building ingestion
  / streaming pipelines onto Delta who want exactly-once without a full stream
  processor · `repos:` delta-rs, duckdb · src: build a runnable example
  (Python; docker compose only if a real stream source is needed) · anchors: the
  Delta protocol's transaction-identifiers / app-level idempotency section.

- [ ] **Volumes: the file abstraction you build a platform on** — UC volumes look
  like a plain "put files somewhere" primitive, but a thin `FileStore` abstraction
  over them is what lets you semantically wrap files into product surfaces: a
  file-backed SQL editor (a tab *is* a `.sql` file in a volume), a marimo notebook
  spawned from a `.py` file, workspace-like concepts — and, looking ahead, Open
  Sharing constructs like **agent skills** (a skill is just a directory of files, so
  an API over the volume abstraction exposes it almost for free). General "why
  volumes are powerful" framing, anchored on a real application in our stack. **Sits
  atop** the "Speak `object_store`, get the ecosystem" entry above — that crate is the
  reach/infra layer beneath the FileStore surfaces this post builds; cross-link the two
  (altitude split: infra/reach vs platform/application), don't duplicate.
  `audience:` platform / application builders on UC who see volumes as dumb storage
  and are missing the leverage · `repos:` hydrofoil (desktop app: portal `FileStore`
  / `UnityVolumeStore`, the SQL editor + marimo notebook panes), unitycatalog ·
  `src:` hydrofoil · crates/portal/src/store/{mod,unity}.rs (FileStore trait +
  UnityVolumeStore, credential vended at volume root) · node/ui/src/components/editor/
  (NotebookPane marimo `.py` spawn, useTabPersistence `/Volumes/…` tab persistence) ·
  marimo-v0.0.12-39-g2972b32 (verify at brief time) · anchors: the Databricks Files
  API / UC volumes REST surface · note: SQL-editor + notebook-from-volume are real
  today; agent-skills-over-volumes is the illustrative *extension* — mark it
  forward-looking, don't present it as shipped (§6).

## Notes

- **Two arcs, split by register.** [`SERIES.md`](./SERIES.md) now runs two arcs
  that differ by *intent*, not topic: **Building the Open Lakehouse** (architecture /
  technology walkthrough — the *why* + how we build the stack from OSS + custom
  components like Trestle and `olai-store`; trust & security threaded throughout,
  reframed from the narrower "Trust in the Open Lakehouse") and **Chef Casper's Ghost
  Kitchen** (hands-on how-to via one running example — the *how*). The Casper arc is
  now real (its first post, `trestle-golden-path`, has a brief). Topic overlap between
  the arcs is expected and fine — the same subject can be *argued / walked through* in
  Building and *shown working* in Casper; cross-link the counterparts rather than
  duplicate.
- **Candidate future Casper how-tos.** The WASM and headless-UI briefs are
  standalone for now but each has a how-to spine; they're natural future entries in
  the Casper arc once the running example needs them.
- **Feature walkthroughs are a register, not (yet) a series.** The grouped entries
  above (metric views, variant, transaction IDs) and the shipped
  `unity-catalog-storage` post share a shape — teach one feature by showing it work,
  engine by engine, from a runnable example up to the cases the demo hides. They
  don't share a through-line the way the two `SERIES.md` arcs do, so they stay a
  register in `IDEAS.md` rather than a fourth arc. Promote to a series only if a
  real narrative connects them.
- **Existing content stays home.** Posts already living in `openlakehouse-io`
  (a live site) and drafts in `trestle/examples` are referenced by `src:`
  pointers, not migrated — those repos remain authoritative.
