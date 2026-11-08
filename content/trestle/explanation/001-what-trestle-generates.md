---
title: What Trestle generates
summary: Trestle produces three things from one source of truth, annotated protobuf and a module catalog. They are service code, scaffolded projects, and local environments.
diataxis: explanation
project: trestle
status: draft
explains: trestle
---

Trestle is the generator the open-lakehouse services are built with. A service
author writes protobuf with standard Google API annotations and the business
logic behind it. Trestle derives everything in between, and it also stands up
the lakehouse the service runs against.

## Three generated surfaces

| Surface | Command | Engine | Output |
|---|---|---|---|
| Service code | `trestle generate` | `olai-codegen` (Rust token streams, no templates) | Handler traits and routes, typed clients, Python and Node bindings, resource labels, field-role registry. See [generated code layers](./generated-code-layers.md). |
| Projects | `trestle new` | MiniJinja templates embedded in the CLI | A Cargo workspace with `common`, `server`, and `client` crates, `proto/`, Docker and Databricks Apps deployment files, and optional frontend and CI. See [scaffolded projects](./scaffolded-projects.md). |
| Environments | `trestle env`, `trestle up` | `olai-stack-topology` planner and renderers, `olai-stack-runtime` | A Docker Compose stack behind an Envoy gateway, with storage, a catalog, tracking and other modules, and client env files. See [environments](./environments.md). |

## One source of truth per surface

- **Protobuf is the API contract.** Resource types, field roles, the HTTP
  surface and the resource hierarchy all come from `google.api.resource`,
  `google.api.field_behavior`, `google.api.resource_reference`,
  `google.api.http`, and `debug_redact`. There is no custom annotation dialect
  and no hand-maintained schema next to the proto.
- **The module catalog is the environment contract.** An environment is a
  selection of modules, and the planner fills the roles they need. Each module
  also names the architecture-model element it runs, which joins rendered
  environments to the lakehouse model.

## The generated/hand-written boundary

- Everything under `gen/` or `_gen/` is overwritten on every run and never
  edited.
- The author owns a small, stable surface the generated code refers to:
  - the request context (`FromRequestParts`)
  - the error and result types
  - the router
  - the logic behind each generated handler trait

## Build time, runtime, tooling

Trestle's crates fall into three stages (the [crate map](../reference/crate-map.md)
lists them all):

- **Build time.** `olai-codegen` runs at build time and never ships in a
  service binary.
- **Runtime.** These are libraries a generated service links: `olai-store`,
  `olai-http`, `olai-http-wasm`, `olai-auth`, and the credential-vending crates.
- **Tooling.** This stage plans, runs, and records environments
  (`olai-stack-*`). The `trestle` CLI ties it to the other two stages.

The libraries don't hardcode a data platform. Platform specifics such as Unity
Catalog or Databricks Apps live in templates, modules, and generated projects.

## Who uses which surface

- **Generated code:** mangrove and distributary commit `trestle generate`
  output.
- **Runtime crates:** mangrove, distributary, and headwaters (`olai-http`) link
  them.
- **Environment crates:** hydrofoil and luminescent-lakehouse embed them in
  their desktop shells.
- **Docs environments:** the docs environments in this repository are rendered
  by a pinned Trestle.

The codebase model's `landscape` and `trestleContainers` views show the edges.

## Sources

- trestle `README.md`, `docs/architecture.md`, `AGENTS.md`
- `architecture/codebase/repos/trestle.likec4`, `architecture/codebase/relations.likec4`
