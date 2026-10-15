---
title: The Governed Lakehouse
slug: governed-lakehouse
status: idea
tags: [lakehouse, governance, unity-catalog]
series: The Composable Lakehouse
series_order: 3
author: Robert Pack
---

**Thesis:** governance is a concern that applies to every brick, not a brick of
its own. Adding it means placing decision and enforcement points across the
stack you already have.

## Scope

- Identity at the edge: `auth` (authelia) in front of the gateway, so every
  request carries a principal.
- Policy as its own service: `policy` (opa) decides at the gateway; Cedar
  (breakwater) decides inside the engine. Name the PAP / PDP / PEP / PIP roles
  and show which service plays each.
- The catalog as the governance API: UC privileges and inheritance, plus
  credential vending (short-lived, scoped storage credentials issued at
  resolution time, so engines never hold standing keys).
- Be honest about limits: gateway authorization is not row/column enforcement.
  The model marks `auth` and `policy` as *partial* contributions to governance.
  Fine-grained access lives in planning (cross-link `cross-repo-abac`).

## Trestle configuration

- Previous stack + `authelia` (`auth`) + `opa` (`policy`).
- Demo: two principals, one allowed and one denied, the same query through the
  same gateway; then a vended credential's scope and expiry.

## Model hooks

- `lakehouse.governance` concern and its `appliesTo` edges; zero-trust
  decomposition in `architecture/design/governance.md`.
- `credentialIssuer` capability; `credential` / `externalLocation` asset kinds.

## Cross-links

- *Trust in your Open Lakehouse* (the why: three governance patterns, agents
  as principals); *Fine-grained access control is a cross-service contract*.
  This post is the configuration, those are the argument. Link, don't repeat.

## Open questions

- Does OSS UC with authorization enabled carry enough of the demo, or does it
  need the mangrove/breakwater path (and its pre-release disclosure)?

**Prev:** *The Composable Lakehouse* · **Next:** *The Observable Lakehouse*
