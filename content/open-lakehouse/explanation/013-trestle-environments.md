---
title: Trestle environments
summary: An environment is a selection of catalog modules. The planner fills each module's roles and resource demands, then renders the plan for a deploy target, today Docker Compose behind Envoy.
diataxis: explanation
project: open-lakehouse
status: draft
references:
  - trestle
  - lakehouse.objectStorage
  - lakehouse.catalog
---

`trestle env new` writes an `env.toml`, a selection of modules plus overrides.
The planner resolves that selection against the module catalog. The renderer
writes a runnable stack, and `trestle up` runs it.

## Building blocks

| Concept | What it is |
|---|---|
| Module | A deployable unit. It declares services and their endpoints, the roles it provides, knobs, and the modules it requires or conflicts with. It also declares resource demands (a database, a bucket) and a render spec per deploy target. |
| Role | An open set of capability names a module can provide: `object_store`, `relational_db`, `data_catalog`, `gateway`, `sql_engine`, `experiment_tracking`, `tracing`, `lineage`, `app_runtime`, `auth`, `policy`, `agent_platform`, `notebooks`, `graph`, `orchestration`. Any other string is a valid role too. |
| Catalog | The registry of modules, with an index from role to providers and a default provider per role (`object_store` → `rustfs`, `relational_db` → `postgres`). |
| Resource demand | A module asks for a kind of resource rather than a specific provider. The planner provisions it from whichever module provides that kind. |
| Hosted module | A managed service in place of an in-stack one: hosted Postgres (Neon, RDS, Azure), S3, Azure Storage, Neon. Hosted kinds are `Postgres`, `S3`, `AzureBlob`, and `Function`. |
| Knob | A typed per-module setting (`String`, `Bool`, `Enum`, `Integer`), overridden in `env.toml` or with `--set`. Image pins are centralized. |
| Deploy target | Where a plan is materialized. Docker Compose is the only target. A module without a render spec for a target fails to plan there. |

## The baseline catalog

The catalog has 18 modules:

- **Gateway and identity:** `envoy`, `authelia`
- **Storage:** `postgres`, `rustfs`, `azurite`
- **Hosted:** `hosted-postgres`, `aws-s3`, `azure-storage`, `neon-storage`
- **Services:** `mlflow`, `unity-catalog`, `jaeger`, `headwaters`,
  `omnigent`, `marimo`, `puppygraph`, `rivers`, `opa`

Each module can name the architecture-model element it runs. That name is how
this repository joins generated environments to the lakehouse model (see
`docs/design/trestle-integration.md`).

## What a rendered environment contains

- `compose.yaml`: the top level, with an `include:` per module plus shared
  configs and secrets.
- `modules/<id>/`: each module's Compose file and the files it needs (for
  example `envoy.yaml`, database init scripts).
- `client/host.env`, `client/container.env`: the endpoints and credentials a
  client exports, from the host or from a container.
- `LAYOUT.md`: the gateway routes and services.
- `env.toml`: the persisted selection.

The trestle repo keeps eight golden scenarios as regression fixtures:
`minimal`, `lakehouse`, `authenticated`, `authorized`, `agents`, `hybrid`,
`full-azure`, `neon-hybrid`.

## Running and recording environments

- **Runtime.** `olai-stack-runtime` drives `docker compose`. It overlays sources
  onto an instance: user variables, or a Neon branch's connection details. It
  resolves secret references from the environment or the OS keychain.
- **State.** `olai-stack-state` keeps workspaces, environments with immutable
  revisions, and instances bound to revisions. It lives in SQLite under
  `TRESTLE_HOME`, shared by the CLI and the desktop shells.
- **Slots.** A workspace hands out slots so several instances can run on one
  host. Slot `n` shifts every host port by `n × 1000`, up to slot 54.
- **Pure planner.** The planner is pure and compiles to wasm, so the browser
  environment editor plans and renders without a server.

## Sources

- `crates/stack-topology/README.md`, `crates/stack-topology/src/catalog/{module,baseline}.rs`
- `crates/stack-topology/src/model/role.rs`, `crates/stack-topology/src/plan/hosted.rs`
- `crates/stack-topology/src/target.rs`, `crates/stack-topology/src/workspace.rs`
- trestle `docs/runtime.md`, `docs/multi-env.md`, `test/expected/`
- the `trestleEnvironments` view in `architecture/codebase/`
