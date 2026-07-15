---
title: Make the lakehouse UI composable — copy the visuals, package the logic
slug: headless-lakehouse-ui
status: brief
date: 2026-07-10
tags: [lakehouse, unity-catalog, data-lineage, ui-components]
series:
series_order:
author: Robert Pack
target: company blog
---

# Brief: Make the lakehouse UI composable — copy the visuals, package the logic

> Seeded from the **pre-release** UI work across three repos (mangrove's
> `@open-lakehouse/ui-kit` + `unity-catalog`, hydrofoil's portable-components
> strategy doc, headwaters' `lineage-ui`) — all consumed via unpublished `file:`
> links "during the current evaluation phase". Internal docs are unlisted leads;
> the post re-anchors on the **public** pattern: the `design.md` token-contract
> convention (`github.com/google-labs-code/design.md`) and shadcn/Radix (§6). The
> story is the *pattern*, not the private components.

## 1. Hook / thesis

The composable lakehouse shouldn't stop at the backend. Make the **UI itself
composable** by splitting distribution along the grain of what changes: ship
presentational components **by copy** (shadcn-style — fork and restyle them) and
data-fetching logic **by versioned package** (a contract, not a look), with a
`design.md` token contract as the seam. Do that and one headless component set
serves three different apps — a UC server's own UI, a lineage service's UI, and a
unifying shell — with no per-host changes.

## 2. Audience

Front-end and full-stack engineers building data-tool UIs, and anyone who has
tried to "share components across apps" and watched it collapse into a coupled
mess. Comfortable with React, a component library (shadcn/Radix), and a
data-fetching layer (TanStack Query); do not assume they've thought about
*headless* distribution or a token contract — that's the payload.

## 3. Tone / voice

First person, opinionated on the split ("visuals want to be forked; logic wants a
version"). Practical, with the three-hosts-one-component result as the proof.
Standalone post; a candidate future *how-to* entry in the Casper arc once the
running example grows a UI.

## 4. Key takeaways

- The coupling that kills shared UI isn't the rendering layer — it's how the API
  **client is constructed**. Remove that one coupling (inject the client; don't
  import a module singleton) and the rest travels.
- **Distribute visuals by copy, logic by package**: presentational components are
  meant to be forked and restyled (ship shadcn-style, copy-in); data-fetching
  conventions are a contract (ship as a versioned package).
- **Headless with respect to theme**: components emit semantic tokens and own no
  color values; the host supplies the palette via a `design.md` token contract —
  one contract, three hosts.
- **Own the client where the spec lives**: generate the wire client from the proto
  in the repo that owns the proto; everyone else consumes it as an artifact.

## 5. Outline

1. **Three apps, one component, no changes** (intro) — the result first: the same
   catalog/lineage components running in three hosts, styled by each.
2. **Why shared UI usually fails** — the real coupling is client construction, not
   rendering.
3. **Headless first: inject the client** — a provider/hook seam
   (`use…Client`); the component decides nothing about the network. *(code sample)*
4. **Copy the visuals, package the logic** — the distribution split and why it
   matches how each kind of code changes.
5. **The token contract** — `design.md` semantic tokens; components own no
   palette; the host is the reference implementation. *(code sample)*
6. **Owning the client where the spec lives** — proto-generated client shipped
   from the server's repo; consumed everywhere else.

## 6. Source material

- *Public anchors (load-bearing):*
  - The **`design.md` convention** — `github.com/google-labs-code/design.md` (the
    token-contract pattern the UI kit follows).
  - **shadcn/ui** + **Radix** — the copy-in distribution model and headless
    primitives (public docs).
  - **TanStack Query / TanStack Router** — the data-fetching/logic layer (public).
- *Leads (internal / pre-release — do not quote as shipped):*
  - `hydrofoil · docs/portable-uc-components.md — the strategy: "distribute visuals
    by copy, logic by package"; invert the client from singleton to injected
    provider; auth as a seam.`
  - `mangrove · node/ui-kit/DESIGN.md — the design-token contract; "headless with
    respect to theme."`
  - `mangrove · node/unity-catalog/ + node/unity-catalog-client/ — the
    presentational/data split in practice.`
  - `headwaters · node/lineage-ui/README.md — the same pattern applied to lineage
    (late-binding transport seam, one barrel export).`
- *Prior art:* shadcn's copy-in philosophy (this post extends it from single
  components to a *data-tool feature set* with a client contract).

## 7. Call to action

Read the public `design.md` convention and shadcn's copy-in model; if you maintain
components across apps, try inverting your API client from a singleton to an
injected provider and see how much coupling disappears.

## 8. Publishing target / format

Company blog. Standalone. Code samples (the provider/hook seam, a token snippet)
must be public-anchored and runnable in isolation (a tiny React seam, not the real
packages) per the runnable-examples convention. A simple diagram of one component
against three hosts (D2) is the key asset.

## 9. Verification / accuracy notes

- **Status honesty (load-bearing, not a blocker):** the `@open-lakehouse/*`
  packages are **unpublished** (consumed via `file:` links during evaluation). That
  doesn't block the post — publish now and update as packages ship. Just don't imply
  they're installable today; teach the *pattern* with public tools (shadcn, the
  `design.md` convention, TanStack) and use the internal packages as a truthfully-
  labelled existence proof described at a high level.
- Verify the `design.md` convention link and its token-contract claims against the
  public repo before asserting them.
- If any code sample resembles the private packages, rewrite it as a minimal,
  self-contained public example.

## 10. Open questions / risks

- Can the three-hosts proof be shown without the private packages being public?
  Not a gate — publish at the pattern level now (public tools + a high-level
  existence proof), and add concrete shared-component demos in updates once a
  package is published.
- COI/disclosure: Databricks author, open-lakehouse project — disclose per target.
