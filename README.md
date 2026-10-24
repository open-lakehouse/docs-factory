# docs-factory

docs-factory is where the open-source **Delta Lake** and **Unity Catalog**
documentation is written and tested before it goes to
[delta.io](https://delta.io) and [unitycatalog.io](https://unitycatalog.io).
Pages are plain Markdown. Every code example is a runnable script that CI runs
against the pinned Delta Lake and Unity Catalog releases, so the examples you
read have actually run.

## What's in the repo

| Path | What it holds |
| --- | --- |
| `content/` | Docs pages for Unity Catalog, Delta Lake, and the open lakehouse, organized by [Diátaxis](https://diataxis.fr): tutorials, how-to guides, reference, and explanation |
| `blogs/` | Long-form blog drafts for unitycatalog.io and delta.io |
| `sites/` | The static docs sites the pages render into |
| `envs/` | Local environments (Docker Compose) that the examples run against |
| `architecture/` | A [LikeC4](https://likec4.dev) model of the open lakehouse: components, capabilities, and compatibility journeys |
| `site/`, `server/` | The review app, where drafts get comments and approvals |
| `docs/` | Design notes and decisions about this repo |

## How examples are tested

Pages never inline code. Each example sits next to its page in a `snippets/`
folder as a self-contained script: Python (with a PEP 723 header), SQL, shell,
Scala, Java, or Rust. The page shows only the marked region, and CI runs the
whole script. Compatibility tables, which list what each engine and client can
read, write, or create, are generated from what those scripts prove rather than
written by hand.

## Quick start

```bash
uv sync --all-packages   # install the Python workspace
uv run docsnip check     # validate frontmatter, snippets, and prose
uv run pytest            # run the tested examples
just uc-docs             # build and preview the Unity Catalog docs at :4322
just delta-docs          # the same for Delta Lake at :4323
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) to get set up and open a pull request.
[`AGENTS.md`](AGENTS.md) has notes for agents and the full command list. Content
conventions live in [`content/README.md`](content/README.md) and
[`blogs/CONVENTIONS.md`](blogs/CONVENTIONS.md).
