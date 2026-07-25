---
title: Fine-grained access control is a cross-service contract
slug: cross-repo-abac
status: draft
date: 2026-07-10
tags: [governance, unity-catalog, datafusion, lakehouse, rust]
series: Building the Open Lakehouse
series_order: 2
author: Robert Pack
target: openlakehouse
---

# Brief: Fine-grained access control is a cross-service contract

> The design/thought-leadership follow-on to `trust-in-your-open-lakehouse` (that
> post argues governance belongs at the platform level; this one shows what the
> platform-level contract *looks like* end to end). Seeded from hydrofoil's
> **pre-release** governance docs and code (mangrove's experimental `/policies`
> endpoint; hydrofoil's feature-gated Cedar Layer-2; the neutral engine lives in
> the unreleased `breakwater` crate). Internal docs are unlisted leads; the post
> re-anchors on the **public** Databricks Policies API, the UC ManagedTablesSpec,
> Cedar, and NIST SP 800-207 (§6).

## 1. Hook / thesis

Fine-grained access control in an open lakehouse isn't a feature of one box — it's
a **contract between services**: the catalog *authors and serves* policies, the
query service *resolves* them per table at the moment it opens the data, and a
neutral policy engine *enforces* row filters and column masks by rewriting the
query plan — all without forking the query engine. Governance is answered by the
seams between components, not by any single component owning it.

## 2. Audience

Data-platform architects and senior engineers who read the foundation post and
want the concrete mechanics: how policy travels from catalog to engine, where
enforcement actually hooks in, and why row/column governance can ride on an
existing engine's extension points. Assumes the PIP/PDP/PEP vocabulary from post 1
(link it); assumes DataFusion familiarity at the "logical plan / physical plan"
level.

## 3. Tone / voice

First person, architect-to-architect, opinionated — the *why-it's-designed-this-way*
register of the Trust arc. Argues the "plug in, don't fork" stance and the
two-layer (coarse gate + fine-grained governance) split as principled, not
incidental. Where post 1 argued the thesis, this one defends a specific
architecture for it. Cross-link the Casper how-to counterpart if/when one exists
(don't duplicate its runnable steps here).

## 4. Key takeaways

- Two different questions per query — **access** (may this principal touch the
  table at all?) and **data governance** (which rows/columns are visible?) — want
  two different layers, evaluated at different points in planning.
- Policy authored once in a policy language (Cedar) can be enforced by evaluating
  its **partial-evaluation residuals natively** as plan rewrites — no separate CEL
  IR to carry, no fork of the engine.
- The catalog is the right place to *author and serve* policy (a Databricks-style
  Policies API bound to principals + governed tags, with server-side inheritance);
  the engine is the right place to *enforce* it — the contract between them is the
  design.
- Enforcement belongs at **table resolution** (where the principal and the table
  are both known), with the planner tier as a fail-closed backstop.

## 5. Outline

1. **Two questions every query asks** (intro) — access vs. data governance;
   answer-first framing; where each is decided.
2. **Author and serve policy in the catalog** — a Databricks-style `/policies`
   API: row-filter/column-mask policies bound to principals + governed tags, with
   server-side inheritance up the securable chain.
3. **Resolve policy at the table, not the plan** — the query service fetches
   per-table bindings at resolution and maps them to a neutral policy shape.
4. **Enforce without forking** — a two-layer model: a coarse allow/deny gate, then
   Cedar partial-eval residuals injected as row `Filter`s and column-mask
   `Projection`s at a pre-optimize plan rewrite. *(diagram)*
5. **Why this is a platform contract** — tie back to post 1: the governance lives
   in the seams (catalog↔engine↔policy engine), which is exactly why it's a
   platform responsibility.

## 6. Source material

- *Public anchors (load-bearing):*
  - **Databricks Policies API** — the public API the catalog side mirrors
    (`https://docs.databricks.com/api/workspace/policies`); row-filter/column-mask
    policies, principals, governed tags.
  - **UC ManagedTablesSpec / UC governance surface** — public UC docs for the
    catalog role (pin the spec ref).
  - **Cedar** — the policy language + partial evaluation (public docs/spec).
  - **NIST SP 800-207** Zero Trust Architecture (PIP/PDP/PEP) — reused from post 1.
- *Leads (internal / pre-release — do not quote as shipped):*
  - `hydrofoil · docs/policy-enforcement-design.md — the two-layer design, "plug
    in don't fork", the Cedar-residual-vs-CEL decision.`
  - `hydrofoil · crates/hydrofoil/src/catalog/policies.rs (UnityPolicyBindingProvider),
    docs/handover-uc-policy-wiring.md, docs/handover-resolver-governance.md — the
    resolution-time wiring.`
  - `mangrove · /policies endpoint (crates/server/src/api/policies.rs) — the
    catalog-side implementation.`
  - `breakwater · Governance / AbacPolicyEngine (unreleased crate) — the neutral
    engine; do not present as available.`
  - `github.com/open-lakehouse/policast — public prior-art (Cedar→CEL, Spark +
    DataFusion enforcement) the design evaluates. This one IS public — usable as an
    anchor, not just a lead.`
- *Prior art / what this responds to:* continues the argument in
  `trust-in-your-open-lakehouse`; contrasts with the catalog-centric governance
  model that post named.

## 7. Call to action

Read the foundation post (post 1); read the public **policast** demonstration of
Cedar→enforcement across engines; if evaluating governance for your own lakehouse,
map your stack onto the author/serve/resolve/enforce contract.

## 8. Publishing target / format

openlakehouse. Post 2 of **Building the Open Lakehouse** (`SERIES.md`) — open with
a one-line "where this fits / previously" and link post 1; must stand alone.
Design-doc register: a plan-rewrite architecture diagram (D2) is the key asset;
code excerpts are illustrative and must be public-anchored (Cedar, DataFusion
extension points), not pasted from the pre-release crates.

## 9. Verification / accuracy notes

- **Status honesty (load-bearing, not a blocker):** the neutral engine
  (`breakwater`), the hydrofoil Layer-2 path, and mangrove's `/policies` are all
  **pre-release / feature-gated**. That doesn't block the post — we publish as we
  build and update as it lands. Lead with the *contract and the pattern* (which are
  stable even while the crates move); describe the specific crates truthfully as
  pre-release rather than as shipping products; keep raw internal file paths /
  handover-doc specifics out of the prose. `policast` is public and may be cited
  directly.
- Verify the Databricks Policies API field semantics against the public docs
  before asserting them; keep field naming faithful to the public API.
- Confirm the DataFusion extension seams named (pre-optimize plan rewrite in
  `create_physical_plan`, provider wrapping) are describable from public DataFusion
  docs.
- Note the documented limitation honestly (column masking is per-table, not
  per-principal at column level, and fail-closed) — don't overstate the capability.

## 10. Open questions / risks

- Series landing: post 1's §10 left open whether the arc leads toward cross-catalog
  governance or an ABAC deep-dive. This post is the ABAC deep-dive — confirm that
  matches the arc's intended order and that post 1's CTA tees it up.
- How much of the *specific* architecture is worth showing while `breakwater` /
  hydrofoil Layer-2 are still pre-release? Not a gate — publish at the
  contract/pattern altitude now (it's the durable part), disclose the pre-release
  status, and deepen the implementation detail in updates as the crates ship.
