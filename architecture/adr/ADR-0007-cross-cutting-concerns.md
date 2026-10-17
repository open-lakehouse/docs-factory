# ADR-0007: Cross-cutting concerns as their own element kind

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-16 |
| Supersedes | — |
| Superseded by | — |
| Amends | [ADR-0005](./ADR-0005-governed-asset-kinds.md), [ADR-0006](./ADR-0006-system-boundary-and-generic-relations.md) (the `requires` edge) |

## Context

[ADR-0004](./ADR-0004-capability-specification-implementation.md) typed the
logical layer as capability / specification / implementation, and
[ADR-0005](./ADR-0005-governed-asset-kinds.md) added asset kinds on a subject
axis. One `capability` kind still covers two different things:

- **Layers** that materialize assets: catalog, query engine, table format,
  file format, object storage. They form the read path
  `queryEngine → catalog → tableFormat → fileFormat → objectStorage`.
- **Properties** that span assets and layers: governance, lineage,
  observability. Lineage has no place in that read path. It applies to tables
  and models wherever they live. Governance applies to every asset kind, and
  observability watches running capabilities.

Treating both as capabilities blurs the capability map. It also gives Trestle's
roles (`lineage`, `tracing`, `policy`) nothing precise to map onto, and it
leaves journeys no way to say "this outcome needs lineage on a table".

Separately, ADR-0005 and ADR-0006 describe an asset → capability **`requires`**
edge. No `requires` relationship kind was ever declared; `assets.likec4` uses
the generic `dependsOn`.

## Considered Options

- **A tag on capability** (`#crossCutting`). No new vocabulary, but tags carry
  no relationships, and every view and validator has to special-case the tag.
- **A nested group** (`lakehouse.concerns.lineage`). Groups them visually, but
  changes every FQN, so it breaks `model:` links, `explains:`, and tags.
- **A separate `concern` element kind (chosen)**, with one spanning edge kind.

## Decision

Add an element kind **`concern`** for properties that span assets and
capabilities. The first members are `lakehouse.governance`, `lakehouse.lineage`,
and `lakehouse.observability`. `lakehouse.sharing` and
`lakehouse.credentialIssuer` stay capabilities: sharing has a contract
(`openSharingSpec`) and is a protocol surface, and the credential issuer is a
step in the vending chain.

A concern relates to what it spans through one relationship kind,
**`appliesTo`** (concern → asset or capability, dotted). The verb goes in the
edge title ("tracks lineage of", "secures", "observes"). One kind keeps the
validators simple. Implementations realize a concern the same way they realize
a capability (`realizes`).

The logical layer is then a triad: **assets** (what the platform manages),
**capabilities** (the layers that materialize them, with specifications as
contracts), and **concerns** (the properties that span both).

**IDs stay stable across a kind change.** A LikeC4 FQN comes from nesting, not
kind, so `lineage = concern "Lineage"` inside `lakehouse` is still
`lakehouse.lineage`. Every `model:` link, `explains:`, `references:`, tag
mapping, and `canonicals.yaml` entry stays intact. Only code that filters by
kind changes.

**Governance has facets.** No single component meets governance. A gateway
authenticates, a policy engine decides, a catalog holds grants, and row filters
and column masks need a trusted engine to enforce what the catalog defines.
So governance is a parent concern with nested **facets**, each itself a
`concern`:

- `lakehouse.governance.authentication` — who the principal is.
- `lakehouse.governance.authorization` — whether the principal may act on an
  asset (grants, privileges, policy decisions).
- `lakehouse.governance.fineGrainedAccess` — row filters and column masks.

Nesting keeps `lakehouse.governance` and every reference to it intact; only the
facets are new IDs. Audit is not a facet until something in the estate realizes
it.

**`#partial` marks a contribution, not a property of the software.** An
implementation `realizes` a facet; the edge carries `#partial` when that
implementation meets the facet only together with another contributor (the
catalog *defines* fine-grained policy, a trusted engine *enforces* it). Which
contributors are deployed together differs per architecture, so whether a facet
is fully met is a fact about an environment, checked over its deployed
instances, never read off one logical edge.

**Breadth stays on the specification.** Which asset kinds a catalog governs is
`<spec> -[governs]-> <asset>` (ADR-0005). An implementation inherits that
breadth through `implements`; release-specific gaps come from compatibility
claims, not from extra edges.

**Asset → capability is `dependsOn`.** The `requires` edge named in ADR-0005
and ADR-0006 is recorded here as `dependsOn` (ADR-0006's generic dependency),
which is what the model has always used. No `requires` kind is added.

## Consequences

### Positive
- The capability map shows only the read-path layers. Concerns render
  separately, with explicit edges to what they span.
- Trestle roles and journey requirements can target a concern without
  pretending it is a layer.
- No ID churn: content, tags, and sibling-repo references keep working.

### Negative / Trade-offs
- Every consumer that filters `kind == capability` (the page-worthy kinds in
  `content/vocab.json`, the explain lists, docsnip's anchor edges, the emit
  targets) loses governance, lineage, and observability until it is updated.
  The kind change and those updates land together.
- Facets add nesting that views and the explain nav must handle (a concern can
  contain concerns).
- `#partial` on its own says nothing about a deployment; the environment-level
  check that complementary contributors are present lands with generated
  environments (`docs/design/trestle-integration.md`).
- `appliesTo` titles are free text for now; a controlled verb list is an open
  question.
