# docs-factory-app

A proto-driven Rust + Axum service deployable to **Databricks Apps**, scaffolded
with [trestle](https://github.com/open-lakehouse/trestle).

- Server: `crates/server` (Axum, generated routes)
- Shared models: `crates/common`
- HTTP client: `crates/client`


## Quickstart

```bash
# 1. Set up the env file
cp .env.example .env.local

# 2. Bring up the local platform stack (Postgres, MLflow, Envoy, ...)
just up

# 3. Generate code from .proto and run the app + frontend
just regen
just dev
```

## How the layout maps to Databricks

| Local | Databricks |
|-------|-----------|
| `cargo run -p docs-factory-app-server` | `databricks bundle run docs_factory_app` || `X-Forwarded-Access-Token` (synthesized by Envoy) | `X-Forwarded-Access-Token` (OBO from Databricks Apps) |
| `DATABRICKS_HOST=http://localhost:${ENVOY_PORT}` | `DATABRICKS_HOST=https://<workspace>` |

The exact same code reads `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and the OBO
header. No env-conditional branches.

## Layout

```
docs-factory-app/
├── Cargo.toml                  # workspace
├── trestle.yaml                # codegen config
├── buf.yaml + buf.gen.yaml     # proto build
├── proto/docs_factory/tracker/v1/  # source of truth
├── crates/
│   ├── common/                 # generated model types
│   ├── server/                 # Axum service (this is what Databricks runs)
│   └── client/                 # HTTP client + shared types
├── app.yaml                    # Databricks Apps manifest
├── databricks.yml              # Databricks Asset Bundle
├── compose.yaml                # local-stack composition
└── docker/                     # compose fragments, envoy config, ...
```

## Commands

```bash
just regen          # rebuild proto descriptor + regenerate Rust + TS
just dev            # cargo run + vite dev (and the local stack)
just up [profile]   # local stack only
just down           # stop local stack
just bundle-validate
just deploy         # databricks bundle deploy + run
just lint           # cargo clippy + buf lint + frontend lint
just test           # cargo test
```

## Release-tracker domain

This app tracks DevRel software/blog releases as a **graph** (trestle's OLI
store: resources are nodes, relationships are association edges).

**Resources** (`proto/docs_factory/tracker/v1/models.proto`): `Project`,
`Repository`, `Website`, `Release`, `Artifact`, `Task`. Each is a flat
top-level REST collection (`/v1/{plural}`).

- **Release** timing supports vague early targets that sharpen over time: a date
  window (`targetEarliest`..`targetLatest`) plus a graded `confidence`
  (`SPECULATIVE` → `ESTIMATED` → `SCHEDULED` → `CONFIRMED`). `status`/`actualDate`
  are server-owned.
- **Artifact** carries a flat queryable `type` enum *and* a typed `oneof kind`
  (blog post / presentation / sheet / RFC) for per-kind metadata.
- **Task** is nestable via `child_of` edges (arbitrary-depth subtasks) and
  carries a typed external ref (`oneof ref`: GitHub issue / Jira ticket).

**Relationships** are association edges managed via `AssociationService`
(`POST /v1/associations`, `POST /v1/associations:remove`,
`GET /v1/associations?from=…&label=…`). The label vocabulary
(`depends_on`/`dependency_of`, `has_part`/`part_of`, `child_of`/`parent_of`,
`references`/`referenced_by`, …) is in `crates/common/src/models/association.rs`;
inverse edges are maintained automatically. The canonical example —
`Release(Unity Catalog) --depends_on--> Release(Spark)` — is exactly the
"time UC with Spark" case this app exists to track.

### Storage

The first slice uses an **in-memory** store (`crates/server/src/store.rs`)
implementing the `olai-store` traits — non-durable, process-local. The planned
follow-up is to adapt mangrove's `crates/postgres` `Store` (swap in this app's
`ObjectLabel`/`AssociationLabel` ENUMs, drop the envelope encryptor) behind the
same traits, leaving handlers untouched. The `sqlx` feature on `crates/common`
is already wired for that.

### Codegen note

`just regen` calls `trestle generate`, which expects the `trestle` CLI on PATH
(`cargo install olai-trestle`, or build it from a sibling trestle checkout). The
`olai-store` dependency is a path dep to that checkout
(`crates/olai-store`) so the generated `labels.rs` and the store types stay in
lockstep; switch it to a published version once one matching the codegen is on
the registry. `buf build` must emit a **file descriptor set**
(`buf build --as-file-descriptor-set -o api.bin`) for `trestle generate` to read.

## License

Apache-2.0 — see [LICENSE](LICENSE).