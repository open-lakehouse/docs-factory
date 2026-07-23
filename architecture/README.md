# Open Lakehouse — Architecture Model

A [LikeC4](https://likec4.dev) model (diagram-as-code) of the open-lakehouse
(`olai`) estate. The canonical, builder-agnostic source of *structural* fact:
what the pieces are and how they relate. Audience is platform architecture, not
source-level implementation.

## Modeling choices

- **Two layers.** A *logical* layer of abstract capabilities (catalog, query
  engine, table format, object storage, lineage, governance) and a *deployment*
  layer of the concrete services that realize them. A deployment `service`
  `instanceOf`s the logical capabilities it plays; one service can play several.
  See [ADR-0003](./adr/ADR-0003-logical-abstract-deployment-concrete.md).
- **The logical layer names no service, repo, or technology.** Those appear only
  in the deployment layer. The logical layer is the reference architecture; the
  deployment layer is one realization of it.
- **Trust is a property of the deployment topology, not of a component.** The
  same query engine is trusted inside the boundary (enforces FGAC in-plan) and
  untrusted deployed outside it (gets a vended credential, reads storage
  directly — FGAC bypassed). The two deployment topologies make that explicit.
- **Maturity-honest.** Designed-but-not-built elements/edges carry `#designed`
  (or `#prototype`) and render amber, so the model never overstates what exists.
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
      capabilities.likec4       # abstract reference: people + capabilities
      technology-catalog.likec4 # concrete tech: specs + implementations (still logical)
      governance.likec4         # the zero-trust roles + their edges
      assets.likec4             # governed asset kinds (securables) + requires/governs
      relationships.likec4      # capability chain + specifies/implements/realizes/vends/reads
    deployment/
      deployments.likec4        # services instanceOf capabilities, per topology
    views/
      logical-views.likec4      # logical views
      deployment-views.likec4   # one view per deployment topology
      flows.likec4              # dynamic/sequence views
      explain-views.likec4      # per-element views for the site's /explain pages
      blog-views.likec4         # blog-specific preview views (not the reference model)
  design/                       # architecture-focused prose (canonicalDoc targets)
  adr/                          # architecture decision records
  canonicals.yaml              # capability/service -> design-doc -> source-repo registry
  estate.yml                   # ref-free repo facts
  glossary.md                  # canonical terminology
  conflicts.md                 # open-questions register
  dist/                         # generated build artifact (model.json)
```

## Commands

Run from the repo root via `just` (recipes shell into `architecture/`):

```bash
just arch-dev       # interactive dev server (http://localhost:5173)
just arch-check     # validate syntax + semantics
just arch-model     # export dist/model.json
just arch-build     # build the static site into dist/static
just arch-refresh   # check + model + build — run after any model edit
```

## Update process

1. Decide which **layer** the change touches, then edit the owning file (logical
   capability → `logical/capabilities`; spec/implementation → `logical/technology-catalog`;
   governance role → `logical/governance`; asset kind → `logical/assets`;
   cross-capability edge → `logical/relationships`; service/topology →
   `deployment/deployments`; kinds/tags → `specification`; views →
   `views/logical-views`/`views/deployment-views`/`views/flows`).
2. Make the minimal change. Never add a service/repo/technology name to a logical
   file. Tag designed-but-not-built work `#designed`/`#prototype`. Stay ref-free.
3. Run `just arch-refresh`; commit the `.likec4` sources and `dist/model.json`
   together.

The [`/update-architecture`](../.claude/skills/update-architecture/SKILL.md)
skill automates the traversal across sibling repos and proposes the patches.
