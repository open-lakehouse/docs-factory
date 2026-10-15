# Converging the estate model with Trestle environments

**Status:** design. Proposed; nothing is built.
**Scope:** how the LikeC4 estate model (`architecture/model`) and Trestle's
environment generator (`trestle/crates/stack-topology`) come to share one
vocabulary. Covers three outcomes:

- Trestle generates the docs environments under `envs/`, and each one appears
  in the model's deployment layer.
- Tracked journeys join assets, contracts, and environments.
- The joined graph reaches readers, search engines, and agents.

This design builds on [ADR-0001](../decisions/ADR-0001-model-driven-information-system.md),
[`model-leverage.md`](./model-leverage.md) (and its SEO and GEO verdicts), and
the architecture ADRs
[0003](../../architecture/adr/ADR-0003-logical-abstract-deployment-concrete.md)
through [0006](../../architecture/adr/ADR-0006-system-boundary-and-generic-relations.md).
It spans two repos. Each phase below is written so a session can execute it
from this document alone.

## 1. The problem

Two artifacts describe the same lakehouse, but neither knows the other's ids.

- **The model** types the estate along three logical axes:
  - asset kinds ([ADR-0005](../../architecture/adr/ADR-0005-governed-asset-kinds.md));
  - capability, specification, and implementation altitudes
    ([ADR-0004](../../architecture/adr/ADR-0004-capability-specification-implementation.md));
  - a deployment layer that holds one hand-written environment,
    `trustedCompute`.

  One `capability` kind covers both the *layers* that materialize assets
  (catalog, query engine, table format, object storage) and the *properties*
  that span them (governance, lineage, observability). The two behave
  differently. Lineage has no place in the chain
  `queryEngine → tableFormat → objectStorage`; it applies to tables and models
  wherever they live.
- **Trestle's `stack-topology`** plans an environment from an `env.toml`
  selection, then renders Docker Compose, Envoy, client env files, and a graph
  (`GraphDto`).
  - Its *roles* closely match our capabilities: `data_catalog`,
    `object_store`, `sql_engine`, `experiment_tracking`, `lineage`, `tracing`,
    `auth`, `policy`, and others.
  - Its *modules* closely match our implementations: `unity-catalog`,
    `rustfs`, `postgres`, `envoy`, `mlflow`, `jaeger`, `opa`, and others.
  - It has no notion of what a node *is* in estate terms. Its graph can't link
    to a concept, a spec, or a docs page.
- **The docs environments** (`envs/unitycatalog`, `envs/aws-sim`) are written
  by hand. `envs/environments.yml` repeats facts (ports, client env) that a
  Trestle plan would compute, and the model knows nothing about any of them.
- **Journeys** in `content/<project>/compatibility.yml` are CI-verified. Their
  link to the model is thin:
  - Each interface names an implementation (`model:`).
  - One project-level `spec:` stands in for every requirement.
  - The asset a journey acts on exists only in its family name.

The model has also drifted from its own documentation. P1 cleans this up:

- No element has kind `role`, but `canonicals.yaml` lists
  `lakehouse.governance.{pap,pdp,pep,pip,pa}`.
- Comments in `logical/capabilities.likec4` point at a `governance.likec4`
  that doesn't exist, and `explain-views.likec4` mentions a missing
  `governanceModel` view.
- ADR-0005 and the `specification.likec4` comments describe a `requires`
  relationship kind. It was never declared; `assets.likec4` uses `dependsOn`.
- `unityCatalogOSS` has no `implements icebergRestSpec` edge, although UC 0.7
  serves Iceberg REST and H21 proves it in CI. The journey checks in P6 exist
  to catch this kind of gap.

## 2. Decisions

1. **The model owns concept identity.** Trestle roles and modules carry an
   optional `model` reference (a LikeC4 element id). docs-factory CI checks
   that every reference resolves. Only the ids cross the repo boundary;
   Trestle ships no C4 data.
2. **Trestle generates the docs environments.** Each environment is an
   `env.toml`. The rendered compose, Envoy, client-env, and `plan.json` files
   are committed under `envs/<name>/` and checked for staleness, the same way
   `compatibility.json` is. Committing them is required because the bare
   Vercel build and the reader env bundle (`emit/docs/env-bundle.mjs`, built
   from `git ls-files`) have no cargo.
3. **Cross-cutting properties get their own element kind, `concern`.** Only
   the kind changes, never the id.
4. **Journeys stay in `compatibility.yml` and are not LikeC4 elements.** They
   gain explicit `asset` and `requires` references into the model. This keeps
   the decision from #193 to track journeys only, with no sub-steps, and keeps
   per-operation detail out of the model.

## 3. The conceptual model

| Axis | Kind | Members | Realized by |
|---|---|---|---|
| Subject: what the platform manages | `asset` (type-level) | namespace, table, view, metricView, volume, registeredFunction, mlModel, agentSkill, credential, externalLocation, share, connection | — |
| Function: layers that materialize assets | `capability`, with `openSpecification` contracts | catalog, queryEngine, orchestration, tableFormat, fileFormat, objectStorage, credentialIssuer, modelTracking, sharing | `implementation` (`implements` a spec, or `realizes` the capability) |
| Property: spans assets and capabilities | **`concern`** (new) | governance, lineage, observability | `implementation` (`realizes`) |
| Instance | deployment `environment` / `service` / `datastore` | one generated environment per docs env, plus the narrative `trustedCompute` | `instanceOf` an implementation |

**Journeys sit across the triad.** A journey is an interface (an
implementation, such as Spark) acting on an asset (a table) inside an
environment whose implementations provide the contracts the journey requires
(Iceberg REST). A gating CI claim turns that into a *verified* fact.

**Trestle's terms map onto this:**

| Trestle | Model |
|---|---|
| role | capability or concern |
| module | implementation |
| plan | deployment environment |
| provisioned resources (databases, buckets) | `datastore` nodes |

Trestle's own word "capability" (`Selection.capabilities`,
`DataModule.provider_of`) means a role string. Document the difference rather
than renaming either side.

### What moves to `concern`

| Element | Kind after | Why |
|---|---|---|
| `lakehouse.governance` | concern | It applies to every asset kind. Authentication and authorization fold in here until the model has an identity spec to anchor a separate concern. |
| `lakehouse.lineage` | concern | It tracks assets across engines. It is not a layer in the read path. |
| `lakehouse.observability` | concern | It observes running capabilities. |
| `lakehouse.sharing` | stays capability | It has a contract (`openSharingSpec`), it is a protocol surface, and the share asset depends on it. |
| `lakehouse.credentialIssuer` | stays capability | It is a step in the vending chain. |

A LikeC4 FQN comes from nesting, not from kind. Changing
`lineage = capability "Lineage"` to `lineage = concern "Lineage"` inside
`lakehouse` keeps `lakehouse.lineage` intact. So do every `model:` link,
`explains:` binding, `references:` entry, `blogs/tags.yml` element,
`canonicals.yaml` entry, and headwaters' `instanceOf`. Only code that filters
*by kind* has to change (P1).

**The spanning edge** is a single kind, `appliesTo` (concern → asset or
capability, dotted), with the verb in the title: "tracks lineage of",
"secures", "observes". One kind keeps the validators simple, and titles are
what people read anyway.

## 4. Mappings

### Trestle role → model element

| role | element | note |
|---|---|---|
| `object_store` | `lakehouse.objectStorage` | |
| `data_catalog` | `lakehouse.catalog` | |
| `sql_engine` | `lakehouse.queryEngine` | |
| `graph` | `lakehouse.queryEngine` | PuppyGraph queries Delta tables |
| `experiment_tracking` | `lakehouse.modelTracking` | |
| `lineage` | `lakehouse.lineage` | concern |
| `tracing` | `lakehouse.observability` | concern |
| `auth` | `lakehouse.governance` | concern |
| `policy` | `lakehouse.governance` | concern |
| `gateway`, `relational_db`, `app_runtime`, `notebooks`, `agent_platform` | none | Infrastructure or tooling; explicitly unmapped |

### Trestle module → implementation element

Only `unityCatalogOSS`, `mlflow`, and `omnigent` exist today. P1 adds the
rest to `logical/technology-catalog.likec4`.

| module | element | edges to add |
|---|---|---|
| `unity-catalog` | `unityCatalogOSS` | add `implements icebergRestSpec` (currently missing) |
| `mlflow` | `mlflow` | |
| `omnigent` | `omnigent` | |
| `envoy` | `envoy` (`#infra`) | |
| `authelia` | `authelia` | `realizes governance` |
| `opa` | `openPolicyAgent` | `realizes governance` |
| `postgres`, `hosted-postgres` | `postgresql` (`#infra`) | |
| `rustfs` | `rustfs` (`#infra`) | `implements s3Api` |
| `aws-s3` | `amazonS3` (`#infra`) | `implements s3Api` |
| `azurite` | `azurite` (`#infra`) | `implements azureBlobApi` |
| `hosted-azure-storage` | `azureBlobStorage` (`#infra`) | `implements azureBlobApi` |
| `jaeger` | `jaeger` | `realizes observability`, `consumes otlpSpec` |
| `marimo` | `marimo` | |
| `puppygraph` | `puppygraph` | `realizes queryEngine` |
| `headwaters` | `lakehouse.lineage` | No implementation element: ADR-0003 keeps our repo names out of the logical layer, so the module refers to the concern. |

New specs: `azureBlobApi`, and optionally `openLineageSpec` (specifies
lineage) and `otlpSpec` (specifies observability).

### New asset kinds

These are type-level. Instances stay out of scope, per ADR-0005.

| id | `dependsOn` | governed by | evidence |
|---|---|---|---|
| `view` | table, queryEngine | `ucSpec` | |
| `metricView` | view, queryEngine | `ucSpec` | seven `metricview.*` journeys; T08 and H07 |
| `credential` | credentialIssuer | `ucSpec` | `credential(s).*` journeys |
| `externalLocation` | objectStorage, credential | `ucSpec` | `location.*` journeys |
| `share` | sharing | `ucSpec`, `openSharingSpec` | |
| `connection` | catalog | `ucSpec` (`#designed`) | Covers federation and MCP connections. Add a separate `mcpServer` kind only when UC ships a securable for it. |

`agent` is not an asset kind. Agents are already `person`s, and Omnigent is
an implementation.

## 5. Phases

Each phase can merge on its own. The handoffs are in §7.

### P1 — Model refactor (docs-factory)

**Model:**
- `architecture/model/specification.likec4`:
  - add `element concern` (a hexagon shape, amber color);
  - add `relationship appliesTo { line dotted }`;
  - correct the `requires` comment, since assets use `dependsOn`.
- `architecture/model/logical/capabilities.likec4`:
  - switch governance, lineage, and observability to `concern`;
  - fix the comments that point at `governance.likec4`.
- New file `architecture/model/logical/concerns.likec4`:
  - lineage `appliesTo` table, volume, mlModel, view;
  - governance `appliesTo` every asset kind;
  - observability `appliesTo` queryEngine, catalog, orchestration;
  - move `orchestration -[flows]-> observability` here.
- `architecture/model/logical/assets.likec4`: add the new kinds from §4.
- `architecture/model/logical/technology-catalog.likec4`: add the
  implementations and specs from §4, plus
  `unityCatalogOSS -[implements]-> icebergRestSpec`.
- `architecture/model/views/logical-views.likec4`:
  - add a `concernMatrix` view of the triad;
  - in `referenceContext` and `capabilityMap`, exclude `element.kind == concern`
    or show concerns as a band. The asset exclusions already do the same.

**Code that filters by kind:**
- `content/vocab.json` `pageWorthyKinds`: add `concern`. It is read by
  `site/src/content-core/vocab.mjs`, `site/src/vocab.ts`, and
  `tools/docsnip/src/docsnip/vocab.py`; update their tests.
- `site/src/explain.ts` (around lines 30 and 80–120): add `concern` to
  `ExplainKind` and to the element lists.
- `tools/docsnip/src/docsnip/frontmatter.py` `_ANCHOR_EDGES`: add
  `concern: {appliesTo}`.
- Grep `emit/` and the blog emit targets for any other kind filters.

**Drift cleanup:**
- `architecture/canonicals.yaml`: remove the phantom zero-trust roles, or
  re-home them as `#designed` notes; add the new assets.
- `architecture/glossary.md`: add concern and the new asset kinds.
- `.claude/skills/update-architecture`: teach it the concern kind and the
  rule that Trestle modules map to implementations.

**ADRs:**
- `architecture/adr/ADR-0007-cross-cutting-concerns.md` (fact about the
  lakehouse). It records the concern kind, `appliesTo`, the triad, the rule
  that ids stay stable when a kind changes, and the correction about
  `requires`. Options considered: a tag on capability, a nested group, a
  separate kind (chosen).
- `docs/decisions/ADR-0003-trestle-generated-environments.md` (fact about
  the factory). It records three things:
  - the model owns identity and Trestle carries references;
  - docs environments are generated and committed;
  - generated deployment fragments are `instanceOf` implementations, which
    amends architecture ADR-0003 for generated environments only.
    `trustedCompute` stays hand-written as the narrative topology.

**Verify:** run `just arch-refresh`, `uv run docsnip check`,
`cd site && bun test src/content-core`, `uv run pytest tools/docsnip`, then
`just emit-docs unitycatalog-docs` and `just emit-docs delta-docs`. Diff the
emitted `model:` links before and after; nothing should change.

**Done when** the model validates, `dist/model.json` is regenerated, explain
and emit consumers treat concerns as page-worthy, no content reference
breaks, and both ADRs are merged.

### P2 — Trestle: model references and CLI surfaces (Trestle repo)

- `crates/stack-topology/src/catalog/module.rs`:
  - add `model: Option<String>` to `DataModule` (around line 916), with
    `serde(default, skip_serializing_if = "Option::is_none")`;
  - add a defaulted `Module::model()` method.

  Use a typed field rather than `Provides.extras`, which is per-module and
  stringly typed.
- `crates/stack-topology/src/model/role.rs`: add a `model_ref(role)` lookup
  next to the role constants. It returns `None` for unmapped roles. Roles
  stay an open set.
- `crates/stack-topology/src/catalog/baseline.rs`: set the references from
  §4.
- `crates/stack-topology-wasm/src/{dto,topology}.rs`:
  - add `ModuleDto.model`;
  - add `GraphNodeDto.model` (the module's reference, falling back to its
    role's);
  - add `CatalogDto.roles: [{id, model}]`.
- `crates/trestle/src/cli/env.rs`:
  - `list-modules --json` prints the `CatalogDto`.
  - `env.toml` gets a `[catalog] manifests = [...]` section, merged through
    `Catalog::from_manifests` and `Catalog::merge`. This turns on the
    `catalog` feature in the CLI, which today only loads `baseline_catalog()`.
  - `render` also writes `plan.json`: the `PlanResultDto` without file bodies
    (graph, surfaces, client env).
  - `[context] local_secrets = "inline"`. It writes local secrets (UC
    `server.properties`, `hibernate.properties`, `.env`) as plain files and
    drops them from the generated `.gitignore`, so a committed render is a
    working stack. It refuses hosted modules.
- Knobs on the `unity-catalog` module:
  - `container_name`: content runs `docker exec unitycatalog bin/uc` in nine
    files;
  - `extra_mounts`: the `UC_DOCS_ROOT` bind;
  - `embedded_metadata`: H2, with no `relational_db` or `object_store`
    demand. The default docs environment (21 scripts) runs H2 with a
    `file://` root, and Trestle can't express that today.

  The `image` knob already exists.
- Optionally, add docs-compatible aliases to the `unity-catalog` and `rustfs`
  client env: `AWS_ENDPOINT_URL` and `AWS_ALLOW_HTTP` next to Trestle's
  `AWS_ENDPOINT_URL_S3` and `AWS_REGION`.

**Verify:** run `cargo test -p olai-stack-topology` and
`cargo test -p stack-topology-wasm`, update the goldens, then run
`cargo fmt --all` and `cargo clippy --all-targets --all-features -- -D warnings`.

**Done when** a tagged Trestle revision exposes the references, the JSON
catalog, manifest loading, `plan.json`, inline secrets, and the UC knobs.
That tag is handoff H1.

### P3 — Validate references (docs-factory)

- `envs/trestle.toml` pins the Trestle revision. CI installs it with
  `cargo install --git … --rev … --locked`, cached, or uses a release binary
  once one exists. Rendering doesn't use the npm WASM package, which is
  private and lacks `from_manifests`.
- New `just trestle-catalog` recipe, which writes the committed
  `architecture/dist/trestle-catalog.json` from `list-modules --json`.
- New docsnip check:
  - fails when a module's or role's `model` doesn't resolve in `model.json`;
  - reports modules with no reference.

**Verify:** run `uv run docsnip check` and `uv run pytest tools/docsnip`.

**Done when** CI fails on a dangling Trestle reference and reports unmapped
modules.

### P4 — The first generated environment, next to the hand-written ones

- Add `envs/uc-aws/env.toml` with:
  - modules `unity-catalog`, `rustfs`, `postgres`;
  - `gateway_host_port = 8080` and a dedicated listener on 9000. UC is routed
    at `/api/2.1/unity-catalog` with `Rewrite::Inherit`, so the existing 71
    `localhost:8080` and 29 `localhost:9000` mentions stay valid;
  - `container_name = "unitycatalog"`;
  - the UC `image` knob set to a published docs image, built from
    `envs/unitycatalog/image/` (gcompat, the run-as-owner entrypoint,
    `bin/uc`).
- New `tools/docsnip/src/docsnip/envgen.py` and `docsnip envs --fix`, which
  read the committed `plan.json` and need no cargo. They write two things.
  1. **`architecture/model/deployment/generated/<env>.likec4`.** LikeC4 loads
     everything under `model/`. Nodes become a `datastore` when their role is
     `relational_db` or `object_store`, and a `service` otherwise. Each node is
     `instanceOf` its implementation. Edge mapping:

     | `TopologyEdgeDto` | LikeC4 |
     |---|---|
     | `uses` toward a spec-bearing capability (S3) | `consumes` |
     | `uses` otherwise | `dependsOn` |
     | `route` | `flows`, titled with the listener and prefix |
     | `authenticates` / `authorizes` | `dependsOn`, titled "authenticates via" / "authorizes via" |
     | `access` | dropped (clients are implicit) |

     ```
     deployment {
       environment docsUcAws {
         gateway = service "envoy" { instanceOf envoy }
         unitycatalog = service "unitycatalog" { instanceOf unityCatalogOSS }
         rustfs = datastore "rustfs" { instanceOf rustfs }
         gateway -[flows]-> unitycatalog ":8080 /api/2.1/unity-catalog"
         unitycatalog -[consumes]-> rustfs "S3"
       }
     }
     ```
  2. **The derived facts in `envs/environments.yml`:**
     - ports, from the surfaces' `host_port`;
     - `client-env`, from the host client env.

     Hand-written fields (`title`, `guide`) stay. `environments.py` merges the
     two through a `generated: <name>` key.
- `docsnip check` fails when a fragment or a derived fact is stale relative
  to `plan.json`, or when an environment service maps to no model element.
- New `just env-render <name>` recipe, which runs `trestle env render`
  followed by `docsnip envs --fix`.
- New CI job `envs-render`. It re-renders every environment with the pinned
  Trestle and runs
  `git diff --exit-code envs/ architecture/model/deployment/generated/`. It
  is path-filtered to `envs/**` and the pin, and also runs nightly.

**Verify:** run `cd architecture && bun run check`, then
`docker compose -f envs/uc-aws/compose.yaml up --wait`, then the 11
`compose.aws.yaml` scripts against the new environment through a temporary
override (`uv run pytest content -m needs_uc_server -k aws`).

**Done when** `uc-aws` renders reproducibly, appears in the model, and passes
the aws scripts. Readers don't see it yet.

### P5 — Switch readers to the generated environments

- Go in this order: aws (11 scripts), then postgres (1 script), then the
  default H2 environment (21 scripts; it needs `embedded_metadata`). Delete
  `envs/unitycatalog` and `envs/aws-sim` last.
- `content/conftest.py` (around line 409) resolves UC through the gateway, or
  reads `UNITY_CATALOG_URL` from `plan.json`.
- For client env, prefer the P2 aliases over rewriting prose.
- Teach `just bump-uc` and docsnip's bump to rewrite the image knobs in
  `env.toml`, so `release-bump` still moves every pin.

**Verify:** run every test lane (default, `needs_uc_server`, spark, jvm),
`just emit-docs` for both sites, and the env-bundle contents test. Then run
`just uc-docs` and walk the H27 and H28 steps by hand.

**Done when** no script names a hand-written compose file, and the reader
bundle ships generated environments only.

### P6 — Journeys join the model (docs-factory; after P1)

Make a journey's asset and requirements explicit, then use them for checks
and for linking content.

**Schema** (`tools/docsnip/src/docsnip/compat.py`, `content/*/compatibility.yml`):
- A new `families:` block sets defaults. A journey inherits them and can
  override them.
  - A family is not always one asset: UC's `external`, `managed`, and
    `iceberg` are all tables, which differ in management mode and access
    path. So the fields resolve per journey, and the family only supplies a
    default.
  - `asset: <element id>`:
    - `table`, `external`, `managed`, `iceberg` → `lakehouse.table`
    - `metricview` → `lakehouse.metricView`
    - `catalog`, `schema` → `lakehouse.namespace`
    - `volume` → `lakehouse.volume`
    - `location` → `lakehouse.externalLocation`
    - `credential(s)` → `lakehouse.credential`

    Delta sets one project-level default, `lakehouse.table`.
  - `requires: [<element id>…]`: the contracts the environment must
    provide.
    - `iceberg.*` → `icebergRestSpec`, `icebergSpec`
    - `external.read-vended` → `credentialIssuer`, `s3Api`
    - `managed.*` → `ucSpec`, `deltaSpec`

    The rule follows ADR-0004: name the spec when one exists, otherwise the
    capability. Name an implementation only when there is no contract at all.
    Constraints that belong to an interface (Spark 4.2 for metric views) stay
    on its `pin`. The project-level `spec:` becomes the default `requires`.
- Delta's table features (deletion vectors and so on) stay journey-level
  detail. They don't become model elements.

**Checks.** Following ADR-0001, malformed references fail and gaps are
reported.
1. `asset` or `requires` doesn't resolve, or an `asset` isn't of kind
   `asset`: **fail**.
2. **Edge verification.** An interface whose implementation has a ✓ claim on
   a journey that requires spec S should have a `consumes` or `implements`
   edge to S. A missing edge is **reported**. This generalizes today's report
   against the project-level spec, which is how #190 found the Spark, DuckDB,
   and Polars `consumes ucSpec` edges. It runs in the other direction too:
   `compatibility.json` records which model edges have CI evidence.
3. **Environment fit, after P4.** For every server-side `requires`, a
   claiming script's environment must contain an implementation that
   `implements` or `realizes` it, through the generated fragment: **fail**.
   For example, it fails when a script claims an Iceberg journey against an
   environment whose catalog doesn't serve Iceberg REST.
4. **Coverage gaps, reported:** a `governs` edge from the project's spec to
   an asset that has no verified journey. These feed content requests
   ([`model-leverage.md`](./model-leverage.md) §3.5).

**Linking content.** The existing compat renderer does all of this; there is
no new renderer.
- **Asset rollups.** `<!-- compat:asset:<id> -->` selects every journey on
  an asset, which gives sections like "What you can do with a table, by
  engine". They go on the page that `explains:` the asset. That's verified
  content on a page that already exists, not a thin generated one.
  `compat --fix` renders them and `check` flags them when stale.
- **Row headers link concepts.** Journey rows carry `model:` links to their
  asset and required specs. These resolve to the explaining pages, through
  the emit resolver from #189.
- **Page semantics come from claims.** The journeys a page proves supply its
  JSON-LD `about` (assets) and `mentions` (specs and interfaces), so
  hand-written `references:` only covers what claims don't.
- **The review app.** `compatibility.json` carries `asset` and `requires`,
  and Plan → Compatibility can group by asset.

**Files:** `compat.py`; both `compatibility.yml` files; `content/README.md`
("Compatibility claims"); the Compatibility panel in `site/`; a follow-up
note in [`model-leverage.md`](./model-leverage.md) §4b.

**Verify:** run `uv run docsnip compat --fix && uv run docsnip check` and
`uv run pytest tools/docsnip`. Seed an asset rollup on the UC explanation
page that covers tables or metric views, run
`just emit-docs unitycatalog-docs`, and check that the rollup renders on the
page and in its twin.

**Done when** every journey resolves an asset and its requirements, edge
verification reports run in CI, and at least one explanation page carries a
rollup.

### P7 — Reader and agent surfaces (docs-factory)

These follow the verdicts in [`model-leverage.md`](./model-leverage.md) §2:
no generated page per element, and the raw `model.json` stays internal.

- **"What's in this environment."** Extend `:::prerequisites`
  (`site/src/content-core/environment.mjs`, `emit/docs`) with a short list of
  the environment's services that map to page-worthy elements. Each entry is
  a `model:` link with a one-line role and its gateway URL. It's static HTML,
  and twins carry it.
- **JSON-LD** (`site/src/content-core/head.mjs`, the `docPageHead` path from
  #213 and #215):
  - `about` takes concerns and capabilities from `explains:` and
    `references:`, plus assets from proven journeys.
  - `mentions` takes the resolved `model:` links.
  - How-to and tutorial pages get `tool`, listing the environment's
    implementations as `SoftwareApplication` with `sameAs` set to the
    element's link.
  - They also get `requirements`: the environment title and a link to the
    bundle.
- **`concepts.json`** (`emit/docs/discovery.mjs`) has the following
  sections:
  - logical and technology-catalog elements, including concerns, with typed
    edges;
  - `environments[]`: a public projection that names no repos;
  - verified journeys (interface × journey × asset, each linked to the page
    that proves it), with model edges that have CI evidence marked
    `verified`.
- **MCP tools**, internal first:
  - `explain(id)`;
  - `environment_for(journey | capabilities[])`: the smallest committed
    environment whose implementations cover the request;
  - `generate_stack(capabilities[])`: runs Trestle locally and returns the
    plan and the deployment fragment.
- **docsnip validate reports:** an environment service with no element, and
  a concern with no `appliesTo` edge or no realizing implementation.

**Verify:** run `emit/docs/__tests__/heads.test.mjs`, the discovery tests,
`cd site && bun test src/content-core`, and `uv run docsnip check`.

### P8 (optional) — Annotations on the Trestle diagram (Trestle repo)

`node/trestle-diagram` accepts an `annotations` prop (title, summary, href,
and maturity, keyed by module or role). docs-factory, or Trestle's env app
when given a file, passes a projection of `model.json`. Trestle still ships
no C4 data.

## 6. Risks

- **Reader URLs.** Mapping the gateway to 8080 and a listener to 9000 keeps
  the API paths. There are 32 bare `localhost:8080` mentions. Either add a
  `/` route or confirm they're prose only; otherwise Envoy answers 404 at
  `/`.
- **aws-sim parity.** Trestle's rustfs differs from `envs/aws-sim` in its
  root keys, in `RUSTFS_SERVER_DOMAINS` (host JVM virtual-hosted requests
  need `localhost:9000`), and in cert paths. Diff `envs/aws-sim/compose.yaml`
  against `templates/modules/rustfs/compose.yaml.jinja` before P5. Spark's
  host-side virtual-hosted access is the likeliest thing to break. The
  sts-shim is already identical.
- **Committed secrets.** They're throwaway local keys only. The inline mode
  has to refuse hosted modules.
- **CI cost.** A cold cargo install of Trestle takes about 3–5 minutes. Only
  the path-filtered `envs-render` job pays it; `docsnip check` reads
  committed files.
- **Kind change.** Any consumer of `model.json` that filters
  `kind == capability` loses governance, lineage, and observability until
  it's updated. P1 greps for them.
- **Two deployment stories.** `trustedCompute` stays the narrative topology,
  and generated environments are facts about the docs environments. The
  factory ADR keeps the two apart.

## 7. Handoffs and ordering

```
P1 (model) ──┬─────────────► P6 (journeys; env-fit check waits for P4)
             ├─────────────► P7 (model-only parts)
P2 (Trestle) ┴► H1 tag ─► P3 ─► P4 ─► P5
                    └──────────────────────► P8 (any time after P2)
```

P1 and P2 run in parallel. P3 starts when H1 is tagged. P7's
environment-dependent parts (the environment section, `tool`, and
`environments[]`) wait for P4.

P6 adds moderate complexity, mostly in `compat.py`. It provides the plan's
highest-value link: model edges backed by CI evidence, and an asset-centric
verified matrix on the explanation pages people search for.

## 8. Open questions

- **The UC docs image.** Publish it (`ghcr.io/…/uc-docs:<version>`, set
  through the `image` knob), or add a `build` knob to Trestle? Publishing is
  simpler and also gives `release-bump` a single pin.
- **A `/` catch-all on the gateway.** Is one needed for bare
  `localhost:8080`, or do we fix the prose?
- **Identity.** Does it split out of governance as its own concern once an
  OIDC or identity spec is modeled?
- **`appliesTo` titles.** Should they come from a controlled verb list
  (secures, tracks lineage of, observes) that validators enforce?
- **The other docs environments.** Should Delta's Spark lane and the
  `kind` lane (H22, H24) also become Trestle environments, or stay outside
  compose?
