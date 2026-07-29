# docs-factory — internal design & decisions

Design records and decisions about **the docs factory itself** — the tooling that
authors, validates, renders, and ships this repo's content: the preview site
(`site/`), the blog emitters (`emit/`), the review/release server (`server/`), the
`docsnip` content pipeline (`tools/`), and the authoring conventions that tie them
together.

This is deliberately **separate from [`architecture/`](../architecture/)**, which
holds structural fact about the *open-lakehouse* — the systems we document (catalog,
query engine, table formats, governance, the sibling repos). The dividing line is
the estate's own rule (see `architecture/adr/ADR-0002`): *a fact about how the
lakehouse is built lives in `architecture/`; a decision about how this factory works
lives here.* Neither tree should reach into the other's scope.

The three documentation scopes in this repo:

| Scope | Home | What it is |
|---|---|---|
| **Fact** (the lakehouse) | [`architecture/`](../architecture/) | LikeC4 model, design docs, estate ADRs, glossary |
| **Factory** (the tooling) | **`docs/`** (here) | site / emitters / review server / authoring decisions |
| **Narrative** (the story) | [`blogs/`](../blogs/) | `STORYLINE.md`, `CONVENTIONS.md`, the drafts |

## Layout

```
docs/
  decisions/    factory-scoped ADRs (own sequence; see decisions/README.md)
  design/       factory-scoped design & feasibility docs
    authorization-model.md           Cedar PDP for the review server (living study)
    information-system.md            how the site consumes the estate model
    interactive-docs-site.md         islands / roadmap / auth platform study
    multi-domain-single-deployment.md one deployment, three doc domains
  deploy/       operational runbooks
    runbook.md                       go-live provisioning (Neon / Vercel / GitHub)
```

Repo-wide conventions and commands live in [`../AGENTS.md`](../AGENTS.md); this tree
is the *why* behind them.
