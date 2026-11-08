# ADR-0010: Our source repos get their own C4 model, separate from the lakehouse model

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-11-08 |
| Supersedes | — |
| Superseded by | — |

## Context

The model in `model/` describes the lakehouse: abstract capabilities, the
specifications and implementations that realize them, and deployed services
(ADR-0003). Its audience is platform architecture. It holds three of our repos
(hydrofoil, mangrove, headwaters) as `implementation` elements, because each one
realizes a capability. The rest of our code has no place in it:

- **Repos that realize nothing directly.** Trestle is a generator, and
  luminescent-lakehouse is a deployment repo. Neither one is a lakehouse
  capability.
- **Crates, packages and binaries.** These are C4 containers. Adding them to
  `model/` would put source-level detail into `dist/model.json`, which docsnip,
  the review app and the public sites all read.
- **Cross-repo dependencies.** For example, distributary uses mangrove's
  `olai-uc-*` crates and trestle's credential crates, and luminescent pins three
  service repos by git. These are build facts about our code, not lakehouse
  relationships.

The only record of this structure was `estate.yml`. That file is coarse by
design (its header rules out a crate roster), and it had drifted: missing
repos, crates that don't exist, and a dependency edge that isn't in any
manifest.

## Considered Options

- **A separate LikeC4 project in `architecture/codebase/`.** Gets its own
  specification, views and export.
- **More element kinds in `model/`.** Add repo, crate and component kinds next
  to the logical and deployment layers.
- **A fragment in each repo, aggregated here.** Each repo owns its own part of
  the model, and this repo only collects them.

## Decision

We chose **a separate LikeC4 project** (`architecture/codebase/`, with its own
`likec4.config.json`). It keeps `dist/model.json`, and everything that reads
it, at the lakehouse altitude. It also lets the codebase vocabulary follow C4
levels directly instead of the capability, specification and implementation
typing (ADR-0004).

Per-repo fragments are the likely end state. They wait until the shape has
settled here.

### C4 levels

| C4 level | Element kind | Example |
|---|---|---|
| Context | `estate`, `repo`, `upstream` | `trestle`, `mangrove`, `datafusion` |
| Container | `crate`, `binary`, `npmPackage`, `pyPackage`, `app` | `olai-codegen`, `trestle` (bin), `@open-lakehouse/env-editor` |
| Component | `component` | `Module` catalog, `Authorizer` port |

- **Containers are build units.** A container is a workspace member: a crate, an
  npm package, a Python package, or an app. It is not a deployed process.
  Deployed processes stay in `model/deployment/`.
- **Components are optional.** Model them only where the seams are the point.
  The first pass covers Trestle only.

### Bridge rule

A codebase element that corresponds to a lakehouse element carries its id in
`metadata { lakehouseElement "<id>" }`. `scripts/check-codebase-bridge.mjs`
fails when that id is missing from `dist/model.json`. The lakehouse model never
points back into the codebase model.

### Facts rule

- **Edges come from manifests.** A `dependsOn` edge is a Cargo or npm dependency
  on the default branch. Its `via` metadata records how the dependency is
  pulled in: `crates.io`, `git` or `npm`.
- **No refs.** Like the rest of `architecture/`, the model names no versions,
  revs or SHAs.
- **Unbuilt work is tagged.** Designed-but-unbuilt work carries `#designed`.

## Consequences

### Positive

- One place answers "which repo builds on which, through which crate", and the
  lakehouse model stays readable.
- The Trestle concept pages (`content/trestle/`) can point at component views.

### Negative / Trade-offs

- There are two LikeC4 projects to keep valid. `just arch-check` runs both.
- The model is hand-maintained from manifests, so it drifts until a
  reconciliation pass. `estate.yml` stays the coarse index and defers structure
  to this model.
