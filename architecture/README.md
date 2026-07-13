# Open Lakehouse — Architecture Model

The **canonical, builder-agnostic source of architectural fact** for the
open-lakehouse (`olai`) estate. It describes the lakehouse at **two altitudes of
one architecture**: an abstract, technology-agnostic **reference** (capabilities +
a zero-trust governance decomposition) and the **concrete** realization (our
services, across three deployment topologies). Audience: **platform architecture**
— not source-level implementation.

This is a [LikeC4](https://likec4.dev) model (diagram-as-code) plus the
architecture-focused prose it links to. It is the single place a structural fact
about the estate lives.

> **Layered by design.** The *logical* model holds only technology-agnostic
> capabilities (catalog, query engine, open table format, object storage, lineage)
> and governance roles (PAP/PDP/PEP/PIP/PA) — **no repo, service, or infra names**.
> Our repos manifest in the *deployment* layer, where a `service` node
> `instanceOf`s the logical elements it realizes (one service can play several
> roles). The concrete is *a realization of* the abstract. See
> [ADR-0003](./adr/ADR-0003-logical-abstract-deployment-concrete.md).

> **Maturity-honest.** Designed-but-not-built elements/edges carry `#designed` (or
> `#prototype`) and render **amber**, so the model never overstates what exists.
> Much of the distributed zero-trust topology is designed, not built — see
> [`design/governance.md`](./design/governance.md).

> **Split of concerns.** *Structural* facts (systems, repos, relationships, the
> planes, flows) live **here**. The *narrative* layer — the "assemble OSS + build
> the gaps" argument, term/naming canon, open framing questions — lives in the
> writing repo (`writing/estate/`) and **references this model**. Rule of thumb:
> *if it's a fact about how the software is structured, it lives here; if it's
> about how we argue, name, or write about it, it stays in writing.*

> **Ref-free by rule.** Like the writing estate, this model carries names, roles,
> and dependency edges only — **never a commit SHA or release tag**. Pinning refs
> would rot instantly across the evolving repos. Downstream consumers pin + verify
> at their own point of use.

---

## Layers & views

The model is one graph rendered through consistent views at three layers:

| Layer | View | What it shows |
|---|---|---|
| Logical | `referenceContext` | The abstract lakehouse: capabilities, people, and the OSS foundations & table formats it assembles on |
| Logical | `capabilityMap` | The capability chain: query engine → catalog → table format → object storage (+ governance, lineage) |
| Logical | `governanceModel` | The zero-trust decomposition (PAP / PDP / PEP / PIP / PA) as logical roles |
| Deployment | `olaiNativeDeploy` | Trusted compute: Envoy gateway = one API surface; hydrofoil enforces full FGAC; who plays each role |
| Deployment | `externalEngineDeploy` | Credential vending: the **FGAC bypass** to an external engine, shown explicitly |
| Deployment | `browserWasmDeploy` | Client-side WASM (axon): signed-URL/proxy, no raw secrets (prototype) |
| Flow | `credentialVending`, `planningTimeCapture`, `policyDecisionFlow`, `fgacBypass` | Dynamic/sequence views (`model/flows.likec4`) |

**Abstract ↔ concrete.** The logical views are the reference architecture; the
deployment views show which concrete service realizes each capability/role, and
how trust (and therefore enforcement location) differs across topologies. This is
how the model resolves the conceptual-vs-specific strain.

## Layout

```
architecture/
  model/                        # LikeC4 source (multi-file, layered)
    specification.likec4        # element kinds (capability/role/foundation/externalEngine/person),
                                #   deploymentNode kinds (gateway/service/browser/datastore/…),
                                #   relationship kinds, maturity + governance-point tags, styles
    landscape.likec4            # LOGICAL: capabilities (catalog/queryEngine/tableFormat/objectStorage/
                                #   lineage/governance) + people + OSS foundations (Delta & Iceberg peer)
    governance.likec4           # LOGICAL: the zero-trust roles (PAP/PDP/PEP/PIP/PA) + their edges
    relationships.likec4        # LOGICAL: the capability chain + realizes/vends/reads edges
    deployments.likec4          # CONCRETE: 3 topologies; services instanceOf capabilities/roles; gateway
    views.likec4                # logical views (referenceContext, capabilityMap, governanceModel)
    deployment-views.likec4     # one deployment view per topology
    flows.likec4                # dynamic/sequence views
    globals.likec4              # shared predicate groups
  design/                       # architecture-focused prose (canonicalDoc link targets)
  adr/                          # estate-level architecture decision records
  canonicals.yaml               # capability/role/service -> design-doc -> source-repo registry
  dist/                         # committed build artifact (model.json)
```

## Design principles

1. **Layered** — logical (abstract, no repo/infra names) vs deployment (concrete,
   `instanceOf`). Repos live only in deployment.
2. **Modular** — one file per concern; never inline everything into one file.
3. **Canonical linkage** — logical elements carry `metadata.canonicalDoc`
   (→ a `design/*.md`); deployment services carry `metadata.sourceRepo` + a GitHub
   `link`. `canonicals.yaml` is the registry over these.
4. **One model, many views** — names/descriptions/relationships stay consistent
   across every view because they come from one model.
5. **Diagram-as-code** — the `.likec4` files are the source of truth; `dist/` is
   generated. No visual editors.
6. **Maturity-honest + ref-free** — `#designed`/`#prototype` mark what isn't built;
   never a SHA or tag.

## Commands

Run from the repo root via `just` (recipes shell into `architecture/`, installing
the LikeC4 toolchain on first run):

```bash
just arch-dev       # interactive dev server (http://localhost:5173)
just arch-check     # validate syntax + semantics (CI-gateable)
just arch-model     # export dist/model.json (agent / interactive-site input)
just arch-build     # build the self-contained interactive static site into dist/static
just arch-refresh   # check + model + build in one step — run after any model edit
```

Under the hood these call `likec4 start|validate|export json|build` (pinned to
`likec4@1.58.0` in `architecture/package.json`).

## Update process

When the architecture changes, first decide **which layer** it touches, then edit
the owning file:

| Change | Owning file |
|---|---|
| New/changed abstract **capability** or OSS foundation / format | `landscape.likec4` |
| New/changed **governance role** or zero-trust edge | `governance.likec4` |
| Capability-chain / realizes / vends / reads edge | `relationships.likec4` |
| New/changed **service, gateway, deployment topology**, or `instanceOf` | `deployments.likec4` |
| New element kind, deploymentNode kind, relationship kind, or tag | `specification.likec4` |
| New logical / deployment / dynamic **view** | `views.likec4` / `deployment-views.likec4` / `flows.likec4` |

Then:

1. Make the **minimal** change. **Repos live only in the deployment layer** — never
   add a repo/service/infra name to the logical files.
2. Keep `metadata.canonicalDoc` on logical elements and `metadata.sourceRepo` +
   GitHub `link` on deployment services. Tags come **first** in an element body;
   inside a deployment node, `metadata`/`link` come **before** `instanceOf`.
3. Tag designed-but-not-built work `#designed`/`#prototype` — don't overstate.
4. If a design doc's scope changed, update the `design/*.md` and `canonicals.yaml`.
5. Run `just arch-refresh`; review the diff; commit the `.likec4` sources **and**
   the regenerated `dist/model.json` together.
6. Keep it ref-free.

The [`/update-architecture`](../.claude/skills/update-architecture/SKILL.md) skill
automates the traversal: it reads `writing/estate/estate.yml` + `storyline.md`
(framing only, one-way) and each affected sibling repo's `docs/`/ADRs, then
proposes the minimal `.likec4` patches.

## Docs-site integration (designed-for, deferred)

Only the small semantic export **`dist/model.json`** is committed — it's what the
docs site (`../site`, Astro/Starlight) or the planned React successor
(`../planning/interactive-docs-site.md`) will consume, and what agents read.

The heavier embeddable outputs are **built on demand**, not carried in git:

- `just arch-build` → `dist/static/` — a self-contained interactive site, plus
  `dist/static/likec4-views.js`, the web-component bundle to embed in Starlight.
- `just arch-model` also emits `dist/likec4-views.js` (standalone bundle).

Wire the embed up in a later milestone. `likec4 mcp` additionally exposes the
model to AI agents.

## Known gaps / deferred

- **No CI freshness gate yet** — `dist/` is regenerated manually via
  `just arch-refresh`; no automated check that it matches the model. Add later
  (validate + `git diff --exit-code architecture/dist/model.json`).
- **Trim `writing/estate/`** — `estate.yml`'s structural-facts role is superseded
  by this model; that repo should be trimmed to the narrative layer and pointed
  here. Tracked as a follow-up in the writing repo.
- **`reference-architecture` reconciliation** — the sibling `reference-architecture`
  repo has existing `diagrams/`; reconcile/absorb rather than duplicate.
