---
title: Trestle's generated code layers
summary: One proto descriptor becomes models, server handler traits, typed clients and bindings. Each layer lands in its own crate, and the author keeps the router and the logic.
diataxis: explanation
project: open-lakehouse
status: draft
references:
  - trestle
---

`trestle generate` runs `buf generate`, then `buf build` to a descriptor set,
then `olai-codegen` over that descriptor. The generator builds Rust with token
streams and pretty-prints it. It uses no template engine.

## The pipeline

1. `.proto` files with Google API annotations.
2. `buf build` produces `descriptor.bin`, a compiled `FileDescriptorSet`.
3. The descriptor parser reads services, resources, and field behaviors. It
   rebuilds the resource hierarchy from `resource_reference` edges.
4. Layer generators emit code into the configured output directories.

## Layers and where they land

| Layer | Lands in (scaffolded layout) | What it contains |
|---|---|---|
| Models and labels | `common/src/models/_gen/` | Message types (prost or buffa), the `ObjectLabel` enum that implements `olai_store::Label`, the field-role registry (`RESOURCE_DESCRIPTORS`) |
| Extractors | `common/src/models/_gen/extractors/<service>/` | Request extractors for the server |
| Server | `server/src/codegen/<service>/` | A handler trait per service and one axum route function per RPC |
| Client | `client/src/codegen/<service>/` | Typed clients with request builders, optional resource-scoped clients, a ConnectRPC client |
| WASM | `client/src/wasm/` | A browser client and its `.d.ts` |
| Python | configured Python dir | PyO3 bindings and `.pyi` typings |
| Node | configured Node dirs | NAPI bindings, a TypeScript client, and models |

## What the author writes

- **Request context.** The author implements `FromRequestParts`, which the
  generated route functions extract.
- **Errors.** The error and result types, plus `parse_error_response` for
  clients.
- **The router.** The generator emits route functions but no router. Only the
  application knows its URL prefixes and which routes mix in hand-written
  handlers.
- **Logic.** An implementation of each generated handler trait.

## Routing and hierarchy

- Every resource gets a flat, top-level route (`/catalogs`, `/schemas`,
  `/tables`). Unity Catalog does the same; Google AIP nests collections
  instead.
- The parent is named by a request field, not a URL segment.
- The logical hierarchy is still encoded. It is rebuilt from
  `resource_reference` edges across services into a depth-ordered chain.

## Build-time switches

| Switch | Values | Effect |
|---|---|---|
| `Runtime` | `Prost` (default), `Buffa` | Which protobuf runtime the generated models use |
| `ClientProtocol` | `Rest` (default), `Connect` | REST clients or ConnectRPC clients |
| `transport_type_path` | a type path | The HTTP transport the client body compiles against: `olai-http`'s native `CloudClient` or `olai-http-wasm`'s browser client |
| output dirs | per layer, optional | Which layers are emitted, and where |

## Sources

- trestle `docs/architecture.md`
- `crates/olai-codegen/README.md`, `crates/olai-codegen/docs/codegen-design.md`
- `crates/olai-codegen/src/codegen/config.rs`, `crates/trestle/src/cli/generate.rs`
- the `trestleCodegen` view in `architecture/codebase/`
