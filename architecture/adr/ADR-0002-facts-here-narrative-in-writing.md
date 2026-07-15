# ADR-0002: Architectural facts live here; narrative stays in the writing estate

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-13 |
| Supersedes | — |
| Superseded by | — |

## Context

`writing/estate/` was the only consolidated map of the estate, but it mixed two
concerns: **architectural facts** (`estate.yml` — repos, `depends_on` edges,
published-crate patterns, the three planes) and **narrative** (`storyline.md`,
`glossary.md`, `conflicts.md` — the "assemble OSS + build the gaps" argument, term
canon, open framing questions, and the writing process). We wanted a clean,
diagrammable architecture model for a platform-architecture audience, and having
the semantic facts tangled with writing-process material made both harder to
maintain.

## Considered Options

- **Keep everything in `writing/estate/`** and add a diagram toolchain there — but
  that repo is deliberately DevRel/writing-input and ref-free-for-briefs; a build
  toolchain fights its charter.
- **Two independent hand-maintained models** (facts here + `estate.yml` there) —
  simple per-repo, but guarantees drift between two copies of the same facts.
- **Move the facts here; writing references back** — one source of architectural
  truth here; writing keeps only the narrative and points at this model.

## Decision

We chose to **move the canonical architectural facts into
`docs-factory/architecture/`** as the LikeC4 model, and **trim `writing/estate/` to
the narrative layer**, referencing this model. Rule of thumb: *structural fact →
here; how we argue/name/write about it → writing.* Both sides keep the ref-free
discipline (names/edges, no SHAs/tags).

## Consequences

### Positive
- One source of architectural truth; no two-model drift.
- The writing estate gets simpler — it's about the argument, not the facts.
- The model here is builder-agnostic and diagrammable for a platform audience.

### Negative / Trade-offs
- `writing/estate/estate.yml` must be trimmed and its cross-references repointed
  (a follow-up in the writing repo; noted as a known gap in the README).
- Two repos now must stay loosely coordinated (writing references a model it
  doesn't own) — mitigated by the one-way rule: writing never feeds facts back.
