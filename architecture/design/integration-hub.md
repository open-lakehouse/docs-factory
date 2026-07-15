# Integration hub — hydrofoil

**Repo:** `open-lakehouse/hydrofoil`. In the olai-native deployment hydrofoil
realizes several logical roles at once: **query engine** + embedded **PDP** +
engine **PEP** (with breakwater embedded as a library). It is the trusted-compute
engine that enforces full FGAC in-plan — see [`deployments.md`](./deployments.md)
and [`governance.md`](./governance.md).

hydrofoil is the **integration hub — the consumer that composes all four siblings
back together** into one running lakehouse. It is a **catalog-native query engine**
(Flight SQL + HTTP/ConnectRPC) that reads open table formats through Unity Catalog
with policy and lineage wired in, plus a Tauri desktop app and React UIs.

> **Pre-release honesty.** hydrofoil depends on personal forks (`roeap/delta-rs`,
> a delta-kernel fork) and unpublished application crates. The README's "Open
> Lakehouse Lab" label and the "Open Lakehouse" desktop app are its *demonstrable
> face* — never present it as a shipped/stable product.

## Where everything comes together

hydrofoil is where the generator, the three planes, and the OSS foundations become
one lakehouse:

- reads open table formats (**Delta**) through the **catalog plane** (mangrove's
  `olai-uc-datafusion`), getting vended credentials at resolution time;
- enforces the **policy plane** (breakwater's `olai-datafusion-policy*`) by
  rewriting the plan;
- captures the **lineage plane** (headwaters' `datafusion-openlineage`) at
  planning time;
- all inside one **composed query session** (the `session` exemplar component) —
  the culmination of the composition pattern (services + multiple DataFusion
  integrations fused into a single `SessionContext`).

Its composable UI components likewise compose into one consolidated experience —
the counterpart to service composition. See [`patterns.md`](./patterns.md).

## What it publishes

Unpublished application layer consuming the published `olai-*` libraries:
`hydrofoil` (query engine bin + GHCR image), `portal` (Tags + Files ConnectRPC
services), `desktop-host` / `open-lakehouse-desktop` (Tauri v2 app), and
`@open-lakehouse/ui` (React web UI).

## Orientation

- `crates/hydrofoil/` (the query engine + composed session)
- `crates/portal/` (platform services)
- `docs/policy-enforcement-design.md`, `docs/portable-uc-components.md`,
  `docs/open-lineage-design.md`, `docs/adr/`
