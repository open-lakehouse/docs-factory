# Trestle ↔ model convergence: execution plan

**Status:** plan, 2026-10-15. Nothing is built.
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
P3 Trestle (parallel) ──────────┴─► P4 map ─► P5 pilot ─► P6 cutover
                                         └──────────────────────► P8 diagram (optional)
```

- P0 → P1 → P2 need no Trestle change, and P2 ships value on its own.
- P3 runs in parallel with P0–P2; its tagged revision is handoff **H1**.
- P4 needs P1 and H1. P5's environment-fit check also needs P2.
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

## P3 — Trestle: identity refs, export, and knobs (Trestle repo)

**Depends on** P0's inventory (for the knobs). Can start alongside P0.

- `crates/stack-topology/src/catalog/module.rs`: add `model: Option<String>` to
  `DataModule` with `serde(default, skip_serializing_if = "Option::is_none")`,
  and a defaulted `Module::model()`. Use a typed field, not `Provides.extras`.
  Roles get no model ref; their mapping lives in docs-factory.
- `crates/stack-topology/src/catalog/baseline.rs`: set the module refs from design §4.
- Projection: move the pure projection into `crates/stack-topology/src/projection.rs`
  (*new*), re-exported by `crates/stack-topology-wasm/src/{dto,topology}.rs`. Check
  the dependency cost before settling the boundary. Add `GraphNodeDto.model`,
  `ModuleDto.model`, the service inventory and component membership, and
  composite edge keys.
- `plan.json` envelope (design §6) with a JSON schema and fixtures: baseline
  UC, nondefault context (gateway port, provider preference), and a hosted provider.
- `plan_result`: add a full-context variant; keep the defaulting call.
- `crates/trestle/src/cli/env.rs`:
  - `list-modules --json` prints the catalog DTO (module IDs, model refs, roles).
  - `env.toml` `[catalog] manifests = [...]`, merged through
    `Catalog::from_manifests` and `Catalog::merge` (enables the CLI's `catalog`
    feature, which today loads only `baseline_catalog()`).
  - `render` also writes `plan.json`.
  - `[context] local_secrets = "inline"`, which refuses hosted modules.
- `unity-catalog` module knobs: `container_name`, `extra_mounts`,
  `embedded_metadata` (H2, no relational/object-store demand), and `build`
  (a build context path relative to the recipe). `image` already exists.
- Client env aliases: `AWS_ENDPOINT_URL` and `AWS_ALLOW_HTTP` next to
  `AWS_ENDPOINT_URL_S3` and `AWS_REGION` on `unity-catalog`/`rustfs`.
- Keep v1 diagram snapshots readable in `node/env-editor/src/diagram/`, or bump
  the version with a migration. Validate node IDs, edge endpoints, duplicates,
  and supported versions.

**Verify:** `cargo test -p olai-stack-topology`, `cargo test -p stack-topology-wasm`
(update goldens), the WASM build, the diagram snapshot tests, `cargo fmt --all`,
and `cargo clippy --all-targets --all-features -- -D warnings`.

**Done when** a tagged revision (H1) exposes the module refs, the JSON catalog,
manifest loading, a deterministic `plan.json` (identical inputs give identical
bytes, custom context survives, no credentials), inline secrets, and the four
UC knobs. The handoff records the tag, the schema, and the exact CLI flags.

## P4 — Mapping and validation (docs-factory)

**Depends on** P1 and H1.

1. `envs/trestle.toml` (*new*) pins the H1 revision. CI installs it with
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

## P5 — The first generated environment, beside the hand-written ones (docs-factory)

**Depends on** P4; P2 for the environment-fit check.

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

- the phase and repo, plus the input artifact and schema versions (Trestle tag,
  `plan.json` schema, `compatibility.json` version);
- decisions made and any amendment to the design (update design §10 in the same PR);
- changed contracts, fixtures, and the downstream entry point;
- checks run with results, including the environment and recipe for runtime tests;
- remaining parity and coverage gaps, and which phase can proceed.
