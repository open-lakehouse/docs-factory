---
name: update-architecture
description: Keep the canonical, LAYERED Open Lakehouse architecture model (LikeC4, in architecture/) in sync with the estate. Logical layer = abstract capabilities + zero-trust governance roles (no repo names); deployment layer = our services realizing them across topologies. Traverses sibling repos' docs/ADRs, proposes minimal .likec4 patches for human approval, then regenerates artifacts. Use when a service/deployment changes, a new capability or governance role appears, an instanceOf mapping changes, or designed work becomes built.
user-invocable: true
version: 0.2.0
---

You maintain the canonical architecture model at `docs-factory/architecture/`.
Your job: fold a structural change into the LikeC4 model as a **minimal** patch,
show it for human approval, then regenerate the committed artifacts. You never
invent facts — you read them from the estate.

## Invocation

```
/update-architecture [--repo <name>] [--summary "what changed"]
```

- `--repo <name>` — the sibling repo whose architecture changed (e.g. `mangrove`).
- `--summary "..."` — freeform description of the change, if known in-session.

With no args, do a full reconciliation pass across all modeled repos.

## Ground rules

1. **Structural facts only.** This model owns *what the systems/repos are and how
   they relate*. Narrative (positioning, naming canon, framing) belongs to
   `writing/estate/` — never fold narrative in here.
2. **One-way from writing.** You MAY read `writing/estate/estate.yml` and
   `storyline.md` for framing, but writing never feeds facts back and this model is
   the source of truth, not `estate.yml`.
3. **Ref-free.** Names, roles, dependency edges only — never a commit SHA or
   release tag.
4. **Minimal patches.** Change the fewest lines. Preserve `metadata.canonicalDoc`
   on logical elements and `metadata.sourceRepo` + GitHub `link` on deployment
   services. Tags come first in an element body.
5. **Respect the layering.** The model is layered:
   - **Logical (abstract):** technology-agnostic capabilities + governance roles.
     **NO repo/service/infra names** ever appear here.
   - **Deployment (concrete):** our repos/services as nodes that `instanceOf` the
     logical elements they realize, across three trust-differentiated topologies.
   A repo change almost always edits the **deployment** layer, not the logical one.
   Only touch logical files if a genuinely new *capability* or *governance role*
   (not a new service) appears.
6. **Maturity honesty.** Tag designed-but-not-built elements/edges `#designed` (or
   `#prototype`). Never present designed work as built. When unsure, check the
   source repo's docs (much of the distributed zero-trust topology is designed).

## Phase 1 — Load current truth

- Read `architecture/canonicals.yaml` (element → design-doc → source-repo registry).
- Read the `architecture/model/*.likec4` files — the current model.
- Optionally read `architecture/dist/model.json` for a resolved view of elements
  and relationships.

## Phase 2 — Gather the change

For the affected repo(s) (from `--repo`, `--summary`, or all in a full pass):

- Read that sibling repo's `README`, `docs/`, and `docs/adr/` (paths are in
  `canonicals.yaml` `source_repo` + the element's `sourceRepo` metadata).
- Cross-check against `writing/estate/estate.yml` for coarse facts — but prefer
  the repo's own docs where they're more specific.
- Determine the delta **and which layer it touches**: a new/changed *service or
  deployment* (concrete)? a new *capability or governance role* (abstract)? a new
  `instanceOf` mapping (which role does a service now play)? a maturity change
  (something moved from designed → built)?

## Phase 3 — Propose the patch

Decide the layer first, then map to the owning file and draft a **minimal** diff:

| Change | Owning file |
|---|---|
| New/changed abstract **capability** or OSS foundation / format | `model/landscape.likec4` |
| New/changed **governance role** or zero-trust edge | `model/governance.likec4` |
| Capability-chain / realizes / vends / reads edge | `model/relationships.likec4` |
| New/changed **service, gateway, topology**, or `instanceOf` | `model/deployments.likec4` |
| New element / deploymentNode / relationship kind, or tag | `model/specification.likec4` |
| New logical / deployment / dynamic **view** | `model/views.likec4` / `deployment-views.likec4` / `flows.likec4` |

- A new **service** goes in `deployments.likec4` as a `service` (or `gateway` /
  `browser` / `datastore`) node inside the right topology, with `metadata` +
  `link` **then** `instanceOf <logical role(s)>`. It realizes existing logical
  capabilities/roles — do **not** invent a new logical element for it unless it
  introduces a genuinely new capability.
- A new **capability/role** goes in the logical layer (tech-agnostic name, a
  `metadata.canonicalDoc`), and is then realized by one or more services.

If a design doc's scope changed, also propose the `design/*.md` edit and the
`canonicals.yaml` update.

**Present the proposed diff and stop for human approval before writing.**

## Phase 4 — Apply + regenerate

After approval:

1. Apply the `.likec4` (and any `design/*.md` / `canonicals.yaml`) edits.
2. Run `just arch-refresh` (validate → export `dist/model.json` → build). Fix any
   validation errors. Common gotchas:
   - Tags come **first** in an element body; metadata keys are plain identifiers
     (no dots/quotes) — use `canonicalDoc`, `sourceRepo`.
   - Inside a **deployment node**, `metadata`/`link` come **before** `instanceOf`.
   - `view of <el>` and `instanceOf <el>` need the **fully-qualified** logical path
     (e.g. `lakehouse.governance.pep`).
   - Deployment relationships connect deployment nodes/instances — you can't use a
     logical actor (a `person`) as an endpoint there.
3. Surface the final diff (sources **and** regenerated `dist/`). Remind the human
   to commit them together.

## Validation quick-reference

- `just arch-check` — validate only.
- `just arch-dev` — interactive preview at http://localhost:5173.
- Element identifiers: letters/digits/`-`/`_`, no leading digit, no periods.
- Relationship kinds use `-[kind]->`; plain edges use `->`.
