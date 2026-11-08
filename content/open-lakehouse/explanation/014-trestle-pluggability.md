---
title: How Trestle stays pluggable
summary: Trestle keeps every varying part behind a small set of repeated patterns, mainly object-safe ports with adapters and fakes, and a module registry indexed by role.
diataxis: explanation
project: open-lakehouse
status: draft
references:
  - trestle
---

Trestle has one rule: the crates are a generic framework, and anything specific
to a platform, cloud, or language plugs in from outside. The same handful of
patterns carries that rule through every crate. Each section below names the
seam, what varies behind it, what plugs in today, and how to add another.

## 1. Ports and adapters behind object-safe traits

A narrow trait is held as `Arc<dyn Trait>`. Adapters implement it, and most
ports ship a fake so tests run without the real system.

| Port | Crate | What varies | Adapters |
|---|---|---|---|
| `Authorizer` (fail-closed) | `olai-auth` | The policy decision | `CedarAuthorizer` (embedded), `HttpAuthorizer` (remote PDP), `CachedAuthorizer` (wraps another) |
| `KeySource`, `ApiKeyStore` | `olai-auth` | Verification keys, API key storage | `PushKeySource`, `HttpKeySource`; a Postgres `ApiKeyStore` |
| `CredentialProvider`, `RequestSigner` | `olai-http` | Cloud auth for outgoing HTTP | AWS, Azure, GCP, Databricks, bearer-token providers |
| `CredentialMinter` | `olai-credential-vending` | How a downscoped storage credential is minted | `AwsStsMinter`, two Azure SAS minters, `GcsDownscopedMinter`, `CachingMinter` (wraps another) |
| `CredentialSource` | `olai-vended-store` | Where a vended object store gets its credentials | Unity Catalog, UC Delta API, Delta Sharing, Iceberg REST, Neon |
| `KeyProvider` | `olai-store` | The key for envelope-encrypted fields | `LocalKeyProvider` |
| `ComposeEngine` | `olai-stack-runtime` | What runs an environment | `DockerCli`, `FakeEngine`, the CLI's engine |
| `Source` | `olai-stack-runtime` | Variables and endpoints overlaid on an instance | `UserVars`, `NeonBranchSource` |
| `SecretProvider` | `olai-stack-runtime` | Where secret values live | `EnvProvider`, `KeychainProvider`, the CLI's secret store |
| `NeonControl` | `olai-stack-runtime` | The Neon control plane | `NeonCli`, `FakeNeon` |

**To add one:** implement the trait, then hand the adapter to whatever holds
the `Arc<dyn …>`. Wrapping adapters (`CachedAuthorizer`, `CachingMinter`) add
behavior without touching the port.

## 2. Generic over a generated taxonomy

- **Seam:** `ObjectStore<L>` and `AssociationStore<L>` are generic over
  `L: Label`.
- **Varies:** the resource taxonomy (any proto-defined set of resources) and
  the storage backend (`mem`, SQLite, Postgres).
- **Plugs in:** the generated `ObjectLabel` enum. `ManagedObjectStore` enforces
  the generated field roles on top of any backend.
- **To add a taxonomy:** annotate resources in proto and regenerate. The store
  doesn't change.

## 3. A registry indexed by role

- **Seam:** the `Module` trait and the catalog's role index (`providers_of`,
  default provider per role).
- **Varies:** which software fills a role in an environment, such as RustFS or
  S3 for `object_store`.
- **Plugs in:** 18 baseline modules. Most are declarative `DataModule`s; hosted
  modules swap a managed service in for an in-stack one.
- **To add one:**
  1. Declare a module (data plus templates under `templates/modules/<id>/`).
  2. List the roles it provides.
  3. Register it in the baseline catalog.

  Roles are an open set, so a new capability needs no enum change.

## 4. A target abstraction

- **Seam:** `DeployTarget`, plus a render spec per module per target id.
- **Varies:** where a plan is materialized.
- **Plugs in:** Docker Compose. The planner is target-neutral.
- **To add a target:** implement `DeployTarget`, and give each module a render
  spec for the new target id. A module without one fails to plan there instead
  of rendering something partial.

## 5. Build-time switches in codegen

- **Seam:** codegen config, plus the `TypeRenderer` and `BindingBackend`
  traits.
- **Varies:**
  - the protobuf runtime (`Runtime`: prost or buffa)
  - the client protocol (`ClientProtocol`: REST or Connect)
  - the client transport (`transport_type_path`)
  - output languages
- **Plugs in:**
  - `RustRenderer`, `NapiRenderer`, and `TypeScriptRenderer` for types
  - `PyBackend` and `NapiBackend` for bindings
  - the `olai-http` and `olai-http-wasm` transports. One generated client body
    compiles against either.
- **To add a language:** implement `TypeRenderer` and `BindingBackend`, and add
  an output directory to the config.

## 6. Declarative template composition

- **Seam:** template manifests with `always:`, `when:`, `lakehouse_requires:`,
  and `conflicts_with`.
- **Varies:** which components a scaffolded project includes.
- **To add one:** add a component directory with its `template.yaml` under an
  app or the shared component library.

## 7. Host contributions in the UI

- **Seam:** the `@open-lakehouse/host` contract and the environment editor's
  contribution points: environment status, host actions, tabs, side views,
  activity actions, panels.
- **Varies:** the shell the editor runs in (web, or a desktop app such as
  luminescent-lakehouse's).
- **To add one:** the host registers contributions, and the editor renders them.

## How this relates to the estate's composition pattern

The estate's composition pattern (`architecture/design/patterns.md`) is about
assembling independently built pieces. Trestle provides the ports-and-adapters
half of it. The `Provides*` compile-time DI traits that wire a server's ports
together come from mangrove (`ProvidesResourceStore`, `ProvidesPolicy`, …), not
from Trestle.

## Sources

- `crates/olai-auth/src/authz/`, `crates/olai-http/src/credential.rs`
- `crates/olai-credential-vending/src/mint.rs`, `crates/olai-vended-store/src/source.rs`
- `crates/olai-store/src/{store,label,encryption}.rs`
- `crates/stack-runtime/src/{engine,source,secrets}.rs`, `crates/stack-runtime/src/neon/`
- `crates/stack-topology/src/catalog/`, `crates/stack-topology/src/target.rs`
- `crates/olai-codegen/src/parsing/types.rs`, `crates/olai-codegen/src/codegen/{config.rs,bindings/}`
- `node/host/`, `node/env-editor/src/workspace/contributions.tsx`
- the `trestleRuntimeSeams` view in `architecture/codebase/`
