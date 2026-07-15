# trestle — the generator

**Repo:** `open-lakehouse/trestle`. Not a logical capability — trestle is the
**generator** the other services are built with, and (via its `stack-topology`
crate) it **generates the deployment** itself: the Envoy gateway + Docker Compose
stack. See [`deployments.md`](./deployments.md) for the gateway it produces.

trestle is how the estate builds services fast enough to explore the space. It
turns **annotated protobuf into production-ready Rust APIs**, typed clients,
Python (PyO3) and Node (NAPI) bindings, and a graph-based resource store.
`trestle new` scaffolds a full data-platform service tree pre-wired for codegen,
local lakehouse emulation, and deployment.

## What it publishes

Framework crates under the `olai-*` prefix, plus the CLI. Load-bearing pieces:

| Crate / binary | Role |
|---|---|
| `olai-codegen` | Build-time proto → Axum handlers / clients / registry codegen |
| `olai-store` | TAO-inspired typed object/association graph store; field roles + encryption |
| `olai-http` | Unified cloud-credential + HTTP client (`CloudClient`) |
| `olai-http-wasm` | Browser/WASM HTTP transport for generated clients |
| `olai-stack-topology` | Role/placement-aware service-to-service addressing |
| `olai-trestle` (CLI) | The `trestle` binary: codegen + `trestle new` scaffolding |

> The `olai-*` prefix is a defensive publish-time shell, not the code's identity —
> call sites use aspirational eventual-official names via Cargo `package =`
> aliases. That naming convention is a writing/glossary concern; here it only
> matters that the framework crates are what the planes are built with.

## Why it's the root

mangrove and headwaters depend on trestle (`olai-http` / `olai-store` + codegen).
breakwater has no crate dependency on a sibling. hydrofoil depends on `olai-http`
transitively. So trestle is the one repo every service traces back to.

## Patterns it establishes

trestle is where the estate's **composition** pattern is established: narrow port
traits + a `Provides*` compile-time DI pattern + `Arc<dyn Trait>` boundaries, so a
piece can be swapped or reused. See [`patterns.md`](./patterns.md).

## Orientation

- `crates/olai-store/src/`
- `crates/olai-codegen/docs/codegen-design.md`
- `crates/stack-topology/`
- `docs/architecture.md`
