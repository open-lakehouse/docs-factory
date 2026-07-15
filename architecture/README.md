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

Narrative (the "why", framing, naming) lives on the writing side and references
this model. If it's a fact about how the software is *structured*, it lives here.

## Layout

```
architecture/
  model/
    specification.likec4      # element/deploymentNode/relationship kinds, tags
    landscape.likec4          # LOGICAL: capabilities + people + OSS foundations
    governance.likec4         # LOGICAL: the zero-trust roles + their edges
    relationships.likec4      # LOGICAL: capability chain + realizes/vends/reads
    deployments.likec4        # DEPLOYMENT: services instanceOf capabilities, per topology
    views.likec4              # logical views
    deployment-views.likec4   # one view per deployment topology
    flows.likec4              # dynamic/sequence views
    globals.likec4            # shared predicate groups
  design/                     # architecture-focused prose (canonicalDoc targets)
  adr/                        # architecture decision records
  canonicals.yaml            # capability/service -> design-doc -> source-repo registry
  estate.yml                 # ref-free repo facts
  glossary.md                # canonical terminology
  conflicts.md               # open-questions register
  dist/                       # generated build artifact (model.json)
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
   capability → `landscape`; governance role → `governance`; cross-capability
   edge → `relationships`; service/topology → `deployments`; kinds/tags →
   `specification`; views → `views`/`deployment-views`/`flows`).
2. Make the minimal change. Never add a service/repo/technology name to a logical
   file. Tag designed-but-not-built work `#designed`/`#prototype`. Stay ref-free.
3. Run `just arch-refresh`; commit the `.likec4` sources and `dist/model.json`
   together.

The [`/update-architecture`](../.claude/skills/update-architecture/SKILL.md)
skill automates the traversal across sibling repos and proposes the patches.
