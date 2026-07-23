# docs-factory

Authoritative, builder-agnostic content for the open lakehouse documentation
sites and narrative blog drafts.

- **Docs** (`content/`) — Diátaxis-organized reference content for
  [delta.io](https://delta.io) and [unitycatalog.io](https://unitycatalog.io)
- **Blogs** (`blogs/`) — authored posts with custom transpilation (callouts,
  journeys, LikeC4, snippet inlining) and Google Docs emit
- **Architecture** (`architecture/`) — LikeC4 model + canonical estate facts about the
  *lakehouse* we document
- **Design & decisions** (`docs/`) — design records about the *docs factory itself*
  (site, emitters, review server, authoring pipeline)
- **Examples** (`examples/`) — CI-tested snippet source for docs

The three documentation scopes are kept apart: **fact** about the lakehouse lives in
`architecture/`, **decisions about this factory** in `docs/`, and **narrative** in
`blogs/` (see `architecture/adr/ADR-0002`).

```bash
just preview          # unified local preview at :4321 (docs + blogs)
uv run docsnip check    # CI gate: frontmatter, snippets, artifacts
just emit <slug>      # flatten a blog draft for Google Docs
just arch-dev         # architecture model at :5173
```

See [`AGENTS.md`](AGENTS.md) for layout, conventions, and common commands.

Wikipedia articles remain in the sibling [`writing`](../writing) repo.
