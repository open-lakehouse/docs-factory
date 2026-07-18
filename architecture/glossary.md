# Estate glossary

_Canonical term definitions so naming stays consistent across posts, talks, and
docs. When a term's canonical phrasing is contested, the entry points to
[conflicts.md](./conflicts.md) rather than guessing._

## Initiative & estate

- **olai / open lakehouse (and ai)** — the initiative and GitHub org
  (`github.com/open-lakehouse`) spanning the five repos; also the published
  crate-name prefix (`olai-*`).
- **the estate** — the five sibling repos as one system: trestle, mangrove,
  headwaters, breakwater, hydrofoil. The subject of [estate.yml](./estate.yml).
- **lakehouse** — an architecture that serves warehouse-style governance and
  query over open table formats on object storage, rather than a closed warehouse.
- **the planes** — the estate's three governed-platform surfaces: the **catalog
  plane** (mangrove), the **lineage plane** (headwaters), the **policy plane**
  (breakwater). Compute (DataFusion) is the shared core beneath them; hydrofoil is
  the consumer above them.
- **catalog-native query engine** — a query engine that resolves tables through a
  catalog (Unity Catalog) rather than raw paths, so credentials, policy, and
  lineage attach at resolution time. This is hydrofoil's shape.

## Naming conventions

- **`olai-*`** — trestle's published crates (`olai-store`, `olai-http`, …).
- **`olai-uc-*`** — mangrove's published crates (`olai-uc-common`, `olai-uc-client`,
  …).
- **defensive publish shell** — the `olai-*` / `olai-uc-*` prefixes are a
  deliberately-namespaced **publish-time shell**, not the identity of the code. Via
  Cargo `package =` aliases, the **call sites use the aspirational, eventual-official
  identifiers** (e.g. `unitycatalog-common` → `use unitycatalog_common::…`) while the
  crate is *published* as `olai-uc-common`. The point is to **avoid polluting the
  official/community namespaces** before consensus while the codebase already reads as
  — and converges toward — what the eventual official crates would look like. So the
  `olai-*` *prefix* is what's provisional; the names the code reads in are the target.
- **prose naming rule** — because the published prefix is the provisional part, prose
  uses **role-descriptive names** ("the catalog client crate", "trestle's store
  crate"); literal crate names — either the aspirational or the published form —
  appear only in code blocks.
- **two-name CLI pattern** — a service ships a client binary and a server binary
  under short paired names: `trestle`; `uc` + `uc-server`; `hw` + `headwaters`.

## Mangrove-specific terms

_(The corrected framing — mangrove is a framework, not a reimplementation; see
[storyline.md](./storyline.md) and [`mangrove-framing`] memory.)_

- **mangrove (name that leads)** — in prose, **`mangrove` is the name that leads** for
  this thing, introduced as "a pluggable framework for building and integrating with
  UC". The other two names are secondary: **`unitycatalog-rs`** is the project name and
  **`olai-uc-*`** are the published crates.
- **pluggable UC framework** — the correct one-liner for mangrove: a framework for
  *building* UC APIs and *integrating* with UC. **Not** "Unity Catalog reimplemented
  in Rust", **not** a UC OSS competitor.
- **proxying** — a mangrove UC server routing some securables to an **upstream OSS
  Java UC** while **managing others itself**; the payoff of pluggability.
- **exploratory / fewer guarantees** — mangrove's deliberate trade-off: it moves
  ahead of official UC OSS but promises less. Always state the trade-off when
  positioning it.
- **augmentation** — adding UC/Open-Sharing surfaces UC OSS doesn't have yet. The
  flagship example — exposing Open Sharing **"agent skills" as a resource type** — is
  **built today** and may be asserted as real (still pin + re-verify per §6 at draft).
- **Delta Sharing / Open Sharing** — the sharing-protocol servers within mangrove's
  scope, alongside the catalog APIs.
- **Delta API ↔ Lakekeeper** — mangrove's UC Delta v1 REST API also feeds
  Lakekeeper; this connection is where the `mangrove` image association comes from.

## Cross-estate patterns

_(Opinionated seams that recur across repos; each repo *applies* them. See the
"Cross-estate patterns" section of [storyline.md](./storyline.md) and the `patterns:`
block in [estate.yml](./estate.yml).)_

- **composition** — the estate's core stance: assemble independently-built pieces
  into one consolidated whole rather than fuse a monolith. Established via Trestle's
  seams (narrow port traits, a `Provides*` compile-time DI pattern, `Arc<dyn Trait>`
  boundaries); hydrofoil composes services + DataFusion integrations into one session.
- **composable / headless UI** — the UI counterpart to composition: reusable,
  ideally **headless** components with **pluggable seams**, wrapped by a thin
  per-service app; the same set composes into one consolidated experience (hydrofoil).
- **shadcn** — the agentic-optimized component framework the estate embraces;
  presentational components distributed **by copy**, logic behind a design-token
  contract. Followed in headwaters + mangrove today.
- **`design.md`** — the machine-readable design-token contract file (per the
  [official convention](https://github.com/google-labs-code/design.md)) that fixes
  semantic token *names and meanings*, not a concrete look. It teaches agents how to
  use the headless components correctly and informs design decisions when apps are
  built from them. Present in mangrove (`node/ui-kit/DESIGN.md`) and hydrofoil
  (`node/ui/DESIGN.md`). A proof point of the estate's agentic stance.
- **headless (component/app)** — a component that ships behavior + structure but not
  a fixed presentation, so each app supplies its own look via the token contract.
- **pluggable seam** — a defined extension point (a trait, a slot, a token contract)
  where functionality or presentation is swapped in without editing the core.
- **agentic-optimized CLI** — a CLI's second register (alongside the classical,
  endpoint-mirroring one): output formatted for agent digestion and the surface
  reframed as actionable, task-shaped verbs. Headwaters' `hw` is the lead application.
- **question-verb** — a task-shaped CLI command that answers one recurring
  investigative question by composing several backend calls and returning the
  interpreted *answer* (not a raw endpoint dump); the altitude between one command
  per endpoint and one per scenario (headwaters ADR-0014).
- **agent envelope** — an interpreted CLI output mode (vs `table`/`json`) that
  prunes noise, leads with the `"question"`, and appends `_next` runnable follow-up
  hints so the tool walks an agent through an investigation.
- **Omnigent** — Databricks' agentic meta-harness; a natural downstream consumer of
  the estate's agentic-optimized CLIs (parked blog idea — verify its public status
  before drafting).

## Cross-cutting concepts

- **asset kind ↔ securable** — the vendor-neutral name (`asset` in the logical
  model) for a *kind* of governed subject on the data & AI value chain: table,
  volume, function, model, agent skill, schema. **Securable** is Unity Catalog's
  term for the same concept. Type-level only — a specific table is an *instance*
  (runtime/deployment), never a logical element. The breadth of asset kinds a
  catalog governs (UC: the full data & AI set; Iceberg REST: tables) is a
  structural property of the model. See
  [design/asset-kinds.md](./design/asset-kinds.md) and
  [ADR-0006](./adr/ADR-0006-governed-asset-kinds.md).
- **credential vending** — the catalog issues short-lived, scoped storage
  credentials at resolution time instead of clients holding long-lived keys; the
  safe-by-default storage path.
- **FGAC (fine-grained access control)** — row-level filters and column masks (plus
  the allow/deny decision), as opposed to coarse table-level grants.
- **decide / enforce split** — breakwater's separation of the policy *decision*
  (engine-neutral core; can this principal do this?) from the *enforcement*
  (rewriting the DataFusion plan to apply filters/masks).
- **plug in, don't fork** — the estate's stance of enforcing policy and capturing
  lineage *on* DataFusion via its extension points, without maintaining an engine
  fork.
- **lineage (OpenLineage, column-level)** — capturing dataset- and column-level
  provenance as OpenLineage events; headwaters emits these at DataFusion planning
  time.
- **planning-time capture** — instrumenting the query *plan* (not execution) so
  lineage/policy attach before the query runs.

## Foundations (external OSS)

- **DataFusion** — Apache DataFusion, the shared query engine.
- **Delta** — Delta Lake table format (via `delta-rs` / `delta-kernel-rs`; the
  estate currently uses some personal forks — disclose per CONVENTIONS.md §6).
- **Cedar** — AWS Cedar policy language, breakwater's decision engine.
- **OpenLineage / Marquez** — the lineage event standard and its reference server;
  headwaters is inspired by, not a drop-in for, Marquez.
- **Unity Catalog (UC) / UC OSS** — the governance API surface; "UC OSS" is the
  official (Java) open-source implementation that mangrove integrates with and
  explores ahead of — not competes with.
