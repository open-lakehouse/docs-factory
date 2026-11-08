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

Framework crates under the `olai-*` prefix, plus the CLI, in three stages. The
full container and component breakdown is the codebase model
(`architecture/codebase/`, views `trestleContainers`, `trestleCodegen`,
`trestleEnvironments`, `trestleRuntimeSeams`); the concepts are the
`trestle-*` pages in `content/open-lakehouse/`.

| Stage | Crate / binary | Role |
|---|---|---|
| build time | `olai-codegen` | Proto descriptor → axum handler traits, REST/Connect clients, PyO3/NAPI bindings, resource labels, field-role registry |
| runtime | `olai-store` | TAO-inspired object/association store, generic over the generated label; field roles + envelope encryption |
| runtime | `olai-http` / `olai-http-wasm` | Cloud-credential HTTP client; the native and browser transports for generated clients |
| runtime | `olai-auth` | JWT + API keys, `Principal` extractor, `Authorizer` port (embedded Cedar or remote PDP) |
| runtime | `olai-credential-vending` / `olai-vended-store` / `olai-storage-credentials` | Mint downscoped storage credentials; object stores over vended credentials |
| tooling | `olai-stack-topology` | Module catalog, roles, planner, Compose/Envoy renderers (pure, wasm-clean) |
| tooling | `olai-stack-runtime` / `olai-stack-state` | Run environments on Docker Compose; shared SQLite state (workspaces, revisions, instances) |
| tooling | `olai-trestle` (CLI) | The `trestle` binary: `new`, `generate`, `env`, `ws`, `up` |

UI packages (`@open-lakehouse/env-editor`, `host`, `ui-kit`, `stack-wasm`,
`trestle-diagram`) ship as GitHub release tarballs.

> The `olai-*` prefix is a defensive publish-time shell, not the code's identity —
> call sites use aspirational eventual-official names via Cargo `package =`
> aliases. That naming convention is a writing/glossary concern; here it only
> matters that the framework crates are what the planes are built with.

## Why it's the root

From the manifests (detail in the codebase model's `landscape` view):

- mangrove and distributary commit `trestle generate` output (models, handler
  traits, clients) and link trestle's runtime crates.
- headwaters uses only `olai-http` (optional); its proto is buf-generated.
- hydrofoil and luminescent-lakehouse use the environment crates
  (`olai-stack-*`) in their desktop shells.
- breakwater and tributary have no trestle dependency.

## Patterns it establishes

trestle applies the estate's **composition** pattern throughout: narrow,
object-safe port traits behind `Arc<dyn Trait>`, each with adapters and a fake
for tests (`Authorizer`, `CredentialMinter`, `ComposeEngine`, `SecretProvider`,
the environment `Module`, …), a store generic over a generated taxonomy, and
build-time switches for runtime and protocol. The `Provides*` compile-time DI
pattern is mangrove's, not trestle's. See [`patterns.md`](./patterns.md) and
`content/open-lakehouse/explanation/014-trestle-pluggability.md`.

## Orientation

- `docs/architecture.md`
- `crates/olai-codegen/docs/codegen-design.md`
- `crates/stack-topology/src/catalog/`
- `crates/trestle/templates/`
