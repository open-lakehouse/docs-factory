---
title: The Luminescent Lakehouse
slug: luminescent-lakehouse
status: idea
tags: [lakehouse, rust, datafusion, unity-catalog]
series: The Composable Lakehouse
series_order: 10
author: Robert Pack
---

_Research notes, not a post yet. Every finding is tagged **[verified]** (read
in Neon's docs or our source) or **[to test]** (needs a spike)._

**Thesis:** a basic lakehouse can run entirely on one serverless platform.
Neon gives us Postgres for metadata, S3-compatible object storage for data, and
Functions for compute. Our Rust services (a sharing server, a stripped-down
catalog, a Hydrofoil query engine) can run inside those Functions as a Node
native addon behind a thin `fetch` handler. Nothing runs until a request
arrives, and then the whole lakehouse lights up. That's the *luminescent* part.

"Basic" is the honest scope. There's no credential vending, because Neon has no
STS endpoint. Data access is either presigned URLs or the server reading on the
client's behalf.

## What Neon gives us

### Functions

- **[verified]** Node.js 24 on **linux arm64, glibc**. A macOS or x86_64
  binary won't load.
- **[verified]** The handler is a WinterTC `fetch` export, so a Hono app can be
  `export default app`. We already run one (`server/src/handler.ts`, `neon.ts`).
- **[verified]** Memory is fixed at 2048 MiB per isolate. Isolates are reused
  across requests, serve several in-flight requests at once, and don't share
  module state with each other.
- **[verified]** Time to first byte, `waitUntil`, and heartbeat each cap at 15
  minutes. SSE (`ReadableStream`) and WebSockets (`upgradeWebSocket`) work.
- **[verified]** Neon injects `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`,
  and, when the branch declares storage, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, and `AWS_REGION`.
- **[verified]** Native code loads. The archive is extracted to a read-only
  `/opt/function`, and `.node`/`.so` files load via `dlopen` even though the
  files arrive as mode 644. A self-built Rust `.node` ships with
  `bundler: "none"` or a custom bundler. `externalPackages` only takes npm
  packages that publish a linux-arm64-glibc prebuild.
- **[verified] The binding constraint is archive size:** at most **10 MiB
  zipped, 64 MiB unzipped, and 4,096 files**. Exceeding any of them fails the
  deploy.
- **[verified]** The Functions CLI is in beta. Our runbook notes the deploy
  must run detached (`scripts/deploy-neon-function.sh`) and that esbuild can
  silently drop WASM assets (`docs/design/authorization-model.md`).

### Object storage

- **[verified]** S3-compatible and path-style only. It accepts any signing
  region, and each branch has its own endpoint.
- **[verified]** Buckets follow branches: a child branch inherits its parent's
  buckets and objects and diverges copy-on-write. The database, the bucket, and
  the Function all fork together, so **every branch is a whole lakehouse**.
- **[verified]** Credentials are long-lived and branch-scoped, with
  `storage:read` or `storage:write` scope. There are **no temporary credentials,
  no STS, and no prefix scoping**. The `expires_at` field isn't enforced, so
  revoking and rotating credentials is the only access control.
- **[verified]** **Presigned URLs work.** A `storage:write` credential signs
  them server-side with SigV4, so they last at most 7 days.
- **[verified]** Objects can be at most 5 GiB. Multipart upload and range GETs
  are supported.
- **[verified] Conditional writes matter for Delta.** `If-None-Match` and
  `If-Match` are checked on a single `PutObject`, but ignored on
  `CompleteMultipartUpload`, `CopyObject`, and `DeleteObject`. There's no
  versioning (the version ID is always `null`), and append replaces the object.
  (Source: OpenDAL's S3 compatibility notes for Neon.)
  - A Delta `_delta_log/N.json` commit is a small single PUT, so put-if-absent
    *should* hold.
  - **[to test]** Whether it holds atomically with two concurrent writers.
  - The fallback is to coordinate commits in Postgres. Mangrove already has a
    Postgres `commit_coordinator`, which is also the catalog-managed commit
    path.

## What we have in Rust

- **Hydrofoil.** DataFusion 55 with delta-rs and delta-kernel.
  - **[verified]** It serves Flight SQL (tonic) and an axum
    `router(AppState)` with `POST /query` and a ConnectRPC `QueryService`.
  - **[verified]** Handlers are only partly separated from transport. There's
    no transport-neutral handler trait, and `plan_query` takes the concrete
    `FlightSqlServiceImpl`.
  - **[verified]** `desktop-host` already embeds it in-process for Tauri,
    which is a precedent for running it without a listener.
  - **[verified]** Addon blockers: git-pinned forks (delta-rs, mangrove,
    breakwater), mimalloc set as `#[global_allocator]` in `main.rs`, and code
    that assumes an ambient tokio runtime handle.
- **Mangrove.** The cleanest handler/transport split in the estate.
  - **[verified]** Generated `*Handler<Cx>` traits are blanket-implemented
    over `ResourceStore + Policy`, with axum routers layered on top.
  - **[verified]** `sharing-api` defines a `SharingBackend<Cx>` port. Its
    router sits behind a default-on `axum` feature, and the crate isn't wired
    into a server binary yet. CDF and async queries return 501.
  - **[verified]** It has a Postgres store (sqlx).
  - **[verified]** **It already ships a napi-rs 3.5 addon** (`node/client`)
    for linux gnu and musl. It wraps only the REST client, but the build
    pipeline exists.
- **unitycatalog-rs.** UC plus Delta Sharing on Postgres or Turso.
  - **[verified]** It has an `[aws] endpoint` setting for S3-compatible stores.
  - **[verified]** Handlers sit inline in the axum routes, so it's harder to
    embed than mangrove.
- **[verified] Neither server presigns URLs.** Both vend credentials
  through AWS STS, Azure SAS, or GCP downscoped tokens, and none of those work
  on Neon.

## Feasibility by component

| Component | Fit | Why |
| --- | --- | --- |
| Delta Sharing / Open Sharing server | **Best** | The protocol already returns presigned file URLs, which is exactly what Neon supports. It's read-only, needs no DataFusion, and keeps its metadata in Postgres. |
| Stripped-down Unity Catalog | Good for metadata | Catalog/schema/table CRUD on Postgres is fine. Without vending, clients either hold the long-lived Neon key or the server proxies the reads. Commits go through the Postgres coordinator. |
| Hydrofoil query engine | Plausible, size-bound | DataFusion + arrow + parquet + delta-kernel in one `.node` likely exceeds 10 MiB zipped. Scans are bounded by 2 GiB of memory. Results stream as Arrow IPC or JSON over a `ReadableStream`. |

What each component needs:

- **Sharing:** a presigning `SharingBackend`, using object_store's `Signer`
  for S3 with the injected `AWS_*` credentials.
- **Stripped UC:** a vending-off mode, with temporary-credential endpoints
  returning 501 or a proxy URL.
- **Hydrofoil:** size work first (`opt-level = "z"`, LTO, `codegen-units = 1`,
  `panic = "abort"`, `strip`, DataFusion feature pruning), then measurement.

## Binding shape

The goal is a thin JS layer that hands requests to native Rust.

- **(a) Request passthrough (preferred).** JS turns the `fetch` `Request`
  into method, URI, headers, and a body stream, then calls one napi function.
  Rust builds an `http::Request` and drives the axum `Router` as a
  `tower::Service` in-process, with no listener, then streams the response
  back. That gets maximum reuse of the existing routers and nearly zero JS.
- **(b) Typed methods per route**, like mangrove's codegen'd napi client. This
  is more JS surface. It's worth it only if we want JS to own routing and auth.
- Runtime notes:
  - napi's `async` feature owns the tokio runtime, so code that assumes an
    ambient handle must take one from napi.
  - Drop the global allocator in the addon build.
- Build: `napi build --release --target aarch64-unknown-linux-gnu
  --use-napi-cross`. aws-lc-sys needs a working C cross toolchain, which
  mangrove's CI already solves.
- WASM is the alternative, and it would avoid the architecture problem. It's
  not the first choice, because mangrove's `query-wasm` needed forked arrow-rs
  and object_store and its own workspace.

## Open questions / spikes

1. **[to test]** How big is a stripped arm64 `.node` for (i) the mangrove
   sharing router and (ii) Hydrofoil with DataFusion, zipped and unzipped?
   This decides everything else.
2. **[to test]** Does Neon storage hold put-if-absent with two concurrent
   writers racing on the same `_delta_log/N.json`?
3. **[to test]** Can a URL presigned with the Function's injected credentials
   be read by an external Delta Sharing client (Spark, `delta-sharing`
   Python, deltalake)?
4. **[to test]** How long is a cold start that `dlopen`s a ~50 MB addon?
5. **[to test]** Should Postgres be reached from Rust inside the isolate
   (sqlx over `DATABASE_URL`, pooled versus unpooled), or by calling back into
   a JS `pg` pool?
6. Where does auth go: Neon Auth JWT verified in JS and passed to Rust as a
   context, or verified in Rust?

## Sources

- Neon Functions skill: <https://github.com/neondatabase/agent-skills/blob/main/skills/neon-functions/SKILL.md>
- Native binaries reference: <https://github.com/neondatabase/agent-skills/blob/main/skills/neon-functions/references/native-binaries.md>
- Neon storage authentication: <https://github.com/neondatabase/website/blob/main/content/docs/storage/authentication.md>
- Building Neon Object Storage: <https://neon.com/blog/building-neon-object-storage>
- OpenDAL S3 service, Neon compatibility notes: <https://opendal.apache.org/docs/rust/opendal_service_s3/struct.S3.html>
- napi-rs cross build: <https://napi.rs/docs/cross-build>

**Prev:** *The Portable Lakehouse* (deploy targets) · a spin-off of the arc,
not a step before the finale.
