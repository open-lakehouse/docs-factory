# Docs-factory Decision Records

Decisions about **the docs factory itself** — the site, emitters, review/release
server, `docsnip` pipeline, and authoring conventions. Decisions about the
*open-lakehouse* (the thing we document) live in
[`architecture/adr/`](../../architecture/adr/README.md); the split follows
`architecture/adr/ADR-0002` — see [`../README.md`](../README.md).

**Canonical references:** [MADR](https://adr.github.io/madr/) ·
[Nygard (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

---

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](./ADR-0001-model-driven-information-system.md) | The docs site is a model-driven information system | Accepted | 2026-07-18 |

---

## When to write an ADR

Write one when you can answer **yes** to all of:

1. The decision shapes how the factory works across more than one tool (site,
   emit, server, docsnip) or sets a lasting authoring contract.
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
