---
title: The Composable Lakehouse
slug: composable-lakehouse
status: idea
tags: [lakehouse, unity-catalog, codegen]
series: The Composable Lakehouse
series_order: 2
author: Robert Pack
---

**Thesis:** the smallest useful lakehouse is three roles (catalog, object
store, gateway). Because each role is defined separately from what fills it,
you can swap any brick without touching the others.

## Scope

- Roles vs. implementations: a service declares the role it fills
  (`data_catalog`, `object_store`, `gateway`). The implementation lives in
  catalog data, never in the framework's types.
- One platform surface: every service sits behind the gateway, and
  `address(from, to, …)` answers "what URL does X use to reach Y?" for callers
  in the same process, on the host, or in another container.
- Route intent instead of hand-written prefixes: modules declare `Api`,
  `UiPrefixable`, or `UiFixed`, and the planner assigns paths across all
  modules at once, so links can't break.
- Swapping a brick: rustfs ↔ aws-s3, in-stack postgres ↔ hosted postgres,
  H2 ↔ Postgres metadata. Same plan, different provider (one provider per role).
- Plan, then materialize: the plan is target-neutral and rendering is pure
  (it compiles to wasm32), so the same model can drive a CLI, a desktop app,
  or a docs page.

## Trestle configuration

- `unity-catalog` (`data_catalog`) + `rustfs` (`object_store`) + `envoy`
  (`gateway`); `postgres` optional (`relational_db`).
- Demo: `trestle env new`, create a catalog / schema / managed Delta table,
  read it back through the gateway.

## Model hooks

- Capabilities `lakehouse.catalog`, `lakehouse.objectStorage`,
  `lakehouse.tableFormat`; implementations `unityCatalogOSS`, `rustfs`, `envoy`.
- Role → capability mapping (`object_store` → objectStorage, `data_catalog` →
  catalog). Gateway and relational DB stay unmapped infrastructure, and that
  is deliberate.
- The logical vs. deployment view of the same stack (ADR-0003).

## Open questions

- Show the provider swap live (rustfs → aws-s3) or as a diff of the env file?
- How much `stack-topology` internals (route plan, `InjectedEnv`) before it
  stops being a lakehouse post and becomes a Trestle post?

**Prev:** *What is a Databrick?* · **Next:** *The Governed Lakehouse*
