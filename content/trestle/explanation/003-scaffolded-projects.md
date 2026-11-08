---
title: Trestle's scaffolded projects
summary: "`trestle new` composes a base, an app template, and optional components into a project that already has the codegen boundary in place."
diataxis: explanation
project: trestle
status: draft
references:
  - trestle
---

`trestle new <name>` renders MiniJinja templates that are embedded in the CLI.
A project is composed from a base, an app, and components. Then `post_init`
hooks such as `git init` run.

## Composition

| Piece | Example | Contributes |
|---|---|---|
| Base | `lakehouse` (default) | README, `.gitignore`, `justfile`; no environment (that is `trestle env new`) |
| App | `databricks-app-rust` (`--app`) | The Rust service: Cargo workspace, `proto/`, Docker and Databricks Apps files |
| Components | `frontend-react`, `ci-github`, `connect-rust` | A Vite/React frontend, GitHub CI and deploy workflows, a ConnectRPC handler adapter |

- Selection runs in a fixed order:
  1. Each root's `always:` list (the baseline).
  2. Explicit `--select` and `--app` picks.
  3. The app's `lakehouse_requires:` list.
  4. Each component's `when:` filter. The `when:` filters test flags derived
     from prompt categories (`with_frontend`, `with_ci`, `with_connect`).
- `--profile` selects a named set from a root's `profiles:` block. This is a
  legacy path.
- Validation rejects components that conflict (`conflicts_with`) and port
  collisions.
- There is a shared component library for components outside an app
  (`_components/`). It is empty; every component today belongs to an app.

## The scaffolded service

| Path | Role |
|---|---|
| `proto/<service>/v1/{models,service}.proto` | The contract, with `google.api.http` annotations |
| `crates/common` | Generated models and extractors |
| `crates/server` | `main.rs` with the hand-written router, `handlers/`, `api/{context,error}.rs` |
| `crates/client` | Generated clients |
| `docker/`, `app.yaml`, `databricks.yml` | Container image and Databricks Apps deployment |

`examples/golden-path-app` in the trestle repo is a scaffolded project kept as a
reference.

## Sources

- `crates/trestle/README.md`, `crates/trestle/templates/`
- `crates/trestle/src/template/{render,resolve,validate,hooks,catalog}.rs`
