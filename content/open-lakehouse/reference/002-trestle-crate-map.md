---
title: Trestle crate and package map
summary: Every Trestle crate and UI package, with its stage (build time, runtime, or tooling), what it does, and the seam it exposes.
diataxis: reference
project: open-lakehouse
status: draft
references:
  - trestle
---

All crates are published to crates.io under the `olai-` prefix unless marked
unpublished. The UI packages ship as GitHub release tarballs.

## Rust crates

| Crate | Stage | Role | Main seam |
|---|---|---|---|
| [`olai-codegen`](https://crates.io/crates/olai-codegen) | build time | Proto descriptor to handler traits, clients, bindings, labels, field-role registry | `TypeRenderer`, `BindingBackend`, codegen config |
| [`olai-store`](https://crates.io/crates/olai-store) | runtime | Object and association store, generic over a resource label | `ObjectStore<L>`, `AssociationStore<L>`, `KeyProvider` |
| [`olai-http`](https://crates.io/crates/olai-http) | runtime | Cloud credentials and HTTP client; the native transport for generated clients | `CredentialProvider`, `RequestSigner` |
| [`olai-http-wasm`](https://crates.io/crates/olai-http-wasm) | runtime | Browser transport for generated clients | the transport type path |
| [`olai-auth`](https://crates.io/crates/olai-auth) | runtime | JWT and API key authentication, `Principal` extractor, authorization | `Authorizer`, `KeySource`, `ApiKeyStore` |
| [`olai-storage-credentials`](https://crates.io/crates/olai-storage-credentials) | runtime | Canonical model for vended storage credentials | — |
| [`olai-credential-vending`](https://crates.io/crates/olai-credential-vending) | runtime | Mints downscoped AWS, Azure, and GCS credentials | `CredentialMinter` |
| [`olai-vended-store`](https://crates.io/crates/olai-vended-store) | runtime | `object_store` stores over vended, auto-refreshing credentials | `CredentialSource` |
| [`olai-stack-topology`](https://crates.io/crates/olai-stack-topology) | tooling | Module catalog, roles, planner, Compose and Envoy renderers, manifests | `Module`, `DeployTarget` |
| [`olai-stack-runtime`](https://crates.io/crates/olai-stack-runtime) | tooling | Runs environments on Docker Compose; sources, secrets, Neon | `ComposeEngine`, `Source`, `SecretProvider`, `NeonControl` |
| [`olai-stack-state`](https://crates.io/crates/olai-stack-state) | tooling | SQLite state: workspaces, revisions, instances, slot leases | — |
| [`olai-trestle`](https://crates.io/crates/olai-trestle) | tooling | The `trestle` CLI | — |
| `stack-topology-wasm` | tooling, unpublished | wasm bindings for the planner | — |
| `olai-test-emulators` | test, unpublished | Testcontainers storage emulators | — |

## Dependencies between crates

- **CLI.** `olai-trestle` uses `olai-codegen`, `olai-stack-topology`,
  `olai-stack-runtime`, and `olai-stack-state`.
- **Environment crates.** `olai-stack-runtime` uses `olai-stack-state` and
  `olai-stack-topology`, and `olai-stack-state` uses `olai-stack-topology`.
- **Credential crates.** `olai-credential-vending` and `olai-vended-store` both
  use `olai-http` and `olai-storage-credentials`.
- **Independent crates.** `olai-codegen`, `olai-store`, `olai-http`,
  `olai-auth`, and `olai-stack-topology` depend on no other Trestle crate.

## UI packages

| Package | Role |
|---|---|
| `@open-lakehouse/env-editor` | Headless React environment editor and workspace shell |
| `@open-lakehouse/env-editor-app` | The standalone web app around it (private) |
| `@open-lakehouse/stack-wasm` | TypeScript surface of the wasm planner |
| `@open-lakehouse/host` | Host contract for Open Lakehouse service UIs |
| `@open-lakehouse/ui-kit` | Headless React primitives and design tokens |
| `@open-lakehouse/trestle-diagram` | Read-only embeddable environment diagram |

## Sources

- trestle `Cargo.toml` workspace members and each crate's `Cargo.toml`
- `node/*/package.json`
- `architecture/codebase/repos/trestle.likec4`
