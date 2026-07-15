---
title: A lakehouse in the browser tab — DataFusion + Delta on WASM
slug: wasm-lakehouse-preview
status: brief
date: 2026-07-10
tags: [wasm, datafusion, delta-lake, unity-catalog, lakehouse, rust]
series:
series_order:
author: Robert Pack
target: company blog
---

# Brief: A lakehouse in the browser tab — DataFusion + Delta on WASM

> Seeded from mangrove's internal execution plan
> (`mangrove/WASM_QUERY_PREVIEW.md`, "planned/DONE phases 0/A/B as of 2026-07-05")
> and the `crates/query-wasm` code — both **pre-release** (mangrove carries an
> experimental banner; the engine depends on personal `roeap/*` git forks of
> delta-rs / delta-kernel-rs / arrow-rs pinned by rev). Treat the internal doc as
> an unlisted lead; the post re-anchors on the **public** DataFusion and delta-rs
> `deltalake-wasm` work and the UC Delta API spec (§6), and **discloses** the fork
> dependency rather than presenting it as shipping product (§9).

## 1. Hook / thesis

You can run a real query engine — DataFusion + Delta compiled to `wasm32` —
inside the browser tab. It reads cloud object storage directly using short-lived
credentials the catalog vends, previews a Delta table with no dedicated
server-side query service in the middle, and falls back to a server path exactly
when the browser can't make a safe correctness claim.

## 2. Audience

Engineers building data UIs and lakehouse tooling who assume "query = round-trip
to a backend." Comfortable with the browser platform, Arrow, and the idea of a
query engine; do not assume they've compiled a Rust data stack to WASM or know
how credential vending works — explain both.

## 3. Tone / voice

First person, engineering-log honesty. Excited about the capability but candid
about the sharp edges (what v1 does *not* do; why the fallback exists). Lead with
the demo, then the "how is this even possible" mechanics. Standalone post; a
natural future *how-to* entry in the Casper arc, but not filed there yet.

## 4. Key takeaways

- A columnar engine (DataFusion) plus a table reader (Delta via delta-rs) compile
  to `wasm32` and run in a Web Worker — the query executes in the tab.
- The catalog vends short-lived, down-scoped credentials; the browser turns them
  into a fetch-backed object store and reads storage directly.
- Anything that emits Arrow IPC slots into the data grid unchanged — the WASM
  engine is one producer behind a stable seam, with a server path as the default
  and the fallback.
- Honest boundaries matter: a capability probe decides WASM-vs-server per table
  (v1 is read-only, Delta-only, classic checkpoints, no deletion vectors, SAS/OAuth
  first) — the fallback is a feature, not a failure.

## 5. Outline

1. **The preview that never hits a query server** (intro) — the demo: click a
   table, see 100 rows, no backend query. Answer-first.
2. **What has to compile to WASM** — DataFusion + Delta on `wasm32`; the Web
   Worker; the Arrow-IPC seam into the grid.
3. **Reading storage from a tab** — UC `loadTable` + vended temporary credentials
   → a fetch-backed object store. *(code sample)*
4. **Knowing your limits** — the capability probe; the v1 envelope; when and why
   it falls back to the server. *(code sample)*
5. **The build reality** — the honest hook: a standalone cargo workspace so a
   WASM-only `[patch.crates-io]` (dropping C-backed zstd/brotli codecs) doesn't
   strip those codecs from the native server; forked crates, pinned by rev.
6. **Where this goes** — the "mini lakehouse in the UI" as a composability story.

## 6. Source material

- *Public anchors (load-bearing):*
  - Apache DataFusion — WASM support / `wasm32` target (docs + example; URL at
    draft). The engine choice rests on public DataFusion.
  - delta-rs `deltalake-wasm` — the browser Delta facade the engine wraps
    (`delta-io/delta-rs`, pin the public ref; note where the post relies on a fork
    and say so).
  - Unity Catalog Delta API — `unitycatalog/api/delta.yaml` `loadTable` +
    `temporary-{table,path}-credentials` (the credential-vending calls). Already a
    verified surface (see the `unity-catalog-delta-api` post's notes).
- *Leads (internal / pre-release — do not quote as shipped):*
  - `mangrove · WASM_QUERY_PREVIEW.md — the phased execution plan + locked
    decisions.`
  - `mangrove · crates/query-wasm/ (olai-uc-query-wasm) — the glue: resolve →
    creds → fetch store → open Delta → stream Arrow IPC.`
  - `mangrove · node/query-wasm/ + node/data-grid/ — the JS worker + the
    ArrowResultStore grid seam.`
- *Prior art:* the general "engine-in-WASM" pattern (DuckDB-WASM, etc.) — this
  post's difference is *Delta + UC credential vending + a correctness-driven
  server fallback*, not just an engine in a tab.

## 7. Call to action

Try the public `deltalake-wasm` example against a Delta table; read the DataFusion
WASM notes. (If/when a public demo exists, link it — otherwise keep the CTA on the
public building blocks, not the internal preview.)

## 8. Publishing target / format

Company blog. Standalone. Code samples are the load-bearing content — every one
must run against a **public** ref (delta-rs `deltalake-wasm`, DataFusion), kept in
`snippets/` per the runnable-examples convention; the mangrove-internal glue is
described, not pasted. A short architecture diagram (browser ↔ storage, no query
server) in D2 if used.

## 9. Verification / accuracy notes

- **Status honesty (load-bearing, not a blocker):** the engine currently depends
  on **personal `roeap/*` forks** and partly-unshipped work. We publish as we
  develop and update as it lands — so pre-release status does **not** block this
  post. What's required: don't present forked/unreleased code as a stable product;
  where the real system needs a fork, state that plainly as today's reality; prefer
  a public release for a runnable snippet where one exists, and revisit as the forks
  upstream. Describe the current phase truthfully rather than as a finished feature.
- Re-verify the UC `loadTable` / temporary-credentials calls against the public
  `delta.yaml` at draft (reuse the `unity-catalog-delta-api` verification).
- Confirm the zstd/brotli `[patch.crates-io]` / standalone-workspace detail is
  describable from public understanding (it's a general cargo-patch-is-global fact)
  without leaking mangrove specifics.

## 10. Open questions / risks

- Is there (or will there be) a **public** demo or a published `deltalake-wasm`
  release the post can point a reader at? This shapes how concrete the CTA and
  snippets are — but it's not a gate: publish against the current state, disclose
  the fork/pre-release status, and update the post (and CTA) as the public pieces
  land.
- COI/disclosure: Databricks author, open-lakehouse project — disclose per target.
- Decide whether to name the internal engine crate at all, or keep the post purely
  on the public building blocks + the pattern.
