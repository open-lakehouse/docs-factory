# ADR-0001: LikeC4 over Structurizr for the architecture model

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-13 |
| Supersedes | — |
| Superseded by | — |

## Context

We needed a diagram-as-code tool for the canonical open-lakehouse architecture
model. The sibling `workflows` repo already runs a mature **C4/Structurizr** setup
(modular DSL, `canonical.doc` linkage, Dockerized `structurizr/structurizr`, a
prune script for an agent-readable JSON), which was the obvious starting point.
Two forces pushed us to re-evaluate: we want **interactive** diagrams the docs
site can embed, and the model should be **LLM-friendly** (the maintenance loop is
agent-driven, and "and AI" is a first-class estate theme).

## Considered Options

- **Structurizr DSL** — the C4 benchmark; strict single-model/multi-view; proven
  in `workflows`. But no first-class interactive embed (SVG/PNG needs Lite or the
  paid cloud product), a Docker/Java toolchain, and a stricter fixed taxonomy.
- **LikeC4** — modern architecture-as-code; a `specification` block for custom
  element kinds/tags; static **and** dynamic/sequence views; interactive React /
  web-component / static-site output; a JSON model export + MCP server for AI; and
  `codegen` to mermaid/dot/d2/plantuml. Node toolchain (fits our existing stack).

## Decision

We chose **LikeC4**. Its interactive output embeds directly into the docs site,
its DSL is LLM-friendly for the agent-driven maintenance loop, and its
**dynamic/sequence views subsume the standalone D2 flow diagrams** we would
otherwise maintain separately — one model, no drift. `workflows`' Structurizr
*conventions* (modular model, element→doc linkage, agent-readable export,
on-demand refresh, ref-free discipline) still inform how we organize and maintain.

## Consequences

### Positive
- Interactive diagrams + a committed JSON model the docs site and agents consume.
- Flows modeled as dynamic views over the same elements — no separate D2 tool.
- Node-only toolchain; no Docker/Java.

### Negative / Trade-offs
- Diverges from `workflows`' Structurizr setup, so the two estates use different
  tools (conventions still shared).
- LikeC4's API surface moves faster than Structurizr's; we pin a version
  (`likec4@1.58.0`) and verify flags on upgrade.
