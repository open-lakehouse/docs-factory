# Contributing to docs-factory

Thanks for helping with the Delta Lake and Unity Catalog docs. This guide gets
you set up and through your first pull request. For the full set of conventions
and commands, see [`AGENTS.md`](AGENTS.md). It's written for agents, but it's
the most complete reference for people too.

## Set up

Install:

- [uv](https://docs.astral.sh/uv/) (it provides Python 3.11 or later)
- [just](https://just.systems)
- [Bun](https://bun.sh), for the preview, the docs sites, and the emitter
- [Docker](https://docs.docker.com/get-docker/) or [Colima](https://github.com/abiosoft/colima), for the environments examples run against
- [Rust](https://rustup.rs), only if you touch the Rust seeder or Rust examples

Then install the Python workspace:

```bash
uv sync --all-packages
```

## Ways to contribute

- Fix or improve a docs page under `content/`.
- Add a tested example to a page.
- Draft a blog post under `blogs/` (start with
  [`blogs/CONVENTIONS.md`](blogs/CONVENTIONS.md)).
- Open an issue for anything wrong, missing, or unclear.

## Adding a docs page or example

A page with code is a folder: `content/<project>/<bucket>/<slug>/index.md` with
a `snippets/` folder beside it. Each script in `snippets/` runs on its own. Region
markers wrap the lines the reader sees, and the asserts outside them make the
script its own test. The page references a region with a fence instead of
pasting the code. Run `uv run docsnip check` to confirm every fence resolves.

The details are in [`content/README.md`](content/README.md) and in
[Adding a tested snippet to a page](AGENTS.md#adding-a-tested-snippet-to-a-page).

## Review and release

New pages and posts start as `status: draft`. Reviewers comment and approve in
the review app. Once a page is approved, a pull request sets `status: ready`,
and merging that to `main` releases it to the docs sites
([ADR-0002](docs/decisions/ADR-0002-git-ready-is-release.md)). Don't set `ready`
on a page nobody has approved.

## Before you open a pull request

```bash
uv run docsnip check               # frontmatter, snippets, prose, compatibility tables
uv run pytest                      # the tested examples
just test-snippet <page dir>       # one page's scripts, with their environment
uv run ruff check . && uv run ty check
```

If you changed Rust code, also run `cargo fmt --all` and
`cargo clippy --all-targets --all-features -- -D warnings`.

Start and stop environments with `just env-up <name>` and `just env-down`, not
`docker compose`. Environments share host ports, and the recipes make sure two
checkouts don't fight over them.

Write commit messages as `<type>: <subject>`, with one of `feat`, `fix`,
`docs`, `refactor`, `test`, or `chore`, for example
`docs(unitycatalog): add a how-to for managed volumes`.
