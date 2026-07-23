# ADR-0006: System boundary semantics and generic relationships

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-21 |
| Supersedes | — |
| Superseded by | — |

## Context

Reviewing the logical model as it matures surfaced three questions that turned
out to be one knot.

1. **The root `lakehouse` node is overloaded.** It is a `capability` element, but
   it simultaneously plays three roles: (a) a genuine capability with its own
   description and link; (b) the namespace/container that `catalog`,
   `queryEngine`, `governance`, and the asset kinds nest under
   (`lakehouse.catalog`, `lakehouse.schema`); and (c) an implied *system boundary*
   — `platformEngineer -[flows]-> lakehouse "builds + operates"` treats it as the
   whole estate. Note the model is already not "all lakehouse": specifications and
   implementations (`deltaSpec`, `datafusion`, …) are **top-level siblings** of
   `lakehouse`, not children of it.

2. **`partOf` is modelled only via hierarchy, and hierarchy carries two
   meanings.** Nesting `lakehouse → catalog` reads as capability *composition*;
   nesting under `lakehouse` was also the intuitive home for asset kinds, whose
   relationship to the platform is *belonging / governed-by*, not composition. A
   single nesting mechanism cannot encode both cleanly.

3. **Generic relationships are missing.** The model has a rich set of *specific*
   edges (`resolves`, `vends`, `enforces`, `specifies`, `governs`, `requires`, …)
   but no generic `partOf`/`composedOf` or `dependsOn` — the coarse
   composition/dependency backbone that C4 and Backstage assume, and that lets an
   agent traversing `dist/model.json` reason about the graph at a coarse level
   before drilling into a specific kind.

Two industry references frame the boundary question. Classical **C4** uses
`SoftwareSystem → Container → Component`; **Backstage**'s software catalog uses
`Domain → System → Component → API/Resource`. Both give a first-class top-level
*system boundary*, which is precisely the (c) role `lakehouse` is playing
informally. But our logical layer is richer than either default hierarchy: it has
three axes — capability *verbs*, governed-asset *nouns* (ADR-0005), and the
zero-trust governance-role decomposition. Flattening those to fit
SoftwareSystem→Container→Component would lose the very structure that makes the
model useful for the docs site.

## Considered Options

**The boundary (Q1/Q2):**

- **Introduce a first-class `system` element kind** — textbook C4/Backstage; most
  legible to a Backstage user. Rejected: a real migration touching every view's
  `include lakehouse.*` and every `lakehouse.*` reference, and it risks a second
  container that exists "just because C4 has one" while our three axes stay the
  actual load-bearing structure.
- **Flatten — drop the root container** — let capabilities/assets/specs sit at top
  level. Rejected: loses the boundary that C4/Backstage/agents rely on and the
  `platformEngineer -> lakehouse` "one estate" semantics.
- **Keep `lakehouse` as the boundary, make its roles explicit (chosen)** — retain
  the element and its nesting, but state that it *is* the SoftwareSystem /
  System-Domain analog, and give composition and dependency real edges instead of
  overloading the tree.

**Generic edges (Q3):**

- **Keep specific-only** — rejected; hierarchy keeps silently carrying two `partOf`
  meanings and the coarse graph an agent needs isn't expressible.
- **Add generic `partOf` + `dependsOn` (chosen)** — a coarse backbone; the
  existing specific edges become *refinements* of `dependsOn`.

## Decision

**`lakehouse` stays as the boundary element** (no separate `system` kind, no
flattening). It is explicitly the C4 **SoftwareSystem** / Backstage
**System-Domain** analog for the estate; the `platformEngineer -[flows]->
lakehouse "builds + operates"` edge is the person→boundary relationship.

The two meanings that nesting was conflating are separated:
- **Capability composition** stays expressed by nesting (`lakehouse → catalog`),
  and is now nameable by the generic **`partOf`** edge where a tree edge does not
  already imply it.
- **Asset belonging** was never composition: it is carried by the existing
  **`requires`** edge (asset → capability, ADR-0005) — an asset kind is a
  governed *subject*, not a *part* of the platform.

Two generic relationship kinds are added:
- **`partOf`** — generic composition. Added **only where nesting does not already
  imply it** (cross-type composition, e.g. an implementation composed of another
  implementation), so containment is never rendered twice.
- **`dependsOn`** — generic dependency (dashed). The coarse fallback for a
  cross-type dependency with no specific edge. The specific edges
  (`resolves`, `reads`, `vends`, `consumes`, `enforces`) remain the primary
  rendering and are documented as *refinements* of `dependsOn`.

As a consequence, the one semantic leak is fixed: `polars -[consumes]-> deltaRs`
was an implementation→implementation edge misusing the spec-consumption kind
(`consumes` is impl→specification); it becomes `polars -[dependsOn]-> deltaRs`.

**`implementation` is affirmed unchanged.** It maps cleanly to the Backstage
**Component** (ADR-0004) and is not a stand-in for a system. The
implementation↔deployment-service distinction (`datafusion` the logical
implementation vs `hydrofoil` the deployed `service`) is intentional per
ADR-0003 and is retained.

## Consequences

### Positive
- The boundary role `lakehouse` was playing implicitly is now stated, without any
  view migration or new container element — the three-axis logical layer is
  untouched.
- The two `partOf` meanings are disentangled: composition is `partOf`/nesting;
  asset belonging is `requires`. Nesting no longer silently means two things.
- The generic `partOf`/`dependsOn` backbone gives agents a coarse graph to reason
  over, with specific edges as refinements — the coarse-then-specific traversal
  C4 and Backstage assume.
- The `polars → deltaRs` edge is now semantically correct (dependency, not
  spec-consumption).

### Negative / Trade-offs
- Two more relationship kinds to keep coherent; authors must pick `dependsOn` only
  when no specific edge fits, to avoid a second copy of every edge.
- `partOf` and nesting can express the same composition; the discipline "add
  `partOf` only where nesting doesn't already imply it" is a convention to hold,
  not something the tool enforces.
- A coarse "estate dependency graph" view built purely from `partOf`/`dependsOn`
  is deferred, not built here.
