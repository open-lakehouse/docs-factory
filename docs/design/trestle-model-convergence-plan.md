# Trestle ↔ model convergence: execution plan

**Status:** plan, 2026-10-16. P0 done (#219); P1a, P1b, and P2 done; P3a done (trestle#142, H1a); P4 done, ahead of P3b; P3b done (trestle#143, H1b); P5 done (H1c, trestle#144; H1d, trestle#145); P6 next.
**Design:** [convergence design](trestle-model-convergence.md). Decisions and
their rationale live there (§10); this file says what each session does.

Each phase fits one session and merges on its own. Re-inspect both repos at the
start of a phase: counts, line numbers, and Trestle internals drift. Paths are
relative to the named repo; *new* marks a path that doesn't exist yet. No phase
sets a page to `ready` without the review approval signal, and none publishes
packages or deploys as a side effect.

## Order

```
P0 baseline + ADRs ─► P1 model ─┬─► P2 journeys ───────────────┐
                                │                              ├─► P7 surfaces
P3a export (H1a) ───────────────┴─► P4 map ─► P5 pilot ─► P6 cutover
P3b knobs (H1b) ──────────────────────────────┘
                                         └──────────────────────► P8 diagram (optional)
```

- P0 → P1 → P2 need no Trestle change, and P2 ships value on its own.
- P3 runs in Trestle in two PRs. Each handoff is a merge commit on Trestle's
  `main`, not a release: P3a's is **H1a**, P3b's is **H1b**.
- P4 needs P1 and H1a. P5 needs H1b, and its environment-fit check also needs P2.
- P7's model-only parts (JSON-LD from claims, `concepts.json` without
  `environments[]`) can start after P2; its environment parts wait for P5.
- P8 needs P3 and P4's context artifact.

The pilot is complete when one approved journey can be followed from its
explanation page, through the generated C4 view and Trestle's graph, to the
downloaded Compose bundle and its passing CI claim, with every join validated
and no duplicated authored wiring.

## P0 — Baseline and ADRs (docs-factory)

1. Clean up the drift in design §1: remove the phantom
   `lakehouse.governance.{pap,pdp,pep,pip,pa}` from `architecture/canonicals.yaml`
   (or re-home them as `#designed` notes); fix the `governance.likec4` and
   `governanceModel` references; correct the `requires` comments to `dependsOn`
   (ADR-0005, `specification.likec4`); make `architecture/README.md` and
   `architecture/design/deployments.md` describe the topology that exists.
   Correct facts from source evidence; don't create systems because old prose names them.
2. Write `architecture/adr/ADR-0007-cross-cutting-concerns.md` (*new*), amend
   `architecture/adr/ADR-0003-logical-abstract-deployment-concrete.md`, and write
   `docs/decisions/ADR-0003-trestle-generated-environments.md` (*new*), per design §9.
   Update both ADR indexes.
3. Inventory the UC environment variants (`envs/unitycatalog/compose{,.aws,.postgres}.yaml`,
   `envs/aws-sim/`): the scripts using each, which ones gate CI, mounts, the
   container name, endpoints, image fixes, and state. This feeds P3's knobs and P5.
   Done: [`trestle-env-inventory.md`](trestle-env-inventory.md).

**Files:** `architecture/{README.md,canonicals.yaml,glossary.md}`,
`architecture/design/deployments.md`, `architecture/adr/`, `docs/decisions/`.

**Verify:** `just arch-refresh` if any `.likec4` changes (commit its generated
artifacts with the change), and `uv run docsnip check`.

**Done when** the prose matches the model, the three ADRs are merged as
proposed or accepted, and the inventory is in the handoff.

## P1 — Model refactor (docs-factory)

**Model:**
- `architecture/model/specification.likec4`: add `element concern` (hexagon,
  amber) and `relationship appliesTo { line dotted }`.
- `architecture/model/logical/capabilities.likec4`: switch governance, lineage,
  and observability to `concern`. IDs don't change.
- `architecture/model/logical/concerns.likec4` (*new*): lineage `appliesTo`
  table, volume, mlModel, view; governance `appliesTo` every asset kind;
  observability `appliesTo` queryEngine, catalog, orchestration. Move
  `orchestration -[flows]-> observability` here.
- `architecture/model/logical/assets.likec4`: add view, metricView, credential,
  externalLocation (design §4).
- `architecture/model/logical/technology-catalog.likec4`: add the implementations
  and specs from design §4 (including `headwaters`), plus
  `unityCatalogOSS -[implements]-> icebergRestSpec`.
- `architecture/model/views/logical-views.likec4`: add a `concernMatrix` view.
  In `referenceContext` and `capabilityMap`, exclude `element.kind == concern`
  (or show concerns as a band) and exclude `#generated`.

**Code that filters by kind:**
- `content/vocab.json` `pageWorthyKinds`: add `concern`. Readers:
  `site/src/content-core/vocab.mjs`, `site/src/vocab.ts`,
  `tools/docsnip/src/docsnip/vocab.py`; update their tests.
- `site/src/explain.ts`: add `concern` to `ExplainKind` and the element lists.
- `tools/docsnip/src/docsnip/frontmatter.py` `_ANCHOR_EDGES`: add `concern: {appliesTo}`.
- `grep -rn "capability" emit/ site/src tools/docsnip/src` for other kind filters,
  including the blog emit targets.

**Also:** `architecture/glossary.md` (concern, new asset kinds, Trestle's
"capability" vs ours); `.claude/skills/update-architecture` (concern kind, the
rule that a Trestle module ref names an implementation).

**Verify:** `just arch-refresh`, `uv run docsnip check`,
`cd site && bun test src/content-core`, `uv run pytest tools/docsnip`, then
`just emit-docs unitycatalog-docs` and `just emit-docs delta-docs`. Diff the
emitted `model:` links before and after; nothing should change.

**Done when** the model validates, `dist/model.json` is regenerated, explain and
emit treat concerns as page-worthy, and no content reference breaks.

**Done (P1a).** LikeC4 has no hexagon shape, so concerns render as amber
`component`s; `view` is a keyword, so the view asset is `sqlView`. The
`technologyCatalog` view includes implementations by kind. Added
`openLineageSpec` and `otlpSpec` (headwaters and Jaeger anchor on them).
`explainNav` has no renderer today, so concerns join it as top-level nodes.

## P1b — Governance facets and query surfaces (docs-factory)

**Depends on** P1a. Split out during P1 planning; P2 doesn't need it.

- Revise ADR-0007 while it's Proposed, then accept it: governance is a parent
  concern with nested facets (`authentication`, `authorization`,
  `fineGrainedAccess`; audit deferred). `#partial` marks a `realizes` edge that
  meets a facet only together with another contributor. Whether a facet is fully
  met is a property of an environment, not of one implementation. Amend design
  §2, §4 (`auth` → authentication full, `policy` → authorization partial,
  `notebooks` → interactiveDevelopment) and §10.
- FGAC: the catalog defines row filters and column masks (`#partial`); a trusted
  engine enforces them in-plan (`#partial`). `hydrofoil` joins the technology
  catalog and `trustedCompute.hydrofoil` becomes its instance; mangrove stays
  `instanceOf lakehouse.catalog`.
- Ad-hoc query APIs are specs that specify `queryEngine`, only where something
  in the estate implements them (Spark Connect, Arrow Flight SQL, openCypher).
  A "warehouse" is a served engine, not a new capability.
- New capability `interactiveDevelopment` (notebooks, editors), realized by
  marimo; it flows to the query engine and persists notebooks as files in
  volumes. No notebook asset kind.
- Governance breadth stays on the spec (`governs`); implementations inherit it
  through `implements`.

**Verify:** as P1. **Done when** the facets validate, the explain nav lists
them, and design §2/§4/§10 match the model.

**Done (P1b).** UC OSS has no row filter, column mask, or ABAC API (R01), so it
gets no fine-grained-access edge; hydrofoil's `#partial` contribution is the
only one, and it needs the catalog's resource facts. Facets join `explainNav`
as flat concern nodes (it has no renderer yet). LikeC4 1.58 can't style edges by
tag in a view rule we use, so `#partial` edges render like the rest.

## P2 — Journeys join the model (docs-factory)

**Depends on** P1 (the asset kinds and the Iceberg edge).

1. Extend `Journey` in `tools/docsnip/src/docsnip/compat.py` with `families:`,
   `asset`, and participant-keyed `requires` (design §5). Keep `(project, id)`
   identity, `request`, `claims.<interface>`, anchors, row order, and ready-page gating.
2. Prove the schema on three journeys: UC `iceberg.read` (requires Iceberg REST,
   not the matrix `ucSpec`), UC `catalog.create` (a UC API op with a CLI/SDK
   claimant, so participants aren't assumed to be engines), and Delta `read.scan`
   (a local library, no environment).
3. Migrate the remaining journeys in both `content/{unitycatalog,delta}/compatibility.yml`
   through family defaults.
4. Replace the matrix-spec diagnostic with per-journey edge verification. Keep
   the matrix `spec` as topic context and as the fallback for any journey still
   unannotated. Never infer semantics from ID prefixes.
5. Implement the checks table in design §5, except environment fit (P5).
   Negative claims and missing model edges keep their meanings.
6. Extend `compatibility.json` with `asset`, resolved `requires`, the edges that
   have CI evidence, and structural diagnostics, under an explicit artifact
   version policy. Update `site/src/compat.ts` and the Compatibility panel to
   group by asset; JS consumes and doesn't re-resolve.
7. Add `<!-- compat:asset:<id> -->` rollups to the compat renderer; seed one on
   the UC explanation page that `explains:` tables or metric views.
8. Land the "Compatibility claims" text from design §12 in `content/README.md`;
   add a follow-up note to `model-leverage.md` §4b.

**Verify:** `uv run docsnip compat --fix && uv run docsnip check`,
`uv run pytest tools/docsnip`, then `just emit-docs unitycatalog-docs` and check
that the rollup renders on the page and in its twin. Diff cell outcomes before
and after; metadata alone must change none. Tests cover: wrong element kind,
per-journey contracts, legacy fallback, cross-project claims, unmodeled
clients, negative claims, and environment-free realizations.

**Done when** every journey resolves an asset and requirements, edge
verification reports in CI, and one explanation page carries a rollup.

**Done (P2).** Journeys name their family explicitly (`family:`), never from the
ID prefix; Delta uses matrix-level `defaults`. All journeys migrated at once,
with every cell outcome unchanged (138 UC, 245 Delta). Edge verification
accepts `consumes` or `implements` from the client's interface model and
reports through `docsnip check`'s model-quality section; `compatibility.json` is
version 2 (`assets`, `verifiedEdges`, `diagnostics`, and per-journey `family`,
`asset`, `requires`). The rollup is on UC's external-and-managed-tables
explanation. Row-header `model:` links for journeys are deferred: they would
change every existing table.

## P3 — Trestle: identity refs, export, and knobs (Trestle repo)

**Depends on** P0's inventory (for the knobs). Split into P3a (export, unblocks
P4) and P3b (knobs, unblocks P5), stacked PRs in Trestle.

### P3a — Identity refs, shared projection, `plan.json`, CLI

**Done (P3a, trestle#142).** **H1a** = `1406bec5f0ce484ce2c5157c87f8a24cdb71bc9a`
on Trestle `main` (no release; install with
`cargo install --git https://github.com/open-lakehouse/trestle --rev 1406bec5f0ce484ce2c5157c87f8a24cdb71bc9a --locked olai-trestle`).

- `Module::model()` / `DataModule.model`: a typed, optional ref to a model
  element, checked for shape only (dot-separated identifiers). Every baseline
  module has one (design §4), including the hand-written `headwaters` and
  `omnigent` and the `mlflow` wrapper. `rivers` refs `rivers`, which P4 adds
  to the model.
- The projection moved unchanged into `olai_stack_topology::projection`; the
  WASM crate re-exports it. Nodes and modules carry `model`, and every edge
  carries `key` = `kind:from→to:qualifier` (the capability for `uses`, the
  surface's host port for gateway edges). `Provides.helpers` declares the init
  jobs and sidecars that only templates named before; a test fails on any
  rendered container that is neither a service nor a declared helper.
- `plan.json` (format `trestle-plan`, version 1), schema
  `crates/stack-topology/schema/plan.v1.schema.json`, fixtures in
  `crates/stack-topology/tests/fixtures/plan/{baseline-uc,custom-context,hosted}/`.
  It holds `context`, `graph`, `containers` (name, component, and `service`,
  `init`, or `sidecar`), `services`, `gateway`, `client.{host,container}`,
  `files` (path and `sensitive`, never contents), and provenance (`generator`,
  `catalog.{baseline,manifests,digest}`, `recipe.digest`). It's byte-stable,
  and no secret value reaches it.
- `plan_result_for_manifest` (and WASM `planManifest`) honours a manifest's
  whole context; `plan_result` still defaults it.
- CLI: `trestle env new` and `trestle env render [<dir>] [--out-dir <dir>]`
  write `<out>/plan.json`. `env.toml` `[catalog] manifests = [...]` merges
  module manifests (relative to `env.toml`) over the baseline.
  `trestle env list-modules --json [--dir <env>]` prints the catalog projection
  with the same `catalog` identity `plan.json` records. Building with
  `TRESTLE_REVISION` set adds `generator.revision`.
- Diagram snapshots: v1 stays readable (missing edge keys are derived on read).
  Parsing now checks supported versions, unique node IDs, edge endpoints, known
  kinds, and unique keys. `bun run test` runs in Trestle's Web CI job.

### P3b — UC knobs, inline secrets, endpoint aliases, known aws-sim gaps

- `unity-catalog` knobs: `container_name`; `extra_mounts` (`;`-separated
  Compose short-syntax volumes); `build` (a context path relative to the render
  root); `embedded_metadata` (H2, drops both demands). Demands resolve before
  knobs today, so `embedded_metadata` needs a knob-aware `Module::needs_in`,
  with every demand-index site switched to it. Add `init: true` to the UC
  service.
- `[context] local_secrets = "inline"`: sensitive files are written as ordinary,
  un-ignored files and included in `PlanResultDto.files`; planning refuses
  hosted modules.
- `AWS_ENDPOINT_URL` and `AWS_ALLOW_HTTP` beside `AWS_ENDPOINT_URL_S3` and
  `AWS_REGION`, behind an opt-in `rustfs` knob. A global endpoint also
  redirects STS for every SDK client, so turning it on by default would change
  existing stacks.
- Known parity gaps, pulled forward from P5 step 7: `localhost:<port>` in
  `RUSTFS_SERVER_DOMAINS` when S3 has a host listener; UC `server.properties`
  with the `aws.*` master-identity keys the docs use (check which keys UC 0.7
  reads); a recipe-settable S3 host port (:9000).
- Docs-shaped fixtures `docs-uc-aws` and `docs-uc-default` with committed
  goldens, and a manual `docker compose up` smoke of `docs-uc-aws`.

- Asks from P4, which ran first so that its findings land in this PR:
  - `list-modules --json` gains the envelope `plan.json` has: `format:
    "trestle-catalog"`, `version: 1`, and the same `generator {name, version,
    revision}` block, plus `schema/catalog.v1.schema.json` and a golden fixture.
    docsnip already accepts it and then fails when the revision isn't the pin.
  - `trestle --version` prints the embedded `TRESTLE_REVISION`, so a cached
    install can be checked against the pin instead of a marker file.
  - No module ref needs correcting: all 17 resolve to implementations, and every
    mapped role has a model path to its target.

**Verify:** P3a's checks, plus tests for each knob (set, unset, invalid), the
inline-secret refusal, and demand-index consistency under `needs_in`.

**Done when** a merge commit (H1b) exposes the four UC knobs, inline secrets,
the endpoint aliases, and passing docs-shaped fixtures. The handoff records the
SHA, the knob names and syntax, and the parity gaps left for P5.

**Done (P3b, trestle#143).** **H1b** = `35dba41fb567e87cb65f02a814c9d22a42460aba`
on Trestle `main`; `envs/trestle.toml` pins it. `list-modules --json` is now
catalog v1 (`format: "trestle-catalog"`, schema
`crates/stack-topology/schema/catalog.v1.schema.json`), and docsnip requires
it, including a `generator.revision` equal to the pin. `trestle --version`
prints `trestle <version> (<revision>)`, which `just trestle-install` checks
instead of a marker file.

The user changed one decision: storage bindings live in UC's database, not in
`server.properties` (design §10). The numbered `s3.*` keys are gone;
`server.properties` holds only UC's master identity (`aws.accessKey`,
`aws.secretKey`, `aws.region`, `aws.masterRoleArn`). A `unitycatalog-storage`
sidecar registers a storage credential and an external location per bucket
over the REST API, idempotently, and turns healthy when done (a one-shot job
nothing depends on fails `docker compose up --wait`).

| Module | Knob | Syntax and default |
|---|---|---|
| `unity-catalog` | `storage_bootstrap` | `api` (default) or `none`. Docs stacks use `none`: their pages register `lake_storage` / `lake` themselves. |
| | `default_catalog` | A UC identifier, unset by default. In `api` mode it also creates the catalog with `storage_root = <first bucket>/<name>`. |
| | `master_role_arn` | The role UC reports as its own (`aws.masterRoleArn`); defaults to the store's role. The docs check `uc-master`, not the storage role. |
| | `embedded_metadata` | Bool, `false`. H2 inside the container; `needs_in` drops the `relational_db` and `object_store` demands. |
| | `container_name` | Validated Compose name, unset. |
| | `extra_mounts` | `;`-separated Compose short-syntax volumes, verbatim, so `${UC_DOCS_ROOT:-/tmp/uc-docs}:${UC_DOCS_ROOT:-/tmp/uc-docs}` survives. |
| | `build` | A context relative to the render root (no absolute paths, no `..`); adds `pull_policy: build` and tags `image`. |
| | `storage_image` | `python:3.13-alpine`, the registrar's image. |
| `rustfs` | `generic_endpoint_env` | Bool, `false`. Adds `AWS_ENDPOINT_URL` and `AWS_ALLOW_HTTP=true` to the client env. |
| `[context]` | `local_secrets` | `separate` (default) or `inline`; inline writes credential files as ordinary files and refuses hosted modules. |

The UC service always gets `init: true`. `RUSTFS_SERVER_DOMAINS` adds
`localhost:<port>` when S3 has a host listener, and `dedicated_listener_ports =
[9000]` already puts S3 on host :9000, so no port knob was needed. Fixtures
`docs-uc-aws`, `docs-uc-default`, and `uc-api-storage` (in
`crates/stack-topology/tests/fixtures/plan/`) commit `plan.json` and the
rendered files. A manual `docker compose up --wait` of `docs-uc-aws`, built
from `envs/unitycatalog/image/`, passed `aws_storage.py`,
`aws_storage_cli.py`, `managed_storage.py`, and `managed_storage_cli.py`.

Gaps left for P5:
- `docs-uc-aws` keeps metadata in Postgres; `compose.aws.yaml` uses H2. Pick
  one (add `embedded_metadata` with an object store, or accept Postgres) before
  diffing.
- `.gitignore` must not ignore `.env` under generated environment directories,
  or the inline secrets can't be committed.
- The recipe needs the `uc-docs` bucket as an `extra_resources` entry and the
  UC 0.7.0 pin from `release.yml` (Trestle still defaults to 0.6.0).
- Whether `init-storage`'s `chmod 0777 $UC_DOCS_ROOT` is still needed is open.
- MLflow's UC model registry wasn't exercised against API-registered storage.

## P4 — Mapping and validation (docs-factory)

**Depends on** P1 and H1a.

1. `envs/trestle.toml` (*new*) pins the H1a revision. CI installs it with
   `cargo install --git … --rev … --locked`, cached (or a release binary once
   one exists). Rendering doesn't use the private npm WASM package.
2. `architecture/integrations/trestle.yaml` (*new*): role → target + `scope`,
   with explicitly unmapped roles (design §4). It is keyed by catalog identity,
   supports aliases, and rejects conflicting entries.
3. `just trestle-catalog` (*new*) writes the committed
   `architecture/dist/trestle-catalog.json` from `list-modules --json`.
4. A docsnip check fails when a module `model:` ref or a map target doesn't
   resolve in `model.json` (or resolves to the wrong kind), and reports modules
   with no ref and roles with no entry.
5. `docsnip` writes the portable context artifact (design §6, item 3) for P8.

**Verify:** `uv run docsnip check`, `uv run pytest tools/docsnip` with fixtures
for aliases, ambiguous and partial mappings, missing targets, a multi-service
module, and unmapped infrastructure. Everything runs with no sibling checkout
and no network.

**Done when** CI fails on a dangling Trestle reference and reports coverage.

**Done (P4, against H1a).** `rivers` joined the technology catalog
(`realizes lakehouse.orchestration`). `envs/trestle.toml` pins H1a, and
`just trestle-install` builds it into a repo-local `.tools/trestle`.
`architecture/dist/trestle-catalog.json` is `list-modules --json` verbatim; the
`Trestle` workflow (path-filtered, nightly) rebuilds the pin and fails on a diff.
The role map has a `version`, the `catalog` baseline it interprets, and flat
role `aliases`; its loader rejects duplicate keys, which PyYAML would otherwise
drop silently. `tools/docsnip/src/docsnip/trestle.py` runs inside
`docsnip check`: dangling or wrong-kind refs and targets fail; modules with no
ref, unmapped roles, roles no module provides, contributions with no
`realizes` / `implements`→`specifies` path, and full-scope roles over only
`#partial` edges are reported. The context artifact,
`architecture/dist/trestle-context.json`, holds model facts only (titles,
descriptions, external links, the specs each implementation implements). It
has no `verified` field: CI evidence in `compatibility.json` is about the
clients' edges, not the modules', so it can't vouch for a module. P7's
`concepts.json` carries that evidence. First run: 0 errors; the only gaps are
`sql_engine` and `app_runtime`, mapped before any module provides them. The
Trestle asks are under P3b.

## P5 — The first generated environment, beside the hand-written ones (docs-factory)

**Depends on** P4 and H1b; P2 for the environment-fit check.

1. `envs/uc-aws/env.toml` (*new*): modules `unity-catalog`, `rustfs`, `postgres`;
   `gateway_host_port = 8080` plus a :9000 listener; UC at
   `/api/2.1/unity-catalog` with `Rewrite::Inherit`; `container_name = "unitycatalog"`;
   `build` pointing at a copy of `envs/unitycatalog/image/`. Take the UC version
   from `content/unitycatalog/release.yml`, never Trestle's default.
2. `tools/docsnip/src/docsnip/envgen.py` (*new*) and `docsnip envs --fix`: from
   committed `plan.json`, write `architecture/model/deployment/generated/<env>.likec4`
   and the derived `environments.yml` facts (design §6). `environments.py` merges
   them through `generated: <name>`.
3. `docsnip check` fails when a fragment or derived fact is stale against
   `plan.json`, or when a service maps to no element.
4. Turn on the environment-fit check from design §5.
5. `just env-render <name>` (*new*): `trestle env render`, then `docsnip envs --fix`.
6. CI job `envs-render` (*new*): re-render every generated environment with the
   pinned Trestle and run
   `git diff --exit-code envs/ architecture/model/deployment/generated/`.
   Path-filtered to `envs/**` and the pin; also nightly.
7. Diff `envs/aws-sim/compose.yaml` against Trestle's rustfs template (root keys,
   `RUSTFS_SERVER_DOMAINS`, cert paths) and fix gaps in Trestle, not with patches
   to the generated YAML.

**Verify:** `cd architecture && bun run check`;
`docker compose -f envs/uc-aws/compose.yaml up --wait`; the 11 `compose.aws.yaml`
scripts against it through a temporary override
(`uv run pytest content -m needs_uc_server -k aws`); Linux ownership and CLI
checks in the service lane.

**Done when** `uc-aws` renders reproducibly, appears in the model, and passes
the aws scripts, with no claim weakened. Readers don't see it yet.

**Done (P5, against H1d).** **H1c** = `c643cf0246b79973af90bdc3d1686581e1bd566f`
(trestle#144, the parity fixes); **H1d** = `4ff53d5b23e7318d9c266b5f56f0ea57fcc1c67f`
(trestle#145, the UC `writable_mounts` knob, found by the first Linux pilot
run), which `envs/trestle.toml` pins. `envs/uc-aws/` holds the recipe, a copy of the
image, the committed render, and `plan.json`. It runs Postgres, not H2 (design
§10 #45). The diff against aws-sim (step 7) found five gaps, all fixed in Trestle
as H1c, trestle#144 (#49): Envoy 1.38; `sts-shim` init; an envoy
`publish_admin` knob; a UC `bucket` knob, which replaces the extra resource;
and `x-amz-bucket-region` on emulated S3, without which every Iceberg REST
write failed. The first Linux pilot found two more: the DataFrame seed writes
with aws-sim's root keys (aws-sim now uses Trestle's, #53), and nothing opened
`UC_DOCS_ROOT` (H1d's `writable_mounts`, #54). The parity table is in the
[inventory](trestle-env-inventory.md#envsuc-aws--the-generated-stand-in-p5).

`docsnip envs [--fix]` (`envgen.py`) writes
`architecture/model/deployment/generated/uc-aws.likec4` (nodes `instanceOf`
their implementations, edges keyed by plan edge, plus a `ucAwsDeploy` view)
and `envs/environments.generated.json`, which both registry readers merge
(#46). `docsnip check` fails when the plan's revision or catalog digest isn't
the pin's, a node has no implementation, a projection is stale, or an
environment has no `generated:` entry. Environment fit runs on every working
claim against generated environments and their stand-ins (#47, #50).
`just env-render [name]` re-renders. The Trestle workflow re-renders and
fails on a diff, and `envs-pilot` runs the stood-in scripts on Linux without
gating.

Results: the re-render is deterministic, the fit check is clean, and locally
the four Iceberg scripts and two CLI scripts pass on `uc-aws`. The five SDK and
DataFrame scripts can't resolve `unitycatalog-client==0.7.0` through the
internal proxy here; `envs-pilot` is their first run. The UC site's bundle and
`environments.json` are unchanged. P6 then switches the aws variant over: it
removes `stands-in-for`, repoints the 11 scripts, and accepts the larger
client env.

## P6 — Switch readers to generated environments (docs-factory)

**Depends on** P5. One variant per PR: aws, then postgres, then the default H2
environment (which needs `embedded_metadata`).

1. Per variant: run every affected ready script against the generated
   environment before repointing its scripts' `compose` key. Keep container and
   command conventions, or update every dependent example in the same PR.
2. `content/conftest.py`: replace the hard-coded
   `get_service_host_and_port("unitycatalog", 8080)` with the host contract from
   `plan.json`. Keep per-script isolation, logs on failure, and cleanup; keep the
   old path for unmigrated variants.
3. `emit/docs/env-bundle.mjs`: an explicit runtime-file manifest for generated
   environments (Compose inputs, build context, config files, scripts, modes),
   plus an archive smoke test that extracts the bundle outside the repo, starts
   it, and runs one pilot script.
4. `just bump-uc` and docsnip's bump rewrite the UC version in `env.toml` and the
   Dockerfile `FROM`, then re-render, so `release-bump` still moves every pin.
   Update the release-bump skill.
5. Delete `envs/unitycatalog` and `envs/aws-sim` after the last variant moves.
6. Land the convention text from design §12 in `architecture/README.md`,
   `content/README.md`, and `AGENTS.md`. Rewrite the stale assumptions in
   `docs/design/agentic-docs.md`.

**Verify:** every test lane (default, `needs_uc_server`, spark, jvm),
`just emit-docs` for both sites, the env-bundle tests and smoke test, then
`just uc-docs` and walk H27 and H28 by hand.

**Done when** no script names a hand-written compose file, the reader bundle
ships generated environments only, emission needs neither Trestle nor Rust, and
each variant can be rolled back to its previous files.

## P7 — Reader and agent surfaces (docs-factory)

**Depends on** P2 (model-only parts) and P5 (environment parts).

1. "What's in this environment" in `:::prerequisites`
   (`site/src/content-core/environment.mjs`, `emit/docs`), carried by twins.
2. JSON-LD `about`/`mentions` from claims and `tool`/`requirements` from the
   environment, through `docPageHead` in `site/src/content-core/head.mjs`.
3. `concepts.json` in `emit/docs/discovery.mjs` (design §8), linked from the
   existing discovery artifacts.
4. Public projection with a positive selection. Negative fixtures prove that a
   draft/private page or internal element can't leak through an edge, a
   backlink, a generated description, or metadata.
5. Internal agent queries over the committed artifacts, with evidence states,
   plus a changed-module/concept/pin impact report. Evaluate them on a fixed task
   set: find a vended-credential example, explain its components, regenerate its
   stack, explain why "full governance" lacks evidence, and list pages affected
   by a UC pin change.
6. docsnip reports: an environment service with no element; a concern with no
   `appliesTo` edge or no realizing implementation.

**Verify:** `emit/docs/__tests__/heads.test.mjs`, the discovery tests,
`cd site && bun test src/content-core`, `uv run docsnip check`; emit the UC site
and inspect the page text, twins, and public payloads.

**Done when** a reader or agent can go page → script → environment →
implementation → spec/capability → explanation using static artifacts, and the
negative visibility fixtures pass.

## P8 (optional) — Trestle diagram annotations (Trestle repo)

**Depends on** P3 and P4's context artifact.

- `node/trestle-diagram` accepts an `annotations` prop (title, summary, href,
  maturity, keyed by module or role) loaded from the artifact file, not a live
  docs-factory checkout.
- Saved snapshots record the artifact digest they were enriched with; newer
  context needs explicit re-enrichment. Unenriched and offline rendering keep working.
- Decide packaging before another repo imports the renderer; the current
  packages are private workspace packages. A static fallback can ship first.

**Verify:** snapshot compatibility tests, inspector UI tests, package typecheck.

**Done when** the same pilot module resolves to the same concepts on the docs
site and in Trestle.

## Session handoff

Each session records, in its PR description:

- the phase and repo, plus the input artifact and schema versions (Trestle SHA,
  `plan.json` schema, `compatibility.json` version);
- decisions made and any amendment to the design (update design §10 in the same PR);
- changed contracts, fixtures, and the downstream entry point;
- checks run with results, including the environment and recipe for runtime tests;
- remaining parity and coverage gaps, and which phase can proceed.
