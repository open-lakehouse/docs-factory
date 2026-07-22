# Agent & contributor notes — `docs-factory`

Orientation for anyone (human or agent) working *in this repo*. This file is a
repo convention; it is **not** published to any docs site.

## What this repo is

The **authoritative content source** for the restructured `delta.io` and
`unitycatalog.io` documentation, plus narrative blog drafts for the open-lakehouse
estate. We author engine-neutral explanations and multi-engine, copy/paste-runnable,
CI-tested examples here, then migrate docs into the sites later. Content is
**builder-agnostic Markdown** (`.md`): richness comes from remark plugins in the
local preview harness, not from JSX or site-specific syntax in the source files.

Narrative (blogs) stays separate from architectural fact (`architecture/`) and from
reference docs (`content/`).

## Layout

```
content/          Diátaxis-organized Markdown (tutorials / how-to / reference / explanation)
blogs/            narrative blog drafts (draft.md + assets/ + snippets/ per post)
emit/             deterministic blog draft → flattened Markdown (Google Docs today)
examples/         real, tested example source — the single source of truth for doc snippets
seed/             docs-factory-seed: deterministic Delta-table seeder (Python + Rust)
tools/docsnip/    content tooling (frontmatter validate, snippet check, manifest, llms.txt)
site/             throwaway Vite + React + MDX preview (docs + blogs; not wired into CI)
site-artifacts/   GENERATED — llms.txt + examples-manifest.json (do not hand-edit)
architecture/     LikeC4 model + design docs + ADRs + estate facts (estate.yml, glossary)
research/         existing research reports (leave alone)
proto/            existing trestle tracker API (leave alone)
```

## Load-bearing conventions

1. **Examples are the source of truth for docs code.** Docs never inline code;
   they reference example files via `remark-code-snippets` fences
   (`file=... start=... end=...`). The preview resolves them live; nothing is
   copied into the page. `docsnip snippetcheck` enforces that every fence resolves.
   Engine-tabbed snippets use neutral `::::tabs` / `:::tab[Label]` directives.

2. **Blog snippets live in `blogs/<slug>/snippets/`.** Same `file=`/`start=`/`end=`
   fence contract; whole-file inlining (`file=` only) is also supported. Blog
   frontmatter is validated separately (see `blogs/CONVENTIONS.md`).

3. **Region markers wrap only what the reader should see.** Put seeding, `main`
   wrappers, and asserts *outside* the `docs-...-start` / `docs-...-end` markers —
   except the `seed_dataset(...)` line for examples that read pre-existing data.

4. **`site-artifacts/` is generated.** Run `uv run docsnip generate` after changing
   content or examples and commit the result. CI (`docsnip check`) fails if stale.

5. **Every content page carries frontmatter.** Required: `title`, `diataxis`,
   `project`. Blog drafts require `title`, `slug`, `status`, `date`, `tags`, `author`,
   `target` (tags must exist in `blogs/tags.yml`).

6. **Richness is a property of the renderer.** Blog constructs (`:::tip`, `::::journey`,
   LikeC4 diagrams) degrade to plain Markdown on GitHub; the preview upgrades them.
   See `blogs/CONVENTIONS.md` §5 and `site/README.md`.

## On each import, reflect on the conventions

When new ideas, drafts, or source material land here, reflect on whether the
experience surfaced a gap in the relevant conventions doc — and **propose a concrete
update** rather than silently working around it. When adding a blog tag, prefer an
existing entry from `blogs/tags.yml`; only add a new tag in the same change.

## Common commands

```bash
uv sync --all-packages                 # install every workspace package
just preview                           # Vite preview at :4321 (docs + blogs)
just emit <slug>                       # flatten a blog draft for Google Docs
uv run pytest examples/tests           # run + verify the Python examples
uv run docsnip check                   # frontmatter + snippets + artifact freshness
uv run docsnip generate                # regenerate site-artifacts/
uv run ruff check . && uv run ty check # lint + types
cargo build --examples                 # compile the Rust example/seed stubs
just arch-dev                          # LikeC4 architecture model at :5173
```

## Adding an engine to an example

The harness already accepts all five engines (python, polars, duckdb, rust, spark).
To promote a stub to built:
1. Fill in `examples/<engine>/<name>.py` (or `.rs`) between the region markers.
2. Add a test in `examples/tests/`.
3. Add the engine to `BUILT_ENGINES` in `tools/docsnip/src/docsnip/manifest.py`.
4. Reference it from the relevant `content/**/*.md` via a snippet fence + a
   `snippets:` frontmatter entry, then `uv run docsnip generate`.

## Blog workflow

Read [`blogs/CONVENTIONS.md`](blogs/CONVENTIONS.md) before working on posts.
Skills in `.claude/skills/{blog-post,blog-review,blog-emit}` automate the lifecycle.
Estate facts for cross-repo posts live in [`architecture/estate.yml`](architecture/estate.yml);
narrative framing in [`blogs/STORYLINE.md`](blogs/STORYLINE.md).
