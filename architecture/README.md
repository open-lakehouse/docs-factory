# Open Lakehouse — Architecture Model

A [LikeC4](https://likec4.dev) model (diagram-as-code) of the open-lakehouse
(`olai`) estate. The canonical, builder-agnostic source of *structural* fact:
what the pieces are and how they relate. Audience is platform architecture, not
source-level implementation.

## Modeling choices

- **Two layers.** A *logical* layer of abstract capabilities (catalog, query
  engine, table format, object storage) and a *deployment* layer of the concrete
  services that realize them. A deployment `service` `instanceOf`s the
  implementation it runs, or the capability it plays where no implementation is
  modeled. See [ADR-0003](./adr/ADR-0003-logical-abstract-deployment-concrete.md).
- **Concerns span the layers' subjects.** Governance, lineage, and observability
  are `concern`s, not capabilities: each `appliesTo` the asset kinds or
  capabilities it spans, and implementations realize them. The `concernMatrix`
  view shows them. See [ADR-0007](./adr/ADR-0007-cross-cutting-concerns.md).
- **The logical layer names no service, repo, or technology.** Those appear only
  in the deployment layer. The logical layer is the reference architecture; the
  deployment layer is one realization of it.
- **Trust is a property of the deployment, not of a component.** The same query
  engine is trusted inside the boundary (enforces FGAC in-plan) and untrusted
  deployed outside it (gets a vended credential, reads storage directly — FGAC
  bypassed). The model holds one reference deployment, `trustedCompute`; the
  untrusted cases are prose in [`design/deployments.md`](./design/deployments.md).
- **Maturity-honest.** Designed-but-not-built elements/edges carry `#designed`
  (or `#prototype`) and render amber. The tags are declared; the estate is not
  bulk-tagged yet — apply them when reconciling a repo, not as a sweep.
  Incomplete realization of something that *is* built uses `#partial` on
  `realizes` edges. Designed-only topology also lives in prose
  (`design/governance.md`). Do not present designed work as built.
- **Catalog, instances, generated wiring.** Capabilities, concerns, and asset
  kinds are technology-neutral. The technology catalog identifies
  specifications and software implementations, including first-party
  software. Deployment instances are configured occurrences. Generated
  environment wiring (`model/deployment/generated/`, tagged `#generated`)
  comes from a pinned Trestle plan; authored reference scenarios such as
  `trustedCompute` stay separately identified. Implementation and
  specification edges are architectural relationships, not release-specific
  proof of support.
- **Public by selection.** The docs sites publish only elements tagged
  `#public` (concepts.json, JSON-LD, `model:` links), and an edge only when both
  ends are. Tag an element when a reader-facing page cites it or a docs
  environment runs it; a ready page citing an untagged element doesn't publish
  it (`docsnip check` reports the citation). Keep governance facets, internal
  services, and people untagged unless a page needs them.
- **Ref-free.** Names and edges only — never a commit SHA or release tag.
- **One model, many views.** Names and relationships are defined once and
  rendered through views. The `.likec4` files are the source of truth; `dist/` is
  generated.

Narrative (the "why", framing, naming) lives in [`blogs/`](../blogs/) (`STORYLINE.md`
and the drafts) and references this model; decisions about the docs factory itself
live in [`docs/`](../docs/README.md). If it's a fact about how the software is
*structured*, it lives here. See [ADR-0002](./adr/ADR-0002-facts-here-narrative-separate.md).

## Layout

The `model/` files are grouped by layer. `specification.likec4` (the shared
vocabulary) and `globals.likec4` stay at the root because they apply to every
layer; everything else lives under `logical/`, `deployment/`, or `views/`. LikeC4
discovers `**/*.likec4` recursively, so the folders are organization only — the
model is the union of all files regardless of location.

```
architecture/
  model/
    specification.likec4        # SHARED: element/deploymentNode/relationship kinds, tags
    globals.likec4              # SHARED: predicate groups reused across views
    logical/
      capabilities.likec4       # abstract reference: people + capabilities + concerns
      concerns.likec4           # what each concern appliesTo
      technology-catalog.likec4 # concrete tech: specs + implementations (still logical)
      assets.likec4             # governed asset kinds (securables) + dependsOn/governs
      relationships.likec4      # capability chain + specifies/implements/realizes/vends/reads
    deployment/
      deployments.likec4        # trustedCompute: services instanceOf implementations/capabilities
      generated/                # one fragment per Trestle-rendered docs environment (`docsnip envs --fix`)
    views/
      logical-views.likec4      # logical views
      deployment-views.likec4   # one view per deployment environment
      blog-views.likec4         # blog-specific preview views (not the reference model)
  design/                       # architecture-focused prose (designDoc targets)
  adr/                          # architecture decision records
  estate.yml                   # ref-free repo facts
  glossary.md                  # canonical terminology
  conflicts.md                 # open-questions register
  integrations/trestle.yaml     # Trestle role -> capability/concern contribution (full|partial)
  dist/                         # generated: model.json, trestle-catalog.json, trestle-context.json
```

## Commands

Run from the repo root via `just` (recipes shell into `architecture/`):

```bash
just arch-dev       # interactive dev server (http://localhost:5173)
just arch-check     # validate syntax + semantics
just arch-model     # export dist/model.json
just arch-build     # build the static site into dist/static
just arch-refresh   # check + model + build — run after any model edit
just trestle-catalog  # snapshot the pinned Trestle's modules, refresh the context, check the join
```

## Update process

1. Decide which **layer** the change touches, then edit the owning file (logical
   capability or concern → `logical/capabilities`; concern `appliesTo` edge → `logical/concerns`; spec/implementation → `logical/technology-catalog`;
   asset kind → `logical/assets`; cross-capability edge → `logical/relationships`;
   service/environment → `deployment/deployments`; kinds/tags → `specification`; views →
   `views/logical-views`/`views/deployment-views`/`views/flows`).
2. Make the minimal change. Never add a service/repo/technology name to a logical
   file. Stay ref-free. Tag designed-but-not-built work `#designed`/`#prototype`
   when you have source-repo evidence; do not bulk-tag. Use `#partial` on
   incomplete `realizes` edges.
3. Run `just arch-refresh`; commit the `.likec4` sources, `dist/model.json`, and
   `dist/trestle-context.json` (refreshed by `arch-model`) together.

The [`/update-architecture`](../.claude/skills/update-architecture/SKILL.md)
skill automates the traversal across sibling repos and proposes the patches.
