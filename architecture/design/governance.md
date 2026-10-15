# Governance — the zero-trust decomposition

Governance is a **concern** of the reference lakehouse
([ADR-0007](../adr/ADR-0007-cross-cutting-concerns.md)): its points live in
*different services*, and **where enforcement happens changes with the
deployment**. This doc describes the decomposition.

## Facets in the model

`lakehouse.governance` nests three facet concerns. No single component meets
one alone, so implementations `realize` them, with `#partial` where a
component contributes only alongside another:

| Facet | Contributors in the model |
|---|---|
| `authentication` | Authelia (SSO at the gateway); UC OSS and Lakekeeper `#partial` (validate tokens) |
| `authorization` | UC OSS (grants + privileges); Lakekeeper (OpenFGA permissions); OPA, Authelia, hydrofoil `#partial` (decide, gateway rules, coarse gate) |
| `fineGrainedAccess` | hydrofoil `#partial` (rewrites the plan with row filters + column masks; needs the catalog's resource facts and the policy bundle) |

Unity Catalog OSS has no row filter, column mask, or ABAC API, so it doesn't
contribute to fine-grained access. Which contributors are deployed together is
a property of an environment: `trustedCompute` meets fine-grained access only
because hydrofoil sits in front of the catalog. The zero-trust points below
stay prose, not elements (the role elements were removed in #73). For the deployed services, see [`deployments.md`](./deployments.md).

## The points (NIST 800-207 framing)

| Point | Role | Realized by (olai-native) |
|---|---|---|
| **PAP** — administration | Authors + distributes policy | The Cedar policy set + schema as an OCI bundle (`cedar-oci`) |
| **PDP** — decision (PE) | Decides allow/deny + computes row/column constraints | Embedded Cedar in the query engine (hydrofoil) |
| **PEP** — enforcement | Enforces the decision — rewrites the plan, short-circuits on deny | Engine PEP in-plan (hydrofoil); edge PEP at the gateway (Envoy, auth-on) |
| **PIP** — information | Supplies the facts a decision needs | Catalog = authoritative `resource.*` PIP (mangrove); lineage = dynamic PIP (headwaters) |
| **PA** — administrator | Acts on the verdict — mints a scoped credential | The catalog's authorize-then-vend path (mangrove) |

The decision cycle: **PAP** publishes policy → **PEP** requests a decision for a
request → **PIP** supplies facts → **PDP** returns a verdict + constraints → **PEP**
applies it.

## The decide / enforce split (built)

breakwater's organizing thesis is the **decide / enforce split** the authorization
ecosystem converges on: a policy engine *decides*, a trusted engine *enforces*.

- **Decide** = the engine-neutral `PolicyEngine` trait (Cedar plugs in behind it).
- **Enforce** = a `QueryPlanner` wrapper that injects row `Filter` / column-mask
  `Projection` nodes and short-circuits on `Deny`.

hydrofoil consumes this as **two ordered layers** at query time: a coarse
allow/deny gate, and in-plan RLS/CM from Cedar partial-evaluation residuals. Both
source one OCI policy bundle.

## Built vs designed — do not overstate

The cleanest, most complete zero-trust topology lives in hydrofoil's
`docs/platform-policy-architecture.md`, which is explicitly *"a menu of options
with tradeoffs, not a single prescription."* Much of the distributed topology is
**designed, not built**. The model tags designed-only elements/edges `#designed`
(they render amber).

| Concept | Status |
|---|---|
| decide/enforce split (breakwater `PolicyEngine` + `PolicyQueryPlanner`) | **Built** |
| Two-layer Cedar enforcement (coarse gate + in-plan RLS/CM) | **Built** |
| Catalog as authoritative resource PIP (`TableFacts`, ADR-0006) | **Built** |
| Identity PIP (v1) | **Built** |
| Authorize-then-vend (the PA) | **Built** |
| OCI Cedar bundle (the PAP artifact) | **Built** |
| Edge PEP at the gateway (Envoy `ext_authz`/Authelia) | **Built, opt-in** (`ENVOY_AUTH`) |
| Central / hybrid PDP topology | `#designed` (only embedded is built) |
| Versioned fast-push PAP control plane | `#designed` |
| Non-vendable-governed-table guard (closes the FGAC bypass) | `#designed` |
| Network PIP (`in_trusted_environment`) + session/lineage taint PIPs | `#designed` |
| Agent-tool PEP + taint ledger | `#designed` |
| Per-principal credential vending | `#designed` (today one shared server token — ADR-0011, so *"Cedar is the sole access control"*) |
| Auth interceptor (principal is client-asserted today) | `#designed` |

Source docs: breakwater `docs/pluggable-policy-architecture.md`; hydrofoil
`docs/platform-policy-architecture.md`, `docs/policy-enforcement-design.md`,
`docs/policy-fact-gathering.md`, `docs/adr/0011-*`; mangrove
`crates/object-store/README.md`.

## The sharp point — the credential-vending FGAC bypass

The two-layer guarantee (catalog gates + vends; engine enforces RLS/CM) **holds
only for data that flows through the enforcing engine.** The moment the catalog
vends a raw credential to an *external* engine (Spark, Trino, a raw-S3 notebook),
the Cedar row-filter/column-mask residuals are bypassed and that engine reads raw
files. This is the platform's sharpest limitation (see
[`deployments.md`](./deployments.md), "Outside the boundary"). The designed mitigation:
the catalog *refuses* to vend a raw credential for a governed table, forcing the
query through the enforcing engine.
