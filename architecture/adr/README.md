# Architecture Decision Records

Estate-level architecture decisions — the ones that span repos or constrain how
the open-lakehouse architecture is documented. Per-repo implementation decisions
stay in each repo's own `docs/adr/`.

**Canonical references:** [MADR](https://adr.github.io/madr/) ·
[Nygard (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

---

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](./ADR-0001-likec4-over-structurizr.md) | LikeC4 over Structurizr for the architecture model | Accepted | 2026-07-13 |
| [ADR-0002](./ADR-0002-facts-here-narrative-in-writing.md) | Architectural facts live here; narrative stays in the writing estate | Accepted | 2026-07-13 |
| [ADR-0003](./ADR-0003-logical-abstract-deployment-concrete.md) | Logical layer is abstract; deployment layer is concrete | Accepted | 2026-07-13 |
| [ADR-0004](./ADR-0004-model-driven-information-system.md) | The docs site is a model-driven information system | Proposed | 2026-07-18 |
| [ADR-0005](./ADR-0005-capability-specification-implementation.md) | Capability / specification / implementation typing | Accepted | 2026-07-18 |
| [ADR-0006](./ADR-0006-governed-asset-kinds.md) | Governed asset kinds (securables) as a logical dimension | Accepted | 2026-07-18 |

---

## When to write an ADR

Write one when you can answer **yes** to all of:

1. The decision affects more than one repo or the estate as a whole.
2. It constrains future contributors in a non-obvious way.
3. You evaluated at least two genuine alternatives.
4. A new contributor would reverse it if they didn't know about it.

Version pins, single-file conventions, and formatting choices are **not** ADRs.

## Lifecycle

`Proposed` → `Accepted` → `Superseded` / `Deprecated`. ADRs are immutable once
accepted — supersede with a new one rather than editing the Decision section.

## Template

```markdown
# ADR-NNNN: <Title>

| Field | Value |
|---|---|
| Status | Proposed / Accepted / Superseded / Deprecated |
| Date | YYYY-MM-DD |
| Supersedes | — |
| Superseded by | — |

## Context
What situation required a decision? What forces were in play?

## Considered Options
- **Option A** — <one-line description>
- **Option B** — <one-line description>

## Decision
We chose **Option A**. <Rationale in 1–3 sentences.>

## Consequences
### Positive
### Negative / Trade-offs
```
