# ADR-0005: Governed asset kinds (securables) as a logical dimension

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-18 |
| Supersedes | — |
| Superseded by | — |

## Context

The logical layer modeled the *verbs* of the lakehouse — capabilities, typed by
altitude into capability / specification / implementation
([ADR-0004](./ADR-0004-capability-specification-implementation.md)) — plus the
zero-trust governance-role decomposition. It did **not** model the *nouns*: the
kinds of thing the platform actually governs. Those existed only as prose (the
catalog "governs tables, schemas, and credentials") or in the glossary ("agent
skills as a resource type").

That gap matters because the estate's strongest catalog story is about **breadth
of governed subjects**, not verbs. Unity Catalog organizes the data & AI estate
as **securables** — tables, volumes, functions, models, and (emerging) agent
skills — and governs them uniformly. Table-format-centric catalogs (the Iceberg
REST catalog) govern tables. With no element for "kind of governed thing", that
contrast could only be asserted in prose, never shown as a property of the model —
and the question "can a platform manage *this* kind of asset?" had no structural
answer.

## Considered Options

- **Leave asset kinds implicit** — keep them as prose on the catalog capability.
  Zero new vocabulary, but the breadth differentiator stays unmodeled and the
  capability-coverage question is unanswerable structurally.
- **Encode coverage as tags on the catalog specs** — e.g. tag `ucSpec`
  `#governs-models`. Cheap, but tags can't carry relationships, per-kind
  descriptions, or the `requires` edges to capabilities; it does not scale.
- **Model asset instances** — represent actual tables/models. Rejected: instances
  are user-created and runtime, which belongs to the deployment world per
  [ADR-0003](./ADR-0003-logical-abstract-deployment-concrete.md), not the logical
  reference model.
- **A new type-level `asset` element kind (chosen)** — add the governed asset
  *kind* as a first-class logical element on a new "subject" axis, with two edges:
  `requires` (asset → capability) and `governs` (catalog spec → asset).

## Decision

We add a third logical dimension — the **subject axis** — via a new element kind
`asset`, a technology-agnostic, **type-level** governed asset kind. Unity
Catalog's term for the same concept is a **securable**; the logical layer uses the
vendor-neutral `asset` (the glossary records the mapping) so the differentiator
stays a structural fact rather than a vendor label.

First-pass kinds (children of `lakehouse`): schema, table, volume, function,
model, agent skill. Two relationship kinds connect the axis:

- **`requires`** (asset → capability) — what a platform must be able to do to
  manage the kind. Every kind requires the `catalog`; domain capabilities
  materialize each kind (table → table format + query engine; volume → object
  storage; model → model tracking).
- **`governs`** (catalog specification → asset) — which kinds a concrete catalog
  contract covers. `ucSpec` governs the full set; `icebergRestSpec` governs
  namespaces + tables. The breadth gap is now visible in the graph.

Instances remain out of scope (deployment/runtime, per ADR-0003). Maturity is
honest: kinds are untagged; a `governs` edge carries `#designed` where coverage
is not yet real.

## Consequences

### Positive
- The catalog-breadth differentiator (data & AI securables vs table-only) is a
  structural property of the model, renderable in the `assetGovernanceBreadth`
  view — no marketing prose required.
- "Can this platform manage asset kind X?" has a structural answer via the
  `requires` edges (the `assetCapabilities` view).
- Specifications gain a second first-class relationship (`governs`) alongside
  `specifies`, reinforcing them as the stable, documented anchors of the model.

### Negative / Trade-offs
- A new element kind and two edges to keep coherent; existing capability views
  must exclude `element.kind == asset` to stay focused.
- The first-pass asset set is deliberately shallow and grows over time rather than
  being exhaustive today.
- Agent skills surfaced a genuinely new capability — **Sharing** (specified by Open
  Sharing) — which was added alongside this pass so `agentSkill -[requires]->
  sharing` completes the picture; a wider sharing/distribution decomposition (e.g.
  recipients, shares) remains future work.
