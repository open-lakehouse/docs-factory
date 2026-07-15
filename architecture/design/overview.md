# Open Lakehouse — architecture overview

The open lakehouse (`olai` — "open lakehouse and ai") is **one system assembled
from open-source foundations plus the connective tissue those foundations don't
ship**. This model describes it at **two altitudes of one architecture**:

- **Reference (abstract):** technology-agnostic capabilities — catalog, query
  engine, open table format, object storage, lineage, and a cross-cutting
  governance decomposition. See [`reference-architecture.md`](./reference-architecture.md)
  and [`governance.md`](./governance.md).
- **Concrete:** our services realizing those capabilities across three
  trust-differentiated deployment topologies. See [`deployments.md`](./deployments.md).

The concrete is *a realization of* the abstract — modeled with LikeC4's deployment
layer (`instanceOf`), so the reference model stays clean of repo/infra names and
one service can play several logical roles. See
[ADR-0003](../adr/ADR-0003-logical-abstract-deployment-concrete.md).

## The capability chain (abstract)

```
  query engine ──resolves──▶ catalog ──▶ open table format ──▶ object storage
       │                        │              (Delta · Iceberg, peer formats)
       ├──▶ governance   (policy decided + enforced at planning time)
       └──▶ lineage      (column-level provenance)
```

Object storage is *where the bytes live*; the open table format is the layer that
turns them into a governed, transactional table.

## The services (concrete realization)

Our repos manifest in the deployment layer, each realizing one or more
capabilities/roles:

| Repo | Realizes | Notes |
|---|---|---|
| **trestle** | (the generator + `stack-topology` gateway) | Proto→Rust codegen; generates the deployment (Envoy + Compose). [notes](./generator.md) |
| **mangrove** | catalog + resource PIP + PA | Pluggable UC framework; credential vending. [capability](./catalog-plane.md) |
| **headwaters** | lineage + dynamic PIP | OpenLineage on DataFusion. [capability](./lineage-plane.md) |
| **breakwater** | PDP/PEP (decide/enforce) | Cedar on DataFusion; embedded in hydrofoil. [governance](./governance.md) |
| **hydrofoil** | query engine + embedded PDP + engine PEP | The integration hub. [notes](./integration-hub.md) |
| **axon** | client query engine (browser) | WASM workbench; signed-URL posture. |

## Cross-cutting

- **Governance / zero-trust** (PAP/PDP/PEP/PIP/PA) — pervasive; realized by
  different services per topology. [`governance.md`](./governance.md).
- **Cross-estate patterns** (composition, agentic CLIs, composable UI) —
  [`patterns.md`](./patterns.md).
- **Cross-cutting concepts** — credential vending, planning-time capture, plug in
  don't fork, FGAC — see [`reference-architecture.md`](./reference-architecture.md)
  and [`governance.md`](./governance.md).
