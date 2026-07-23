# ADR-0002: Architectural facts live in the model; narrative lives separately

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-13 |
| Supersedes | — |
| Superseded by | — |

## Context

Estate knowledge splits into two concerns that want different homes:

- **Architectural facts** — what the pieces are and how they relate: repos and their
  `depends_on` edges, published-crate patterns, the capability planes, the governance
  decomposition. Diagrammable, builder-agnostic, for a platform-architecture audience.
- **Narrative** — how we *argue about, name, and frame* the estate: the "assemble OSS
  + build the gaps" storyline, term canon, open framing questions, and the writing
  process itself.

Earlier these were tangled in a single consolidated estate map (an `estate.yml` that
mixed semantic facts with story material). Keeping the two together made both harder
to maintain: a build/diagram toolchain fights a writing-input document's charter, and
edits to the argument churned the facts and vice-versa. We wanted a clean,
diagrammable architecture model *and* an unencumbered place for the narrative.

## Considered Options

- **Keep everything in one estate document** and add a diagram toolchain there — but a
  ref-free writing-input file shouldn't carry a build toolchain; the two charters
  conflict.
- **Two independent hand-maintained models** (facts + a duplicate in the narrative
  side) — simple per-file, but guarantees drift between two copies of the same facts.
- **One model of record; narrative references it** — the canonical architectural
  facts live in one diagrammable model here; narrative keeps only the argument and
  points at that model.

## Decision

The **canonical architectural facts live here in `architecture/`** — the LikeC4
model (`model/`) plus its ref-free companions (`estate.yml`, `glossary.md`,
`conflicts.md`). **Narrative lives separately in `blogs/`** — `STORYLINE.md` (the
resolved, opinionated framing), `CONVENTIONS.md` (how we write), and the drafts —
and references this model rather than restating its facts.

Rule of thumb: *structural fact → `architecture/`; how we argue/name/write about it →
`blogs/`.* Both sides keep the **ref-free discipline** (names and edges, never a
commit SHA or release tag); a brief lifts a fact from here and pins it to a ref at
draft time (`blogs/CONVENTIONS.md` §6). The relationship is **one-way**: narrative
reads the model; it never feeds facts back.

This is also the dividing line for the repo's third documentation scope — decisions
about the **docs factory itself** (site, emitters, review server, authoring pipeline)
live in [`../../docs/`](../../docs/README.md), distinct from both the lakehouse facts
here and the narrative in `blogs/`.

> **Historical note.** These facts were originally consolidated in a separate
> `writing` estate repo and moved here when the model was built; the narrative that
> remained there now lives in this repo's `blogs/`. The decision — one model of
> record, narrative references it — is unchanged; only the narrative's location
> (`blogs/`, in-repo) is current.

## Consequences

### Positive
- One source of architectural truth; no two-model drift.
- The narrative side stays about the argument, not the facts.
- The model here is builder-agnostic and diagrammable for a platform audience.

### Negative / Trade-offs
- Narrative and facts must stay loosely coordinated (narrative references a model it
  doesn't own) — mitigated by the one-way rule: narrative never feeds facts back.
- Two ref-free disciplines to hold in sync across `architecture/` and `blogs/`.
