# The open-lakehouse storyline

_The single canonical narrative for the `olai` estate — the "why" a blog series,
talk, or docs site defers to. This is the **argument built over** the facts in
[`estate.yml`](./estate.yml); where the two disagree, the YAML wins and the prose
is fixed. It is opinionated and dated on purpose: it reconciles framing that
diverges across the repos, and that reconciliation is a decision, not a static fact._

**Last consolidated: 2026-07-13** (structured interview resolved all seven open
conflicts; see [conflicts.md](./conflicts.md) → Resolved).

## The through-line

An open lakehouse is **assembled, not bought**. The foundations are open source —
**DataFusion** for compute, **Delta** for the table format, **Cedar** for policy,
**OpenLineage** for lineage, **Unity Catalog** for the governance API surface. What
the `olai` estate adds is the connective tissue those foundations don't ship: a way
to **build services fast enough to explore** the space, and the **catalog, lineage,
and policy planes** that turn a query engine into a governed platform.

That gives the estate a clean shape:

```
  OSS foundations  (DataFusion · Delta · Cedar · OpenLineage · Unity Catalog)
        +
  Trestle          (how we build services fast — proto -> Rust codegen)
        ->
  catalog plane    lineage plane    policy plane
  (mangrove)       (headwaters)     (breakwater)
        ->
  hydrofoil        (the consumer that ties it all together into one lakehouse)
```

The dependency spine is literal: **trestle → {mangrove, headwaters, breakwater} →
hydrofoil**. Everything downstream is built with Trestle; hydrofoil consumes all
three planes.

## Cross-estate patterns

The estate is organized as repos, but its *identity* is a small set of opinionated
patterns that recur across them — each repo is an **application** of these, and
hydrofoil is where they culminate. (Both are **established and converging**: real in
the repos today, still settling — not a finished standard.)

**Composition.** The recurring shape is to **compose** independently-built pieces
into one consolidated whole rather than to fuse monoliths. Trestle establishes the
opinionated seams (narrow port traits, a `Provides*` compile-time DI pattern,
`Arc<dyn Trait>` boundaries), and hydrofoil is the exemplar: it composes services and
multiple DataFusion integrations into a **single consolidated session**. The same
stance runs through the catalog, lineage, and policy work — a piece is built to be
swapped or reused, not welded in.

**Composable, headless UI.** The UI is the same idea in a different medium. The estate
embraces **shadcn** (agentic-optimized) and builds reusable, ideally **headless** UI
apps/components with **pluggable seams**, then wraps a thin per-service app around
them — presentational components distributed by copy, data-fetching logic behind a
design-token / `design.md` contract, so one component set serves several apps
unchanged. **Headwaters and mangrove already follow this pattern today.** The aim,
mirroring service composition, is that those same components **compose into one
consolidated experience in hydrofoil** — that consolidation is the direction of
travel rather than a finished fact. This is the estate's opinionated UI stance and the
direct counterpart to the composition pattern above. A small extra proof point that we
embrace the agentic way of working: the token contract is written as a `design.md`
(per the [official convention](https://github.com/google-labs-code/design.md)) — a
machine-readable file that teaches agents how to use the components and, in turn,
informs the design decisions when we build actual apps from them.

**Agentic-optimized CLIs.** The estate's CLIs come in two registers. The classical
one mirrors the API endpoints; the second is **optimized for agentic use** — output
formatted for an agent to digest, and the surface reframed as actionable, task-shaped
**question-verbs** that return the *answer* rather than dumping an endpoint. This is
where "open lakehouse **and AI**" is real effort, not a slogan: we are deliberately
making the lakehouse usable *by* agents, following Anthropic and agent-tooling best
practices (a multi-mode render with an interpreted `agent` envelope, `_next` follow-up
hints, a `schema` capabilities primer, structured errors, stable exit codes).
Headwaters' `hw` is the **lead application** and the strongest proof today (recorded in
its ADR-0014); the other CLIs (`uc`/`uc-server`, the Trestle CLI) are still mostly
endpoint-mirroring, so this pattern is **emerging** rather than estate-wide. It pairs
naturally with an agent harness such as Databricks **Omnigent** — a parked blog idea
in [`../blogs/IDEAS.md`](../blogs/IDEAS.md).

Individual posts pick *one* application of a pattern (e.g. the composable-UI post
builds the headless component story; a service-composition post builds the DI seam;
an agentic-CLI post builds the `hw` question-verbs); the pattern itself is the
through-line they share.

## Why we build the pieces we build

**Trestle — the generator.** The estate is exploratory: we want to try a service,
a resource type, or an API surface and see it run before committing. Trestle makes
that cheap — annotate a `.proto`, run one command, get Axum handlers, typed clients,
language bindings, and a resource registry. It is the reason the rest of the estate
can move quickly, and it is the root of the spine: no sibling depends on anything
else, but every sibling depends on Trestle. Its runtime libraries (`olai-store`,
`olai-http`) are reused directly downstream, so Trestle is both the build-time tool
and part of the running stack.

**Mangrove — the catalog plane.** **Mangrove** (the name that leads; `unitycatalog-rs`
is the project, `olai-uc-*` the crates) is a **pluggable framework for building
Unity Catalog APIs and integrating with UC** — it is **not** a competing
reimplementation of Unity Catalog, and framing it as "UC in Rust" is actively
misleading. Its value is threefold: it uses generic resource APIs plus Trestle
codegen to stand up UC surfaces fast and **explore functionality ahead of the
official Java UC OSS**; its pluggability lets a server **proxy to an upstream OSS
Java UC** for supported securables while **managing others itself**; and it can
**augment surfaces UC doesn't cover yet** — for example exposing Open Sharing
"agent skills" as a resource type that isn't in UC OSS (this augmentation is **built
today**, not forward-looking). Its scope is broader than
the catalog too: Delta Sharing / Open Sharing servers and the Delta API (which also
feeds Lakekeeper — the origin of the `mangrove` image connection). The explicit
trade-off is that mangrove **moves faster but makes fewer guarantees** than UC OSS.
Distinct from that exploratory surface, one piece we explicitly **want to mature** is
the **DataFusion ecosystem-integration / client** against UC for the Rust ecosystem —
a keep-it, harden-it goal, not a throwaway prototype. Mangrove is also a home of the
estate's composable-UI pattern (its reusable UC components).

**Headwaters — the lineage plane.** Once data moves through a query engine, the
platform question becomes "where did this come from, and where does it flow?"
Headwaters answers it by emitting **column-level OpenLineage at planning time** from
DataFusion and ingesting those events into a queryable store with a read API.
Notably it also carries an **agent-facing CLI** of task-shaped question-verbs (the
PII / right-to-erasure data-map), which is where lineage stops being a dashboard and
starts being an answer.

**Breakwater — the policy plane.** Fine-grained access control is a cross-service
contract, and breakwater is the enforcement half: **Cedar policy wired into
DataFusion**, split into an engine-neutral decide/enforce core and a Cedar adapter.
The design thesis is **"plug in, don't fork"** — row filters and column masks ride
on DataFusion without forking the engine. Breakwater was extracted out of hydrofoil,
which is why its ADRs still live in the hydrofoil repo.

The policy story is **told across both repos, split by register**: breakwater owns the
**design** story (the engine-neutral decide/enforce core and the "plug in, don't fork"
thesis), while hydrofoil owns the **how-to** story (that policy enforced in a running
host). A design post leads with breakwater; a how-to post leads with hydrofoil; the
two cross-link.

**Hydrofoil — the consumer.** Hydrofoil is where the generator, the three planes,
and the OSS foundations become **one running lakehouse**: a catalog-native query
engine (Flight SQL + HTTP/ConnectRPC) that reads open formats through UC with policy
and lineage wired in, plus a Tauri desktop app and React UIs. Its **canonical framing
is the integration hub** — the consumer that composes all four siblings back together.
The named "Open Lakehouse" desktop app is its **demonstrable face**, not the headline,
and — like the rest of hydrofoil — is **never presented as shipped or stable**: it
depends on personal forks (`roeap/delta-rs`, a delta-kernel fork) and unpublished app
crates (CONVENTIONS.md §6).

## Top-framing note

This storyline leads **architecture-first** ("assemble OSS + build the gaps"), with
**trust and governance as first-class threads** rather than the sole thesis —
matching the reframe already recorded in [`blogs/SERIES.md`](../blogs/SERIES.md)
(from the narrower "Trust in the Open Lakehouse" to "Building the Open Lakehouse").
This is the **confirmed top frame across the estate** (2026-07-13 interview), not just
the blog arc.

## Status & honesty (standing rule)

The estate is **pre-release**, and every post inherits this: hydrofoil depends on
personal forks (`roeap/*`) and unpublished app crates; mangrove is self-described "not
production-ready" and **moves faster but makes fewer guarantees** than UC OSS; several
crates are `publish = false` or otherwise blocked. **Describe what is real today and
disclose status** — never imply shipped/stable. This defers to
[`blogs/CONVENTIONS.md`](../blogs/CONVENTIONS.md) §6 (pre-release honesty) as the
operative rule; the per-repo status specifics live in [`estate.yml`](./estate.yml).
It is a standing constraint, not a per-post reminder to be re-litigated.

## How this file relates to the blog arcs

[`blogs/SERIES.md`](../blogs/SERIES.md) is the **blog-arc projection** of this
storyline: it decides which posts exist, in what order, and in which register
(design vs how-to). It defers to *this* file for the estate-level facts and framing;
this file does not track individual posts. When the two touch the same subject, the
arc links back here rather than restating the "why".
