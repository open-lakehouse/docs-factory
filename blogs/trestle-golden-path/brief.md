---
title: One proto file, a whole app — the Trestle golden path
slug: trestle-golden-path
status: draft
tags: [lakehouse, rust, codegen, unity-catalog]
series: Chef Casper's Ghost Kitchen
series_order: 1
author: Robert Pack
target: openlakehouse
---

# Brief: One proto file, a whole app — the Trestle golden path

> Seeded from the DevRel narratives that used to live in the trestle repo's
> `examples/` — now **moved here** as the canonical copy under [`source/`](./source/)
> (`NARRATIVE.md`, `JOURNAL.md`, `drivers-blog/`), so this repo is the single home
> for the blog material (no duplicate copies in the code repo). trestle
> (`open-lakehouse/trestle`, Apache-2.0) remains authoritative for the *code* the
> post cites — the CI-verified `examples/golden-path-app` — which every "trestle
> generates X" claim must trace to; verify against it at draft time (§9).

## 1. Hook / thesis

Annotate a few protobuf messages, run one tool, and you get a
Databricks-deployable Rust app whose **REST API and a ConnectRPC API run
side-by-side on a single port**, both backed by one hand-written business core,
with a typed client and a React front-end generated for free. The proto is the
source of truth; everything else is derived.

## 2. Audience

Backend/platform engineers who reach for a full service scaffold and find it
"too heavy for something this small." Comfortable with protobuf, REST, and Rust
basics; do **not** assume prior ConnectRPC or codegen-framework knowledge —
explain the dual-protocol payoff and why one core serves both.

## 3. Tone / voice

First person, DevRel, show-don't-tell. Opinionated on the payoff ("this is
exactly where a code generator earns its keep") but honest about seams. Told as
one continuous build story — **Chef Casper's Ghost Kitchen** driver check-in app
— so every abstract capability lands on a concrete need. This is the *how-to*
register of the Casper arc, the counterpart to the design/thought-leadership
register of the Trust arc (cross-link, don't duplicate).

## 4. Key takeaways

- Describe the domain once in annotated proto; get server, API, typed clients,
  and a web app from one command (`trestle new` + `trestle generate`).
- REST and Connect want differently-shaped handlers; the clean resolution is a
  **protocol-neutral core with two thin adapters**, mounted on one port.
- Connect reuses the same generated model crate REST already produces — no second
  model generation.
- Generated handlers are **generic over the request context** (`Handler<Cx>`): the
  crate that owns an API owns its routes, validation, and action vocabulary, and the
  host owns `Cx` — how it's populated (an auth layer + extractor) and how it's
  judged (a `Policy<Cx>`). That's what lets a whole API crate (mangrove's Delta API)
  drop into a different server (Lakekeeper) with that server's own auth model.
- Trestle follows the **Unity Catalog** design: flat, top-level routes with the
  hierarchy *discovered* from `resource_reference` edges, not nested collections.
- The **generated** store is generic — every resource is an `Object<L>` in one
  table, routed by a typed `Label` — so you get end-to-end and deployed *first*.
  Trestle stops there **by design**: the scaffold can't know which of your
  resources deserves a bespoke schema, so it doesn't try. A dedicated table is
  **adopter code** — in the post we hand-write a `Label`-routed backend for one
  resource (the extension point trestle gives you, not codegen output), and iterate
  its schema safely on a **lakebase / Neon Postgres branch** before it touches
  production. Same store trait; the generic path is generated, the dedicated one you
  carve out yourself.
- A usable baseline still has to be **opinionated where it matters**: the generic
  store the template ships doesn't punt on sensitive data. `FieldRole::Sensitive`
  fields are sealed at rest with **envelope encryption** (a fresh AES-256-GCM data
  key per value, wrapped by a KEK from a pluggable `KeyProvider` — local by default,
  KMS later), bound to the row so a ciphertext can't be relocated, and rotatable by
  re-wrapping without re-encrypting. Safe-by-default from the first `trestle generate`,
  not an adopter's later retrofit.

## 5. Outline

1. **The app that's too small for a backend project** (intro) — Casper's problem:
   who's checked in, which order did they take. Set the golden-path promise.
2. **Model the domain in proto** — the `Driver` / `Order` resources; field
   behaviors; proto as source of truth. *(code sample)*
3. **One command, a running app** — `trestle new` / `generate`; what lands
   (server, clients, store, web app). *(code sample)*
4. **One core, two protocols, one port** — the protocol-neutral core + REST/Connect
   adapters; the `Router::merge(...).fallback_service(...)` mount. *(code sample)*
5. **Who's asking? One generic context, wire to policy** — §4 makes the core
   protocol-neutral; this makes it *host*-neutral. Beats, one small abridged
   sample each: (a) the generic is the contract — `trait DriverHandler<Cx =
   RequestContext>`, route fns generic `<T, Cx>`; (b) populated once at the edge —
   a tower auth layer puts an identity in the request extensions, an extractor
   (`FromRequestParts`, or delta-api's async `ContextExtractor`) turns it into `Cx`;
   (c) propagates by type — `Cx` is chosen once at mount time and the compiler
   threads it to every handler; (d) how the layers play together (one diagram);
   (e) it lands in `Policy<Cx>::authorize(resource, permission, &cx)`, with the
   request naming its own resource + permission (`SecuredAction`) so a handler
   authorizes in one line; (f) payoff — the Delta API crate's narrow
   `DeltaBackend<Cx>` port + crate-owned `DeltaAction` lets mangrove and Lakekeeper
   mount the same API under two different auth models. *(code samples)*
6. **The client and the screen for free** — typed client + the React check-in
   screen. *(code sample)*
7. **Carving a resource onto its own table** — the golden path's storage
   progression, and where the scaffold hands off to you. Ship on the *generated*
   generic `Object<L>` store first (one table, routed by `Label`). Then, when a
   resource warrants a bespoke schema, **we hand-write** a `Label`-routed backend
   for it — trestle deliberately doesn't generate this, because it can't know your
   domain — and migrate/iterate that schema safely on a lakebase / Neon Postgres
   branch before promoting. The typed `Label` is the routing seam trestle exposes;
   `FieldRole::Sensitive`→`SecretManager` is the precedent that routing is already
   how the store works. **The load-bearing mechanic (a real learning):** your
   dedicated table needs its own DDL, and that DDL must ride the *same* migration
   ledger as the store's schema — not a second, racing one. `olai_store` exposes its
   migrations as data (`migrator()` / `sql_migrator_with(extra)`) and its
   `SqlStore::connect` deliberately does **not** migrate, so the app merges its own
   migrations into one `Migrator` / one `_sqlx_migrations` table. A version-range
   convention keeps them from colliding — store schema at `0001+`, app schema at
   `0100+`. Shown working for SQLite in mangrove; Postgres next. *(code sample —
   adopter code, not generated)*
8. **Opinionated by default: sensitive data at rest** — why a *usable* baseline
   still can't punt on sensitive data. The same `FieldRole::Sensitive` seam that
   routes secrets out of the searchable payload also seals them with envelope
   encryption in the generated store: per-value AES-256-GCM data key, wrapped by a
   pluggable-`KeyProvider` KEK (local now, KMS later), AAD-bound to the row, rotatable
   by re-wrap. The template ships this so the golden path is safe-by-default, not a
   later retrofit — the concrete face of "opinionated but usable from the get-go."
   *(code sample)*
9. **Where the generator earns its keep** — the payoff, honest seams, and what to
   reach for it (and not).

## 6. Source material

- *Narrative leads (now local — canonical here):*
  - `source/drivers-blog/NARRATIVE.md — the story arc + key design (Driver/Order
    proto, DriverCore + adapters, WASM React check-in).`
  - `source/NARRATIVE.md — the "Golden Path" one-core / two-protocol / one-port
    design in general terms.`
  - `source/drivers-blog/handler-core-sketch.md — the implement-once-serve-twice
    handler shapes.`
  - `source/JOURNAL.md — the honest end-to-end build log behind the golden path.`
- *Code (cross-repo, verify against these):*
  - `trestle · examples/golden-path-app · (public, CI-verified) — the working app
    every "trestle generates X" claim must trace to.`
  - `trestle · examples/drivers-blog/proto/caspers/drivers/v1/ · (public) — the
    real Driver/Order proto the narrative describes.`
  - `trestle · docs/architecture.md · (public) — the proto→codegen pipeline and the
    "flat routing, discovered hierarchy" UC-aligned design decision.`
  - `trestle · crates/olai-store/src/store.rs, label.rs, managed.rs · olai-store-v0.0.4
    (public) — the store traits; Label as the routing discriminant ("routing operations
    to the correct backend or handler"); FieldRole::Sensitive→SecretManager as the
    shipped per-field routing precedent for the per-resource dedicated-table extension.`
  - `trestle · crates/olai-store/src/backend/{mem,sql}.rs + Cargo.toml · olai-store-v0.0.4
    (public) — InMemoryStore + the sqlx SqlStore behind the sqlite/postgres features; the
    generic single-objects-table strategy (op_create → INSERT INTO objects) the post
    contrasts a dedicated table against. NOTE: the dedicated per-resource table is
    ADOPTER code we write in the post, NOT codegen output — trestle generates only the
    generic path (§9). The postgres feature + sqlx/migrate are the real primitives the
    hand-written backend + the lakebase/Neon branch workflow build on.`
  - `trestle · crates/olai-store/src/encryption.rs + managed.rs · branch
    feat/olai-store-envelope-encryption (IN-PROGRESS, merging soon — verify at the
    merged ref before publish) — envelope encryption for FieldRole::Sensitive fields:
    per-value AES-256-GCM DEK wrapped by a KEK from the pluggable async KeyProvider
    (LocalKeyProvider default; Azure/AWS/GCP/Databricks KMS pluggable later),
    self-describing Envelope records the KekId for rotate-by-rewrap, AAD-bound to the
    object UUID; ManagedObjectStore seals sensitive values without touching the
    searchable properties payload. This is the "opinionated but usable baseline" claim.`
  - `mangrove · crates/sqlite/src/store.rs (unified_migrator / LOCAL_MIGRATOR) · v0.0.5-51-gd10fa26
    (public) — the real "combine store + app migrations" learning: olai_store::sql_migrator_with
    merges the crate-local migrator (sqlx::migrate!()) into ONE Migrator sharing one
    _sqlx_migrations ledger; local migrations versioned 0100+ vs olai_store's 0001+ so they
    interleave without collision. mangrove's SqliteStore also carries an EnvelopeEncryptor
    field — the §8 encryption story is live here for SQLite. NOTE: Postgres is the NEXT
    application of this (in progress) — SQLite is what's shown working today (§9).`
  - `trestle · crates/olai-store/src/backend/sql.rs (migrator / migrator_with / migrate;
    "SqlStore::connect assumes an already-migrated pool and runs no migrations") ·
    olai-store-v0.0.4 (public) — the store side of the contract: migrations exposed as data,
    no eager migrate-on-connect (avoids every process racing the advisory lock on boot), so
    the adopter owns one gated migrate step.`
  - `trestle · crates/olai-codegen/src/codegen/{handler,server}.rs + examples/golden-path-app
    (codegen/greeting/{handler,server}.rs, api/context.rs, main.rs) · 1af79ee (public) — the
    generated seam for §5: handler traits generic `<Cx = server.context_type>`, route fns
    generic `<T, Cx: FromRequestParts<T>>`, `Cx` bound by turbofish at mount; the adopter's
    `RequestContext` built from `x-forwarded-*` headers. No policy layer in trestle.`
  - `mangrove · crates/server/src/rest/auth.rs (Authenticator<I>, AuthenticationLayer),
    crates/server/src/policy/mod.rs (Policy<Cx>, ProvidesPolicy), crates/server/src/api/mod.rs
    (SecuredAction), crates/handlers/src/context.rs (RequestContext{Principal}) · 193a899e
    (public) — population (layer → request extensions) and the policy end of §5.`
  - `mangrove · crates/delta-api/src/{backend,authz,handler,router}.rs · 193a899e, crate
    v0.0.6 (public) — the embeddable API: DeltaBackend<Cx> port with ONE authorize hook,
    #[non_exhaustive] DeltaAction vocabulary, blanket DeltaApiHandler<Cx> owning Delta
    semantics, async ContextExtractor<Cx> + router_with_context_at<S, Cx> -> Router<S>.
    Mangrove's adapter: crates/server/src/services/delta_backend.rs; its extractor:
    crates/server/src/rest/routers/mod.rs (create_delta_router).`
  - `lakekeeper (fork roeap/lakekeeper) · branch feat/delta-v1-read-path @ c2d026fb, pins
    delta-api 0.0.5 (UNMERGED) — crates/lakekeeper/src/server/delta/{context,router,backend}.rs:
    DeltaRequestContext{RequestMetadata, WarehouseId}, extractor 401s without metadata and
    resolves {prefix} → warehouse, authorize maps DeltaAction onto Lakekeeper's Authorizer
    and fails closed on unknown/unserved actions.`
- *Prior art:* general proto-first framers (Buf/Connect docs, Google AIP). This
  post's angle differs: one *core*, two protocols on one port, plus a generated
  web app — not just a compiler.
- *External refs:* Buf / ConnectRPC docs (URL at draft); Google AIP resource
  design (`google.api.resource` / `field_behavior`).

## 7. Call to action

Try it: `cargo install olai-trestle`, scaffold the driver app from the example
proto, run it, hit both the REST and Connect endpoints. Link the crate and the
example directory.

## 8. Publishing target / format

openlakehouse. First post of the **Chef Casper's Ghost Kitchen** arc (`SERIES.md`)
— must stand alone while opening the running-example storyline the later how-to
posts continue. Code-heavy; every sample pulled from and verified against the
public example app (§5 runnable-examples convention where a sample is worth
running). Diagrams (the one-core/two-adapter mount) authored in D2 if used.

## 9. Verification / accuracy notes

- **Anti-leak check:** trestle is public/Apache-2.0, so the code is citable — but
  the NARRATIVE prose is pre-publication *lead*, not a quotable source. Every
  concrete claim must be re-verified against the CI-verified `examples/golden-path-app`
  at the pinned ref before publish; the driver app is described as "not yet built"
  in the narrative, so confirm what actually exists vs. what the story projects.
- Pin every code link to a tag or SHA (the crate is `0.0.x` — API may move).
- Confirm the exact `trestle` CLI verbs and the `Router` mount code against the
  repo at draft time; do not hand-wave the dual-protocol wiring.
- **Store progression — generated vs. adopter code (the load-bearing distinction).**
  Real *and generated* at `olai-store-v0.0.4`: the generic single-`objects`-table
  store, the typed `Label` routing discriminant, `InMemoryStore` + sqlx `SqlStore`,
  the `postgres` feature (with `sqlx/migrate`), and `FieldRole::Sensitive`→
  `SecretManager` per-field routing. **Adopter code (what the post writes, NOT
  codegen):** the dedicated per-resource table and its `Label`-routed backend.
  Trestle does not — and by design cannot — emit a dedicated table, because the
  scaffold can't know which resource warrants a bespoke schema; do **not** imply
  `trestle generate` produces one. Frame the dedicated table as "here's what you
  build on trestle's routing seam." The lakebase / Neon Postgres-branch migration
  workflow is a *pre-release* practice around that adopter code — disclose it as
  direction, don't present it as a shipped `trestle` feature. Re-verify the generic-
  store claims against `op_create` / the `objects` schema at the pinned ref.
- **Combined-migrations mechanic — SQLite real, Postgres next.** The "merge your
  dedicated-table DDL into the store's migration ledger" claim is verified working
  for **SQLite** in mangrove (`unified_migrator` → `olai_store::sql_migrator_with`,
  one `_sqlx_migrations` table, `0001+`/`0100+` version ranges) at
  `v0.0.5-51-gd10fa26`. The **Postgres** store is where this is being applied
  **next** (in progress) — write the mechanic against the SQLite code that exists;
  frame Postgres (and the lakebase/Neon branching that rides on it) as the landing
  next step, not as shipped. Confirm the exact `sql_migrator_with` API and the
  version-range convention against the pinned refs at draft time.
- **Envelope encryption — in-progress, verify at the merged ref.** The sensitive-
  data-at-rest story lives on branch `feat/olai-store-envelope-encryption` and is
  **actively being implemented / merging soon**, not yet on `main`. Do not draft the
  §8 (opinionated-baseline) section as shipped until it lands; then pin to the merged
  tag/SHA and re-verify against `encryption.rs` + `managed.rs`. Cite it as
  developed-and-landing (§6 publish-as-we-develop allows this) but disclose the status
  plainly; confirm what the template *actually* ships by default vs. what is opt-in
  (does `trestle generate` wire the `EnvelopeEncryptor` in, or is it a config step?),
  and keep crypto specifics (AES-256-GCM, per-value DEK, KEK-wrap, AAD-to-UUID,
  rotate-by-rewrap) matched to the code — don't paraphrase the scheme loosely.
- **Generic context (§5) — what trestle generates vs. what the servers built.**
  Trestle generates only the `Cx` seam (generic handler traits + route fns); the
  adopter writes the context type, and the auth layer + `Policy<Cx>` are mangrove
  code built on that seam. Don't imply `trestle generate` emits authz.
- **Connect doesn't carry `Cx` yet.** The generated Connect trait takes
  `connectrpc::RequestContext`, not the app's `Cx`; in golden-path-app the identity
  reaches REST handlers only. State it as a seam, or close it before publish.
- **"One authorization seam" is the crate's contract, not yet every adapter's.**
  delta-api's docs say data methods never authorize and `authorize` is the single
  hook; mangrove's adapter (`delta_backend.rs` ~L359) leaves ReadTable/Delete/Rename/
  vend/CreateStaging arms as `Ok(())` and relies on the downstream UC handlers'
  `check_required`. Lakekeeper's adapter does centralize it. Either fix mangrove or
  word the claim as the crate's contract and show Lakekeeper's arm.
- **Lakekeeper is in progress.** The integration is an unmerged branch on a fork,
  pinned to delta-api 0.0.5 (mangrove is at 0.0.6, with a breaking change). Disclose
  as work in progress; re-pin if it merges upstream before publish.

## 10. Open questions / risks

- Does the driver check-in app exist at draft time, or do we tell the story
  against `golden-path-app` and frame Casper as the illustrative framing? Decide
  before drafting (affects how literal the screenshots/snippets can be).
